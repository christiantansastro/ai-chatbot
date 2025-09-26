import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface FinancialSummary {
  client_id: string;
  client_name: string;
  total_quoted: number;
  total_paid: number;
  balance: number;
  transaction_count: number;
  latest_transaction_date: string;
}

export const queryFinancialBalance = tool({
  description: "Query financial balance and transaction summary for clients. Can search by client name and returns total quoted, paid, and remaining balance amounts.",
  inputSchema: z.object({
    clientName: z.string().describe("Name of the client to get financial information for"),
    includeHistory: z.boolean().optional().default(false).describe("Whether to include recent transaction history"),
    historyLimit: z.number().optional().default(5).describe("Number of recent transactions to include if includeHistory is true"),
  }),
  execute: async ({ clientName, includeHistory = false, historyLimit = 5 }): Promise<{
    success: boolean;
    message: string;
    financialSummary: FinancialSummary | null;
    recentTransactions?: any[];
  }> => {
    try {
      console.log('💰 FINANCIAL BALANCE TOOL: Querying balance for:', clientName);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ FINANCIAL BALANCE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          financialSummary: null
        };
      }

      console.log('💰 FINANCIAL BALANCE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Search for the client and get financial summary
      console.log('💰 FINANCIAL BALANCE TOOL: Searching for client financial data...');

      // First try the optimized function
      let { data: financialData, error: financialError } = await supabase
        .rpc('search_financials_by_client', {
          search_query: clientName,
          max_results: 10
        });

      // If the function doesn't exist, fall back to direct query
      if (financialError && financialError.message?.includes('function') && financialError.message?.includes('does not exist')) {
        console.log('💰 FINANCIAL BALANCE TOOL: Optimized function not available, using fallback query...');
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('financials')
          .select(`
            *,
            clients!inner(client_name)
          `)
          .ilike('clients.client_name', `%${clientName}%`)
          .limit(10);

        if (!fallbackError && fallbackData) {
          // Transform the data to match expected format
          const transformedData = fallbackData.map(item => ({
            client_id: item.client_id,
            client_name: item.clients?.client_name || 'Unknown',
            total_quoted: item.transaction_type === 'quote' ? Number(item.amount) : 0,
            total_paid: item.transaction_type === 'payment' ? Number(item.amount) : 0,
            balance: item.transaction_type === 'quote' ? Number(item.amount) : -Number(item.amount),
            transaction_count: 1,
            latest_transaction_date: item.transaction_date
          }));

          financialData = transformedData;
          financialError = null;
        }
      }

      if (financialError) {
        console.error('❌ FINANCIAL BALANCE TOOL: Database query failed:', financialError);
        return {
          success: false,
          message: `Failed to query financial data: ${financialError.message}`,
          financialSummary: null
        };
      }

      if (!financialData || financialData.length === 0) {
        console.log('❌ FINANCIAL BALANCE TOOL: No financial records found for:', clientName);
        return {
          success: false,
          message: `No financial records found for "${clientName}". The client may not exist or may not have any financial transactions.`,
          financialSummary: null
        };
      }

      const summary = financialData[0];
      console.log('✅ FINANCIAL BALANCE TOOL: Found financial summary:', summary);

      // Format the financial summary
      const financialSummary: FinancialSummary = {
        client_id: summary.client_id,
        client_name: summary.client_name,
        total_quoted: Number(summary.total_quoted),
        total_paid: Number(summary.total_paid),
        balance: Number(summary.balance),
        transaction_count: Number(summary.transaction_count),
        latest_transaction_date: summary.latest_transaction_date || 'No transactions'
      };

      let recentTransactions = [];
      if (includeHistory && financialSummary.transaction_count > 0) {
        console.log('💰 FINANCIAL BALANCE TOOL: Fetching recent transactions...');
        const { data: historyData, error: historyError } = await supabase
          .rpc('get_client_recent_transactions', {
            client_uuid: summary.client_id,
            limit_count: historyLimit
          });

        if (!historyError && historyData) {
          recentTransactions = historyData.map((transaction: any) => ({
            id: transaction.id,
            type: transaction.transaction_type,
            amount: Number(transaction.amount),
            date: transaction.transaction_date,
            payment_method: transaction.payment_method || 'Not specified',
            service: transaction.service_description || 'Not specified',
            notes: transaction.notes || 'No notes'
          }));
          console.log(`✅ FINANCIAL BALANCE TOOL: Retrieved ${recentTransactions.length} recent transactions`);
        }
      }

      // Format the response message
      let message = '';
      if (financialSummary.balance > 0) {
        message = `${financialSummary.client_name} has a total quoted amount of $${financialSummary.total_quoted.toFixed(2)} and has paid $${financialSummary.total_paid.toFixed(2)}, leaving a remaining balance of $${financialSummary.balance.toFixed(2)}.`;
      } else if (financialSummary.balance < 0) {
        message = `${financialSummary.client_name} has overpaid by $${Math.abs(financialSummary.balance).toFixed(2)}. They have a credit balance of $${Math.abs(financialSummary.balance).toFixed(2)}.`;
      } else {
        message = `${financialSummary.client_name} has no outstanding balance. All quoted amounts have been paid in full.`;
      }

      if (financialSummary.transaction_count > 0) {
        message += ` (${financialSummary.transaction_count} transaction${financialSummary.transaction_count === 1 ? '' : 's'})`;
      }

      return {
        success: true,
        message,
        financialSummary,
        recentTransactions: recentTransactions.length > 0 ? recentTransactions : undefined
      };

    } catch (error) {
      console.error('❌ FINANCIAL BALANCE TOOL: Error querying financial balance:', error);
      return {
        success: false,
        message: `Error querying financial balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        financialSummary: null
      };
    }
  },
});