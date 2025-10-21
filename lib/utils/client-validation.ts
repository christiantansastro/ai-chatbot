import { createClient } from '@supabase/supabase-js';

/**
 * Client validation utility for file storage
 * Validates that a client name exists in the database before storing files
 */

export interface ClientValidationResult {
  isValid: boolean;
  clientName?: string;
  clientId?: string;
  error?: string;
}

/**
 * Validate that a client name exists in the database
 */
export async function validateClientForFileStorage(clientName: string): Promise<ClientValidationResult> {
  try {
    // Basic validation
    if (!clientName || typeof clientName !== 'string') {
      return {
        isValid: false,
        error: 'Client name is required and must be a string'
      };
    }

    const trimmedName = clientName.trim();

    if (trimmedName.length === 0) {
      return {
        isValid: false,
        error: 'Client name cannot be empty'
      };
    }

    if (trimmedName.length < 2) {
      return {
        isValid: false,
        error: 'Client name must be at least 2 characters long'
      };
    }

    // Check for obviously invalid names
    if (trimmedName.toLowerCase() === 'null' || trimmedName.toLowerCase() === 'undefined') {
      return {
        isValid: false,
        error: 'Invalid client name provided'
      };
    }

    // Search for the client using enhanced search capabilities with RPC
    console.log(`🔍 CLIENT VALIDATION: Searching for client "${trimmedName}" using enhanced search`);

    // Initialize Supabase client for search
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase configuration for client validation');
      return {
        isValid: false,
        error: 'Database configuration error'
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Try RPC search first (most efficient for fuzzy matching)
    try {
      const similarityThreshold = 0.6; // Higher threshold for validation

      const response = await supabase.rpc('search_clients_precise', {
        search_query: trimmedName,
        similarity_threshold: similarityThreshold,
        max_results: 1
      });

      // Handle different response formats
      let data = null;
      if (Array.isArray(response)) {
        data = response;
      } else if (response && typeof response === 'object' && response.data !== undefined) {
        data = response.data;
      } else if (response && typeof response === 'object') {
        data = response;
      }

      // Ensure data is an array
      if (data && !Array.isArray(data)) {
        data = [data];
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const client = data[0];
        console.log(`🔍 CLIENT VALIDATION: Found client ${client.id} for "${trimmedName}" via RPC`);

        return {
          isValid: true,
          clientName: client.client_name || client.name,
          clientId: client.id
        };
      }
    } catch (error) {
      console.warn('RPC search failed, falling back to direct query:', error);
    }

    // Fallback to direct SQL search if RPC fails
    try {
      const searchTerm = `%${trimmedName.toLowerCase()}%`;

      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, client_name')
        .ilike('client_name', searchTerm)
        .limit(1);

      if (error) {
        console.error('Direct search failed:', error);
        return {
          isValid: false,
          error: `Database error: ${error.message}`
        };
      }

      if (!clients || clients.length === 0) {
        console.log(`🔍 CLIENT VALIDATION: No client found for "${trimmedName}"`);
        return {
          isValid: false,
          error: `Client "${trimmedName}" not found. Please check the client name and try again.`
        };
      }

      const client = clients[0];
      console.log(`🔍 CLIENT VALIDATION: Found client ${client.id} for "${trimmedName}" via direct search`);

      return {
        isValid: true,
        clientName: client.client_name,
        clientId: client.id
      };

    } catch (error) {
      console.error('Error during client search:', error);
      return {
        isValid: false,
        error: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

  } catch (error) {
    console.error('Error validating client:', error);
    return {
      isValid: false,
      error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Extract client name from a query string using pattern matching
 */
export function extractClientNameFromQuery(query: string): string | null {
  if (!query || typeof query !== 'string') {
    return null;
  }

  const lowerQuery = query.toLowerCase();

  // Pattern 1: "store this file for [Client Name]"
  const forPattern = /for\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i;
  const forMatch = query.match(forPattern);
  if (forMatch && forMatch[1]) {
    return forMatch[1].trim();
  }

  // Pattern 1b: "store this for [Client Name]" (without "file")
  const thisPattern = /this\s+for\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i;
  const thisMatch = query.match(thisPattern);
  if (thisMatch && thisMatch[1]) {
    return thisMatch[1].trim();
  }

  // Pattern 2: "store file for client [Client Name]"
  const clientPattern = /for\s+client\s+["']?([^"'\s]+(?:\s+[^"'\s]+)*?)["']?(?:\s|$)/i;
  const clientMatch = query.match(clientPattern);
  if (clientMatch && clientMatch[1]) {
    return clientMatch[1].trim();
  }

  // Pattern 3: Look for quoted names
  const quotePattern = /["']([^"']+)["']/;
  const quoteMatch = query.match(quotePattern);
  if (quoteMatch && quoteMatch[1]) {
    return quoteMatch[1].trim();
  }

  // Pattern 4: Look for capitalized words (potential names) - but be more restrictive
  // Only match if we have clear client-indicating patterns
  const hasClientContext = /\b(for|client|with|to)\s+[A-Z]/i.test(query);
  if (hasClientContext) {
    const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const nameMatch = query.match(namePattern);
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 2) {
      return nameMatch[1].trim();
    }
  }

  return null;
}