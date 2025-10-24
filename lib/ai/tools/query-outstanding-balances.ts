import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface OutstandingBalance {
  client_id: string;
  client_name: string;
  total_quoted: number;
  total_paid: number;
  balance: number;
  transaction_count: number;
}

export const queryOutstandingBalances = tool({
  description: "Query all clients with outstanding balances. Returns a list of clients where total quoted amount exceeds total payments.",
  inputSchema: z.object({
    limit: z.number().optional().default(50).describe("Maximum number of clients to return"),
  }),
  execute: async ({ limit = 50 }): Promise<{
    success: boolean;
    message: string;
    clients: OutstandingBalance[];
  }> => {
    try {
      console.log('💰 OUTSTANDING BALANCES TOOL: Querying clients with outstanding balances');

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ OUTSTANDING BALANCES TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          clients: []
        };
      }

      console.log('💰 OUTSTANDING BALANCES TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Query for clients with outstanding balances
      console.log('💰 OUTSTANDING BALANCES TOOL: Querying outstanding balances...');

      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select(`
          id,
          client_name,
          financials!left(
            transaction_type,
            amount
          )
        `)
        .limit(limit * 10); // Fetch more to account for grouping

      if (clientsError) {
        console.error('❌ OUTSTANDING BALANCES TOOL: Database query failed:', clientsError);
        return {
          success: false,
          message: `Failed to query outstanding balances: ${clientsError.message}`,
          clients: []
        };
      }

      if (!clientsData || clientsData.length === 0) {
        console.log('💰 OUTSTANDING BALANCES TOOL: No clients found');
        return {
          success: true,
          message: 'No clients found in the database.',
          clients: []
        };
      }

      // Process the data to calculate balances
      const outstandingClients: OutstandingBalance[] = [];

      for (const client of clientsData) {
        const financials = client.financials || [];

        let totalQuoted = 0;
        let totalPaid = 0;
        let transactionCount = 0;

        for (const transaction of financials) {
          transactionCount++;
          const amount = Number(transaction.amount);

          if (transaction.transaction_type === 'quote') {
            totalQuoted += amount;
          } else if (transaction.transaction_type === 'payment' || transaction.transaction_type === 'adjustment') {
            totalPaid += amount;
          }
        }

        const balance = totalQuoted - totalPaid;

        if (balance > 0) {
          outstandingClients.push({
            client_id: client.id,
            client_name: client.client_name,
            total_quoted: totalQuoted,
            total_paid: totalPaid,
            balance: balance,
            transaction_count: transactionCount
          });
        }
      }

      // Sort by balance descending
      outstandingClients.sort((a, b) => b.balance - a.balance);

      // Limit the results
      const limitedClients = outstandingClients.slice(0, limit);

      console.log(`✅ OUTSTANDING BALANCES TOOL: Found ${limitedClients.length} clients with outstanding balances`);

      let message = `Found ${limitedClients.length} client${limitedClients.length === 1 ? '' : 's'} with outstanding balances.`;

      if (limitedClients.length > 0) {
        message += ' Here are the details:';
        for (const client of limitedClients) {
          message += `\n- ${client.client_name}: $${client.balance.toFixed(2)} outstanding (quoted: $${client.total_quoted.toFixed(2)}, paid: $${client.total_paid.toFixed(2)})`;
        }
      }

      return {
        success: true,
        message,
        clients: limitedClients
      };

    } catch (error) {
      console.error('❌ OUTSTANDING BALANCES TOOL: Error querying outstanding balances:', error);
      return {
        success: false,
        message: `Error querying outstanding balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        clients: []
      };
    }
  },
});