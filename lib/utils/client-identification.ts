import { createClient } from '@supabase/supabase-js';

interface ClientReference {
  name: string;
  confidence: number;
  position: {
    start: number;
    end: number;
  };
}

interface ClientIdentificationResult {
  success: boolean;
  clients: ClientReference[];
  message?: string;
}

/**
 * Identifies client references in message text using pattern matching and fuzzy search
 */
export async function identifyClientsInText(text: string): Promise<ClientIdentificationResult> {
  try {
    // Pattern 1: "for client [Name]" or "client [Name]"
    const clientPattern1 = /(?:for\s+client|client)\s+([A-Za-z\s]+?)(?:\s|$|[.,!?])/gi;
    const clientMatches1 = Array.from(text.matchAll(clientPattern1), match => ({
      name: match[1].trim(),
      confidence: 0.8,
      position: {
        start: match.index || 0,
        end: (match.index || 0) + match[0].length
      }
    }));

    // Pattern 2: "regarding [Name]" or "about [Name]"
    const clientPattern2 = /(?:regarding|about|re:|for)\s+([A-Za-z\s]+?)(?:\s|$|[.,!?])/gi;
    const clientMatches2 = Array.from(text.matchAll(clientPattern2), match => ({
      name: match[1].trim(),
      confidence: 0.6,
      position: {
        start: match.index || 0,
        end: (match.index || 0) + match[0].length
      }
    }));

    // Pattern 3: Client names in quotes or parentheses
    const clientPattern3 = /(?:client|case)\s*(?:is|:)?\s*[""]([A-Za-z\s]+?)[""]|\(([A-Za-z\s]+?)\)/gi;
    const clientMatches3 = Array.from(text.matchAll(clientPattern3), match => {
      const name = (match[1] || match[2] || '').trim();
      return name ? {
        name,
        confidence: 0.7,
        position: {
          start: match.index || 0,
          end: (match.index || 0) + match[0].length
        }
      } : null;
    }).filter(Boolean) as ClientReference[];

    // Combine all matches and remove duplicates
    const allMatches = [...clientMatches1, ...clientMatches2, ...clientMatches3];

    if (allMatches.length === 0) {
      return {
        success: false,
        clients: [],
        message: 'No client references found in message'
      };
    }

    // Remove duplicates based on name similarity
    const uniqueClients = removeDuplicateClients(allMatches);

    // If we have potential clients, try to validate them against the database
    if (uniqueClients.length > 0) {
      const validatedClients = await validateClientsAgainstDatabase(uniqueClients);

      return {
        success: validatedClients.length > 0,
        clients: validatedClients,
        message: validatedClients.length > 0
          ? `Found ${validatedClients.length} client reference(s)`
          : 'No matching clients found in database'
      };
    }

    return {
      success: false,
      clients: [],
      message: 'No valid client references found'
    };

  } catch (error) {
    console.error('Error identifying clients in text:', error);
    return {
      success: false,
      clients: [],
      message: `Error identifying clients: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Validates potential client names against the database
 */
async function validateClientsAgainstDatabase(clientReferences: ClientReference[]): Promise<ClientReference[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials not available for client validation');
      return clientReferences;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const validatedClients: ClientReference[] = [];

    for (const clientRef of clientReferences) {
      try {
        // Search for the client in the database
        const { data, error } = await supabase
          .from('clients')
          .select('id, client_name')
          .ilike('client_name', `%${clientRef.name}%`)
          .limit(3);

        if (error) {
          console.warn(`Error searching for client "${clientRef.name}":`, error);
          continue;
        }

        if (data && data.length > 0) {
          // If we find exact or partial matches, consider it validated
          validatedClients.push({
            ...clientRef,
            confidence: Math.min(clientRef.confidence + 0.2, 1.0) // Boost confidence
          });
        }
      } catch (error) {
        console.warn(`Error validating client "${clientRef.name}":`, error);
      }
    }

    return validatedClients;
  } catch (error) {
    console.error('Error validating clients against database:', error);
    return clientReferences; // Return original references if validation fails
  }
}

/**
 * Removes duplicate client references based on name similarity
 */
function removeDuplicateClients(clients: ClientReference[]): ClientReference[] {
  const unique: ClientReference[] = [];

  for (const client of clients) {
    const isDuplicate = unique.some(existing =>
      calculateSimilarity(existing.name, client.name) > 0.8
    );

    if (!isDuplicate) {
      unique.push(client);
    }
  }

  return unique;
}

/**
 * Calculates similarity between two strings using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

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

/**
 * Extracts the most likely client reference from identified clients
 */
export function getPrimaryClientReference(clients: ClientReference[]): ClientReference | null {
  if (clients.length === 0) return null;
  if (clients.length === 1) return clients[0];

  // Prioritize by confidence, then by position (earlier in text)
  return clients.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) > 0.1) {
      return b.confidence - a.confidence; // Higher confidence first
    }
    return a.position.start - b.position.start; // Earlier position first
  })[0];
}