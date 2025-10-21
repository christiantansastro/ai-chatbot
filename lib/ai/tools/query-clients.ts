import { tool } from "ai";
import { z } from "zod";
import { createClient } from '@supabase/supabase-js';

interface SearchParams {
 supabase: any;
 query?: string;
 limit: number;
 filterByArrested?: boolean;
 filterByIncarcerated?: boolean;
 filterByProbation?: boolean;
 filterByParole?: boolean;
 clientType?: 'civil' | 'criminal';
 fuzzyThreshold: number;
 searchId: string;
}

interface SearchResult {
 success: boolean;
 message: string;
 results: any[];
 totalCount: number;
 searchMethod?: string;
 debugInfo?: any;
}

// Enhanced logging utility
function logWithContext(searchId: string, level: 'info' | 'warn' | 'error', message: string, data?: any) {
 const timestamp = new Date().toISOString();
 const prefix = `🔍 CLIENT QUERY TOOL [${searchId}]:`;

 switch (level) {
   case 'info':
     console.log(`${prefix} ${message}`, data ? { ...data, timestamp } : { timestamp });
     break;
   case 'warn':
     console.warn(`${prefix} ${message}`, data ? { ...data, timestamp } : { timestamp });
     break;
   case 'error':
     console.error(`${prefix} ${message}`, data ? { ...data, timestamp } : { timestamp });
     break;
 }
}

// Calculate string similarity using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
 const s1 = str1.toLowerCase();
 const s2 = str2.toLowerCase();

 if (s1 === s2) return 1.0;

 const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));

 for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
 for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

 for (let j = 1; j <= s2.length; j++) {
   for (let i = 1; i <= s1.length; i++) {
     const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
     matrix[j][i] = Math.min(
       matrix[j][i - 1] + 1,     // deletion
       matrix[j - 1][i] + 1,     // insertion
       matrix[j - 1][i - 1] + indicator // substitution
     );
   }
 }

 const distance = matrix[s2.length][s1.length];
 const maxLength = Math.max(s1.length, s2.length);
 return maxLength === 0 ? 1.0 : (maxLength - distance) / maxLength;
}

// Enhanced RPC search with better error handling and response parsing
async function tryRpcSearch(supabase: any, query: string | undefined, limit: number, fuzzyThreshold: number, searchId: string): Promise<any[]> {
 if (!query) return [];

 logWithContext(searchId, 'info', `Attempting RPC search for "${query}" with threshold ${fuzzyThreshold}`);

 try {
   // Use the fuzzyThreshold parameter for similarity threshold
   const similarityThreshold = Math.max(0.1, Math.min(0.9, fuzzyThreshold));

   const response = await supabase.rpc('search_clients_precise', {
     search_query: query,
     similarity_threshold: similarityThreshold,
     max_results: limit
   });

   logWithContext(searchId, 'info', 'RPC Response received', {
     responseType: typeof response,
     isArray: Array.isArray(response),
     hasData: response?.data !== undefined,
     dataType: typeof response?.data,
     dataIsArray: Array.isArray(response?.data)
   });

   // Handle different response formats more robustly
   let data = null;

   if (Array.isArray(response)) {
     data = response;
   } else if (response && typeof response === 'object' && response.data !== undefined) {
     data = response.data;
   } else if (response && typeof response === 'object') {
     // If response is an object but not wrapped in data, treat it as a single result
     data = response;
   }

   // Ensure data is an array
   if (data && !Array.isArray(data)) {
     data = [data];
   }

   if (data && Array.isArray(data) && data.length > 0) {
     logWithContext(searchId, 'info', `RPC search successful, found ${data.length} results`);
     return data;
   } else {
     logWithContext(searchId, 'warn', 'RPC search returned no valid data');
     return [];
   }
 } catch (error) {
   logWithContext(searchId, 'warn', 'RPC search failed', { error: error instanceof Error ? error.message : String(error) });
   return [];
 }
}

// Enhanced direct SQL search with fuzzy matching
async function tryDirectSqlSearch(supabase: any, query: string | undefined, limit: number, fuzzyThreshold: number, searchId: string): Promise<any[]> {
 if (!query) return [];

 logWithContext(searchId, 'info', `Attempting direct SQL search for "${query}" with threshold ${fuzzyThreshold}`);

 try {
   const searchTerm = `%${query.toLowerCase()}%`;

   // Build search conditions for multiple fields
   const searchFields = [
     'client_name', 'email', 'phone', 'address', 'contact_1', 'contact_2',
     'notes', 'county', 'case_type', 'charges'
   ];

   // Create OR conditions for all searchable fields
   const orConditions = searchFields.map(field => `${field}.ilike.${searchTerm}`).join(',');

   const { data, error } = await supabase
     .from('clients')
     .select('*')
     .or(orConditions)
     .order('client_name')
     .limit(limit);

   if (error) {
     logWithContext(searchId, 'warn', 'Direct SQL search failed', { error: error.message });
     return [];
   }

   if (data && data.length > 0) {
     // Apply fuzzy matching filter if needed
     let filteredData: any[] = data;
     if (fuzzyThreshold < 0.8) {
       filteredData = data.filter((client: any) => {
         const nameSimilarity = calculateSimilarity(client.client_name || '', query || '');
         return nameSimilarity >= fuzzyThreshold;
       });
     }

     logWithContext(searchId, 'info', `Direct SQL search found ${filteredData.length} results`);
     return filteredData;
   }

   logWithContext(searchId, 'warn', 'Direct SQL search returned no results');
   return [];
 } catch (error) {
   logWithContext(searchId, 'error', 'Direct SQL search error', { error: error instanceof Error ? error.message : String(error) });
   return [];
 }
}

// Word-based search for complex multi-word queries
async function tryWordBasedSearch(supabase: any, query: string | undefined, limit: number, searchId: string): Promise<any[]> {
 if (!query || !query.includes(' ')) return [];

 logWithContext(searchId, 'info', `Attempting word-based search for "${query}"`);

 try {
   const words = query.toLowerCase().split(' ').filter(word => word.length > 2);
   if (words.length <= 1) return [];

   // Create conditions for each word
   const wordConditions = words.map(word => {
     const wordTerm = `%${word}%`;
     return `client_name.ilike.${wordTerm}`;
   }).join(',');

   const { data, error } = await supabase
     .from('clients')
     .select('*')
     .or(wordConditions)
     .order('client_name')
     .limit(limit);

   if (error) {
     logWithContext(searchId, 'warn', 'Word-based search failed', { error: error.message });
     return [];
   }

   if (data && data.length > 0) {
     logWithContext(searchId, 'info', `Word-based search found ${data.length} results`);
     return data;
   }

   return [];
 } catch (error) {
   logWithContext(searchId, 'error', 'Word-based search error', { error: error instanceof Error ? error.message : String(error) });
   return [];
 }
}

// Modular search orchestrator with comprehensive fallback strategy
async function performClientSearch(params: SearchParams): Promise<SearchResult> {
 const { supabase, query, limit, fuzzyThreshold, searchId } = params;

 logWithContext(searchId, 'info', 'Starting enhanced client search', {
   query,
   limit,
   fuzzyThreshold,
   hasFilters: !!(params.filterByArrested || params.filterByIncarcerated || params.filterByProbation || params.filterByParole || params.clientType)
 });

 try {
   // Strategy 1: Try RPC function first (most efficient for fuzzy matching)
   if (query) {
     const rpcResults = await tryRpcSearch(supabase, query, limit, fuzzyThreshold, searchId);
     if (rpcResults.length > 0) {
       logWithContext(searchId, 'info', `RPC search successful, found ${rpcResults.length} results`);
       return formatSearchResults(rpcResults, limit, 'rpc', searchId);
     }
   }

   // Strategy 2: Fall back to direct SQL search
   if (query) {
     const directResults = await tryDirectSqlSearch(supabase, query, limit, fuzzyThreshold, searchId);
     if (directResults.length > 0) {
       logWithContext(searchId, 'info', `Direct SQL search successful, found ${directResults.length} results`);
       return formatSearchResults(directResults, limit, 'direct_sql', searchId);
     }
   }

   // Strategy 3: Final fallback to word-based search for multi-word queries
   if (query && query.includes(' ')) {
     const wordResults = await tryWordBasedSearch(supabase, query, limit, searchId);
     if (wordResults.length > 0) {
       logWithContext(searchId, 'info', `Word-based search successful, found ${wordResults.length} results`);
       return formatSearchResults(wordResults, limit, 'word_search', searchId);
     }
   }

   // Strategy 4: If no query but filters provided, get all clients and apply filters
   if (!query && (params.filterByArrested !== undefined || params.filterByIncarcerated !== undefined ||
       params.filterByProbation !== undefined || params.filterByParole !== undefined || params.clientType)) {
     const filteredResults = await tryFilteredSearch(supabase, params, searchId);
     if (filteredResults.length > 0) {
       logWithContext(searchId, 'info', `Filtered search found ${filteredResults.length} results`);
       return formatSearchResults(filteredResults, limit, 'filtered', searchId);
     }
   }

   // Strategy 5: If no query and no filters, return all clients (with limit)
   if (!query) {
     const allResults = await tryGetAllClients(supabase, limit, searchId);
     if (allResults.length > 0) {
       logWithContext(searchId, 'info', `Get all clients found ${allResults.length} results`);
       return formatSearchResults(allResults, limit, 'all_clients', searchId);
     }
   }

   // No results found
   logWithContext(searchId, 'warn', 'No results found with any search strategy');
   return {
     success: false,
     message: `No clients found matching "${query || 'all clients'}". Searched using multiple strategies.`,
     results: [],
     totalCount: 0,
     searchMethod: 'exhaustive',
     debugInfo: {
       query,
       fuzzyThreshold,
       strategiesAttempted: ['rpc', 'direct_sql', 'word_search', 'filtered', 'all_clients'],
       timestamp: new Date().toISOString()
     }
   };

 } catch (error) {
   logWithContext(searchId, 'error', 'Search failed with error', {
     error: error instanceof Error ? error.message : String(error)
   });
   return {
     success: false,
     message: `Error searching for clients: ${error instanceof Error ? error.message : 'Unknown error'}`,
     results: [],
     totalCount: 0,
     searchMethod: 'error',
     debugInfo: {
       error: error instanceof Error ? error.message : String(error),
       timestamp: new Date().toISOString()
     }
   };
 }
}

// Helper function for filtered searches (no query, but filters applied)
async function tryFilteredSearch(supabase: any, params: SearchParams, searchId: string): Promise<any[]> {
 try {
   const { data, error } = await supabase
     .from('clients')
     .select('*');

   if (error) {
     logWithContext(searchId, 'warn', 'Filtered search database error', { error: error.message });
     return [];
   }

   if (!data) return [];

   // Apply filters manually
   let filteredResults: any[] = data.filter((client: any) => {
     if (params.filterByArrested !== undefined && client.arrested !== params.filterByArrested) return false;
     if (params.filterByIncarcerated !== undefined && client.currently_incarcerated !== params.filterByIncarcerated) return false;
     if (params.filterByProbation !== undefined && client.on_probation !== params.filterByProbation) return false;
     if (params.filterByParole !== undefined && client.on_parole !== params.filterByParole) return false;
     if (params.clientType && client.client_type !== params.clientType) return false;
     return true;
   });

   return filteredResults;
 } catch (error) {
   logWithContext(searchId, 'error', 'Filtered search error', { error: error instanceof Error ? error.message : String(error) });
   return [];
 }
}

// Helper function to get all clients
async function tryGetAllClients(supabase: any, limit: number, searchId: string): Promise<any[]> {
 try {
   const { data, error } = await supabase
     .from('clients')
     .select('*')
     .order('client_name')
     .limit(limit);

   if (error) {
     logWithContext(searchId, 'warn', 'Get all clients database error', { error: error.message });
     return [];
   }

   return data || [];
 } catch (error) {
   logWithContext(searchId, 'error', 'Get all clients error', { error: error instanceof Error ? error.message : String(error) });
   return [];
 }
}

// Format search results with comprehensive metadata
function formatSearchResults(results: any[], limit: number, method: string, searchId: string): SearchResult {
 const limitedResults = results.slice(0, limit);

 logWithContext(searchId, 'info', `Formatting ${limitedResults.length} results using ${method} method`);

 const formattedResults = limitedResults.map((client: any, index: number) => ({
   id: client.id || `client_${index + 1}`,
   name: client.client_name,
   email: client.email || 'Not provided',
   phone: client.phone || 'Not provided',
   dateOfBirth: client.date_of_birth ? new Date(client.date_of_birth).toLocaleDateString() : 'Not provided',
   address: client.address || 'Not provided',
   contact1: client.contact_1 || 'Not provided',
   relationship1: client.relationship_1 || 'Not provided',
   contact2: client.contact_2 || 'Not provided',
   relationship2: client.relationship_2 || 'Not provided',
   notes: client.notes || 'No notes',
   intakeDate: client.date_intake ? new Date(client.date_intake).toLocaleDateString() : 'Not provided',
   lastUpdated: client.updated_at ? new Date(client.updated_at).toLocaleDateString() : 'Not provided',
   arrested: client.arrested !== undefined ? (client.arrested ? 'Yes' : 'No') : 'Not specified',
   arrestedCounty: client.arrested_county || 'Not provided',
   currentlyIncarcerated: client.currently_incarcerated !== undefined ? (client.currently_incarcerated ? 'Yes' : 'No') : 'Not specified',
   onProbation: client.on_probation !== undefined ? (client.on_probation ? 'Yes' : 'No') : 'Not specified',
   onParole: client.on_parole !== undefined ? (client.on_parole ? 'Yes' : 'No') : 'Not specified',
   clientType: client.client_type || 'Not specified',
   summary: `${client.client_name} (${client.client_type || 'Unspecified'}) - ${client.email ? client.email + ' ' : 'No email'} (${client.phone || 'No phone'})`
 }));

 return {
   success: true,
   message: `Found ${limitedResults.length} client${limitedResults.length === 1 ? '' : 's'}`,
   results: formattedResults,
   totalCount: limitedResults.length,
   searchMethod: method,
   debugInfo: {
     originalResultCount: results.length,
     limitedResultCount: limitedResults.length,
     searchMethod: method,
     timestamp: new Date().toISOString()
   }
 };
}

export const queryClients = tool({
  description: "Advanced client search with intelligent matching, fuzzy search capabilities, and robust fallback strategies. Use this tool for finding clients by name, email, phone, or other criteria. Features: exact matching, partial matching, typo tolerance, and comprehensive result prioritization.",
  inputSchema: z.object({
    query: z.string().optional().describe("Search term for client lookup. Supports: 'Jeremy' (exact), 'Jermy' (typo-tolerant), 'jeremy@example.com' (email), partial names, and fuzzy matching"),
    limit: z.number().optional().default(10).describe("Maximum results to return (1-50)"),
    filterByArrested: z.boolean().optional().describe("Filter clients by arrest status"),
    filterByIncarcerated: z.boolean().optional().describe("Filter clients by incarceration status"),
    filterByProbation: z.boolean().optional().describe("Filter clients by probation status"),
    filterByParole: z.boolean().optional().describe("Filter clients by parole status"),
    clientType: z.enum(["civil", "criminal"]).optional().describe("Filter by client type"),
    fuzzyThreshold: z.number().optional().default(0.3).describe("Fuzzy matching threshold (0.1-0.9) for typo tolerance"),
  }),
  execute: async ({ query, limit = 10, filterByArrested, filterByIncarcerated, filterByProbation, filterByParole, clientType, fuzzyThreshold = 0.3 }) => {
    const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      console.log(`🔍 CLIENT QUERY TOOL [${searchId}]: Starting search for:`, { query, limit, fuzzyThreshold });

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error(`❌ CLIENT QUERY TOOL [${searchId}]: Missing Supabase environment variables`);
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          results: []
        };
      }

      console.log(`🔍 CLIENT QUERY TOOL [${searchId}]: Environment variables validated`);

      // Create Supabase client directly for this tool
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Modular search approach
      const searchResults = await performClientSearch({
        supabase,
        query,
        limit,
        filterByArrested,
        filterByIncarcerated,
        filterByProbation,
        filterByParole,
        clientType,
        fuzzyThreshold,
        searchId
      });

      return searchResults;

   } catch (error) {
     logWithContext(searchId, 'error', 'Error querying clients', {
       error: error instanceof Error ? error.message : String(error)
     });
     return {
       success: false,
       message: `Error searching for clients: ${error instanceof Error ? error.message : 'Unknown error'}`,
       results: []
     };
   }
 },
});