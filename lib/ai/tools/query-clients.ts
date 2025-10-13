import { tool } from "ai";
import { z } from "zod";
import { createClient } from '@supabase/supabase-js';

interface ClientData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export const queryClients = tool({
  description: "Query client information from the database with precise matching that prioritizes exact name matches over fuzzy matches. Searches across name, email, phone, address, and contact information. Can also filter by specific criteria like arrest status.",
  inputSchema: z.object({
    query: z.string().optional().describe("Search query with precise matching that prioritizes exact name matches (client name, email, phone, address, or contact information). If not provided, will return all clients or use filter criteria"),
    limit: z.number().optional().default(10).describe("Maximum number of results to return"),
    filterByArrested: z.boolean().optional().describe("Filter to only clients who are arrested (true) or not arrested (false)"),
    filterByIncarcerated: z.boolean().optional().describe("Filter to only clients who are currently incarcerated (true) or not (false)"),
    filterByProbation: z.boolean().optional().describe("Filter to only clients who are on probation (true) or not (false)"),
    filterByParole: z.boolean().optional().describe("Filter to only clients who are on parole (true) or not (false)"),
    clientType: z.enum(["civil", "criminal"]).optional().describe("Filter by client type (civil or criminal)"),
  }),
  execute: async ({ query, limit = 10, filterByArrested, filterByIncarcerated, filterByProbation, filterByParole, clientType }) => {
    try {
      console.log('🔍 CLIENT QUERY TOOL: Starting search for:', { query, limit });

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ CLIENT QUERY TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          results: []
        };
      }

      console.log('🔍 CLIENT QUERY TOOL: Environment variables validated');

      // Create Supabase client directly for this tool
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Enhanced search with fuzzy matching and multiple strategies
      // Allow listing all clients if no query and no filters are provided
      if (!query && !filterByArrested && !filterByIncarcerated && !filterByProbation && !filterByParole && !clientType) {
        console.log('🔍 CLIENT QUERY TOOL: Listing all clients');

        // Get all clients with all fields
        const { data: allClientsFull, error: allClientsFullError } = await supabase
          .from('clients')
          .select('*')
          .order('client_name');

        if (allClientsFullError) {
          console.error('❌ CLIENT QUERY TOOL: Error fetching all clients:', allClientsFullError);
          return {
            success: false,
            message: `Database error: ${allClientsFullError.message}`,
            results: []
          };
        }

        if (allClientsFull && allClientsFull.length > 0) {
          console.log(`✅ CLIENT QUERY TOOL: Found ${allClientsFull.length} clients`);

          const formattedResults = allClientsFull.slice(0, limit).map((client: any, index: number) => ({
            id: client.id || `client_${index + 1}`,
            name: client.client_name,
            email: client.email ? `${client.email} ` : 'Not provided',
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
            message: `Found ${allClientsFull.length} client${allClientsFull.length === 1 ? '' : 's'}`,
            results: formattedResults,
            totalCount: allClientsFull.length
          };
        } else {
          return {
            success: false,
            message: 'No clients found in the database',
            results: []
          };
        }
      }

      const searchTerm = query ? `%${query.toLowerCase()}%` : '';

      console.log('🔍 CLIENT QUERY TOOL: Starting database search strategies');

      // First, let's test basic connectivity by trying to get all clients
      console.log('🔍 CLIENT QUERY TOOL: Testing basic connectivity...');
      const { data: allClients, error: allClientsError } = await supabase
        .from('clients')
        .select('client_name, email, phone')
        .limit(5);

      if (allClientsError) {
        console.error('❌ CLIENT QUERY TOOL: Database connection failed:', allClientsError);
        return {
          success: false,
          message: `Database connection error: ${allClientsError.message}`,
          results: []
        };
      }

      console.log('✅ CLIENT QUERY TOOL: Database connection successful');
      console.log('🔍 CLIENT QUERY TOOL: Found', allClients?.length || 0, 'clients in database');

      // Apply filters if specified
      let filterConditions: string[] = [];
      let filterValues: any = {};

      if (filterByArrested !== undefined) {
        filterConditions.push(`arrested = $${Object.keys(filterValues).length + 1}`);
        filterValues[Object.keys(filterValues).length + 1] = filterByArrested;
      }

      if (filterByIncarcerated !== undefined) {
        filterConditions.push(`currently_incarcerated = $${Object.keys(filterValues).length + 1}`);
        filterValues[Object.keys(filterValues).length + 1] = filterByIncarcerated;
      }

      if (filterByProbation !== undefined) {
        filterConditions.push(`on_probation = $${Object.keys(filterValues).length + 1}`);
        filterValues[Object.keys(filterValues).length + 1] = filterByProbation;
      }

      if (filterByParole !== undefined) {
        filterConditions.push(`on_parole = $${Object.keys(filterValues).length + 1}`);
        filterValues[Object.keys(filterValues).length + 1] = filterByParole;
      }

      if (clientType) {
        filterConditions.push(`client_type = $${Object.keys(filterValues).length + 1}`);
        filterValues[Object.keys(filterValues).length + 1] = clientType;
      }

      // If no text query but we have filters, get all clients and apply filters
      if (!query && filterConditions.length > 0) {
        console.log('🔍 CLIENT QUERY TOOL: Applying filters without text search');

        // Get all clients with all fields for filtering
        const { data: allClientsFull, error: allClientsFullError } = await supabase
          .from('clients')
          .select('*');

        // Apply filters manually since Supabase doesn't support dynamic parameterized queries easily
        let filteredResults: any[] = [];
        if (allClientsFull && !allClientsFullError) {
          filteredResults = allClientsFull.filter(client => {
            if (filterByArrested !== undefined && client.arrested !== filterByArrested) return false;
            if (filterByIncarcerated !== undefined && client.currently_incarcerated !== filterByIncarcerated) return false;
            if (filterByProbation !== undefined && client.on_probation !== filterByProbation) return false;
            if (filterByParole !== undefined && client.on_parole !== filterByParole) return false;
            if (clientType && client.client_type !== clientType) return false;
            return true;
          });
        }

        if (filteredResults.length > 0) {
          console.log(`✅ CLIENT QUERY TOOL: Filter search found ${filteredResults.length} results`);

          const formattedResults = filteredResults.slice(0, limit).map((client: any, index: number) => ({
            id: client.id || `client_${index + 1}`,
            name: client.client_name,
            email: client.email ? `${client.email} ` : 'Not provided',
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
            message: `Found ${filteredResults.length} client${filteredResults.length === 1 ? '' : 's'} matching filter criteria`,
            results: formattedResults,
            totalCount: filteredResults.length
          };
        }
      }

      // Initialize result arrays
      let preciseResults: any[] = [];
      let textResults: any[] = [];
      let wordResults: any[] = [];

      if (query) {
        try {
        console.log('🔍 CLIENT QUERY TOOL: Trying precise search...');
        const { data: preciseData, error: preciseError } = await supabase
          .rpc('search_clients_precise', {
            search_query: query,
            similarity_threshold: 0.6, // Higher threshold for more precise matches
            max_results: limit
          });

        if (!preciseError && preciseData) {
          preciseResults = preciseData;
          console.log(`✅ CLIENT QUERY TOOL: Precise search found ${preciseResults.length} results`);
        } else {
          console.warn('⚠️ CLIENT QUERY TOOL: Precise search failed or not available:', preciseError?.message);
        }
      } catch (preciseErr) {
        console.warn('⚠️ CLIENT QUERY TOOL: Precise search not available, trying basic search:', preciseErr);
      }

      // Strategy 1b: If precise search failed, try basic search function
      if (preciseResults.length === 0) {
        try {
          console.log('🔍 CLIENT QUERY TOOL: Trying basic search function...');
          const { data: basicData, error: basicError } = await supabase
            .rpc('search_clients_basic', {
              search_query: query,
              max_results: limit
            });

          if (!basicError && basicData) {
            preciseResults = basicData;
            console.log(`✅ CLIENT QUERY TOOL: Basic search found ${preciseResults.length} results`);
          } else {
            console.warn('⚠️ CLIENT QUERY TOOL: Basic search failed:', basicError?.message);
          }
        } catch (basicErr) {
          console.warn('⚠️ CLIENT QUERY TOOL: Basic search not available:', basicErr);
        }
      }
      } // Close the if (query) block for precise search

      // Strategy 2: Direct text-based search with intelligent ordering (always works as fallback) - only if we have a query
      if (query) {
      let textResults: any[] = [];
      try {
        console.log('🔍 CLIENT QUERY TOOL: Trying direct text-based search...');

        // First, try to find exact matches
        const { data: exactData, error: exactError } = await supabase
          .from('clients')
          .select('client_name, email, phone, address, contact_1, relationship_1, contact_2, relationship_2, notes, date_intake, date_of_birth, created_at, updated_at')
          .or(`client_name.ilike.${query},email.ilike.${query},phone.ilike.${query}`)
          .order('client_name');

        // Then, try partial matches if no exact matches found
        let partialData: any[] = [];
        if (!exactData || exactData.length === 0) {
          const { data: partialResults, error: partialError } = await supabase
            .from('clients')
            .select('client_name, email, phone, address, contact_1, relationship_1, contact_2, relationship_2, notes, date_intake, date_of_birth, created_at, updated_at')
            .or(`client_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm},contact_1.ilike.${searchTerm},contact_2.ilike.${searchTerm},address.ilike.${searchTerm}`)
            .order('client_name')
            .limit(limit);

          if (!partialError && partialResults) {
            partialData = partialResults;
          }
        }

        // Combine exact and partial results, with exact matches first
        const allTextData: any[] = [...(exactData || []), ...partialData];

        if (allTextData.length > 0) {
          textResults = allTextData.slice(0, limit);
          console.log(`✅ CLIENT QUERY TOOL: Direct text search found ${textResults.length} results`);

          // Log the results for debugging with match priority
          textResults.forEach((result, index) => {
            const isExactMatch = exactData?.some(exact => exact.client_name === result.client_name);
            const matchType = isExactMatch ? 'EXACT' : 'PARTIAL';
            console.log(`   ${index + 1}. ${result.client_name} (${result.email || 'No email'}) - ${matchType}`);
          });
        } else {
          console.warn('⚠️ CLIENT QUERY TOOL: Direct text search found no results');
        }
      } catch (textErr) {
        console.warn('⚠️ CLIENT QUERY TOOL: Direct text search failed:', textErr);
      }

      // Strategy 3: Try individual word matching for better partial results
      let wordResults: any[] = [];
      if (query && query.includes(' ')) {
        const words = query.toLowerCase().split(' ').filter(word => word.length > 2);
        if (words.length > 1) {
          try {
            console.log('🔍 CLIENT QUERY TOOL: Trying word-based search...');
            const wordConditions = words.map(word => {
              const wordTerm = `%${word}%`;
              return `client_name.ilike.${wordTerm}`;
            }).join(',');

            const { data: wordData, error: wordError } = await supabase
              .from('clients')
              .select('*')
              .or(wordConditions)
              .order('client_name')
              .limit(limit);

            if (!wordError && wordData) {
              wordResults = wordData;
              console.log(`✅ CLIENT QUERY TOOL: Word search found ${wordResults.length} results`);
            } else {
              console.warn('⚠️ CLIENT QUERY TOOL: Word search failed:', wordError?.message);
            }
          } catch (wordErr) {
            console.warn('⚠️ CLIENT QUERY TOOL: Word search failed:', wordErr);
          }
        }
      }
      } // Close the if (query) block for text search

      // Combine and deduplicate results with intelligent prioritization
      const allResults = new Map();

      // Helper function to determine if a result is an exact match
      const isExactMatch = (result: any, query: string) => {
        return result.client_name?.toLowerCase() === query.toLowerCase() ||
               result.email?.toLowerCase() === query.toLowerCase() ||
               result.phone?.toLowerCase() === query.toLowerCase();
      };

      // Separate exact matches from partial matches
      const exactMatches: any[] = [];
      const partialMatches: any[] = [];

      // Process precise results
      for (const result of preciseResults) {
        if (query && isExactMatch(result, query)) {
          exactMatches.push({ ...result, matchType: 'exact' });
        } else {
          partialMatches.push({ ...result, matchType: 'precise_partial' });
        }
      }

      // Process text results
      for (const result of textResults) {
        if (query && isExactMatch(result, query)) {
          exactMatches.push({ ...result, matchType: 'exact_text' });
        } else {
          partialMatches.push({ ...result, matchType: 'text_partial' });
        }
      }

      // Process word results
      for (const result of wordResults) {
        if (query && isExactMatch(result, query)) {
          exactMatches.push({ ...result, matchType: 'exact_word' });
        } else {
          partialMatches.push({ ...result, matchType: 'word_partial' });
        }
      }

      // Add exact matches first (highest priority)
      for (const result of exactMatches) {
        allResults.set(result.client_name, result);
      }

      // Add partial matches only if no exact matches found
      if (exactMatches.length === 0) {
        for (const result of partialMatches.slice(0, limit)) {
          if (!allResults.has(result.client_name)) {
            allResults.set(result.client_name, result);
          }
        }
      }

      const clientsList = Array.from(allResults.values()).slice(0, limit);

      console.log(`📊 CLIENT QUERY TOOL: Final results summary:`);
      console.log(`   - Query: "${query}"`);
      console.log(`   - Results found: ${clientsList.length}`);
      console.log(`   - Exact matches: ${exactMatches.length}`);
      console.log(`   - Partial matches: ${partialMatches.length}`);

      // Log which method actually provided the results
      if (clientsList.length > 0) {
        const firstResult = clientsList[0];
        console.log(`   - Primary match type: ${firstResult.matchType}`);
        console.log(`   - Primary result: ${firstResult.client_name}`);

        // Log all results with their match types
        clientsList.forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.client_name} (${result.matchType})`);
        });
      }

      if (clientsList.length === 0) {
        console.log('❌ CLIENT QUERY TOOL: No results found - checking database content...');

        // Let's also check what clients exist in the database
        const { data: allClientsCheck } = await supabase
          .from('clients')
          .select('client_name, email, phone')
          .limit(10);

        console.log('📊 CLIENT QUERY TOOL: Sample clients in database:', allClientsCheck);

        return {
          success: false,
          message: `No clients found matching "${query}". The search tried: precise search, basic search, and direct text search. Please verify that sample data exists in your clients table.`,
          results: []
        };
      }

      // Format the results for display (without expecting id column)
      const formattedResults = clientsList.map((client: any, index: number) => ({
        id: `client_${index + 1}`, // Generate a temporary ID since the table doesn't have one
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
        summary: `${client.client_name} - ${client.email ? client.email + ' ' : 'No email'} (${client.phone || 'No phone'})`
      }));

      return {
        success: true,
        message: `Found ${clientsList.length} client${clientsList.length === 1 ? '' : 's'} matching "${query}"`,
        results: formattedResults,
        totalCount: clientsList.length
      };

    } catch (error) {
      console.error('Error querying clients:', error);
      return {
        success: false,
        message: `Error searching for clients: ${error instanceof Error ? error.message : 'Unknown error'}`,
        results: []
      };
    }
  },
});