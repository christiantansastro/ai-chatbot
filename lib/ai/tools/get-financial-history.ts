import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface TransactionDetail {
  id: string;
  transaction_type: string;
  amount: number;
  transaction_date: string;
  payment_method?: string;
  service_description?: string;
  notes?: string;
  running_balance?: number;
}

export const getFinancialHistory = tool({
  description: "Get detailed financial transaction history for a client, including all quotes, payments, and adjustments with running balance calculations.",
  inputSchema: z.object({
    clientName: z.string().describe("Name of the client to get financial history for"),
    limit: z.number().optional().default(20).describe("Maximum number of transactions to return (default: 20)"),
    includeRunningBalance: z.boolean().optional().default(true).describe("Whether to calculate and include running balance for each transaction"),
    transactionType: z.enum(['all', 'quote', 'payment', 'adjustment']).optional().default('all').describe("Filter by transaction type"),
  }),
  execute: async ({ clientName, limit = 20, includeRunningBalance = true, transactionType = 'all' }): Promise<{
    success: boolean;
    message: string;
    client: {
      id: string;
      name: string;
      total_quoted: number;
      total_paid: number;
      current_balance: number;
    } | null;
    transactions: TransactionDetail[];
    summary: {
      total_transactions: number;
      total_quotes: number;
      total_payments: number;
      total_adjustments: number;
    };
  }> => {
    try {
      console.log('📊 FINANCIAL HISTORY TOOL: Getting history for:', { clientName, limit, transactionType });

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ FINANCIAL HISTORY TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          client: null,
          transactions: [],
          summary: { total_transactions: 0, total_quotes: 0, total_payments: 0, total_adjustments: 0 }
        };
      }

      console.log('📊 FINANCIAL HISTORY TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Find the client by name
      console.log('📊 FINANCIAL HISTORY TOOL: Finding client...');

      // First try to find in clients table
      let { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('id, client_name')
        .ilike('client_name', clientName)
        .limit(1);

      // If clients table doesn't exist or no client found, check if financials table has client_name column
      if (clientError || !clients || clients.length === 0) {
        console.log('📊 FINANCIAL HISTORY TOOL: Clients table not available or client not found, checking financials table...');

        // Check if financials table has client_name column (standalone version)
        const { data: financialClients, error: financialError } = await supabase
          .from('financials')
          .select('client_name')
          .ilike('client_name', clientName)
          .limit(1);

        if (!financialError && financialClients && financialClients.length > 0) {
          // Use the client name directly since we're in standalone mode
          clients = [{ id: null, client_name: clientName }];
          console.log('📊 FINANCIAL HISTORY TOOL: Using standalone mode with client name');
        } else {
          console.log('❌ FINANCIAL HISTORY TOOL: Client not found in either table');
        }
      }

      if (clientError) {
        console.error('❌ FINANCIAL HISTORY TOOL: Client search failed:', clientError);
        return {
          success: false,
          message: `Failed to find client: ${clientError.message}`,
          client: null,
          transactions: [],
          summary: { total_transactions: 0, total_quotes: 0, total_payments: 0, total_adjustments: 0 }
        };
      }

      if (!clients || clients.length === 0) {
        console.log('❌ FINANCIAL HISTORY TOOL: Client not found:', clientName);
        return {
          success: false,
          message: `Client "${clientName}" not found. Please check the name and try again.`,
          client: null,
          transactions: [],
          summary: { total_transactions: 0, total_quotes: 0, total_payments: 0, total_adjustments: 0 }
        };
      }

      const client = clients[0];
      console.log('✅ FINANCIAL HISTORY TOOL: Found client:', client.client_name);

      // Get current balance summary
      console.log('📊 FINANCIAL HISTORY TOOL: Getting balance summary...');

      let balanceData = null;
      let balanceError = null;

      if (client.id) {
        // Use the optimized function if we have client_id
        const result = await supabase
          .rpc('get_client_balance', {
            client_uuid: client.id
          });
        balanceData = result.data;
        balanceError = result.error;
      } else {
        // Calculate balance manually for standalone mode
        const { data: manualBalanceData, error: manualBalanceError } = await supabase
          .from('financials')
          .select('transaction_type, amount')
          .eq('client_name', client.client_name);

        if (!manualBalanceError && manualBalanceData) {
          let totalQuoted = 0;
          let totalPaid = 0;

          manualBalanceData.forEach((transaction: any) => {
            if (transaction.transaction_type === 'quote') {
              totalQuoted += Number(transaction.amount);
            } else {
              totalPaid += Number(transaction.amount);
            }
          });

          balanceData = [{
            total_quoted: totalQuoted,
            total_paid: totalPaid,
            balance: totalQuoted - totalPaid,
            transaction_count: manualBalanceData.length
          }];
        }
      }

      if (balanceError) {
        console.warn('⚠️ FINANCIAL HISTORY TOOL: Could not get balance:', balanceError);
      }

      // Build query for transactions
      let query = supabase
        .from('financials')
        .select('*')
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      // Add client filter based on what's available
      if (client.id) {
        query = query.eq('client_id', client.id);
      } else {
        // Use client name filter (standalone mode)
        query = query.eq('client_name', client.client_name);
      }

      // Apply transaction type filter
      if (transactionType !== 'all') {
        query = query.eq('transaction_type', transactionType);
      }

      console.log('📊 FINANCIAL HISTORY TOOL: Fetching transactions...');
      const { data: transactions, error: transactionsError } = await query;

      if (transactionsError) {
        console.error('❌ FINANCIAL HISTORY TOOL: Transactions query failed:', transactionsError);
        return {
          success: false,
          message: `Failed to get transaction history: ${transactionsError.message}`,
          client: null,
          transactions: [],
          summary: { total_transactions: 0, total_quotes: 0, total_payments: 0, total_adjustments: 0 }
        };
      }

      console.log(`✅ FINANCIAL HISTORY TOOL: Retrieved ${transactions?.length || 0} transactions`);

      // Calculate running balance if requested
      let runningBalance = 0;
      const processedTransactions: TransactionDetail[] = [];

      if (includeRunningBalance && transactions) {
        // Get all transactions in chronological order for accurate running balance
        const { data: allTransactions, error: allTransactionsError } = await supabase
          .from('financials')
          .select('*')
          .eq('client_id', client.id)
          .order('transaction_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (!allTransactionsError && allTransactions) {
          // Calculate running balance starting from 0
          let currentBalance = 0;
          for (const transaction of allTransactions) {
            if (transaction.transaction_type === 'quote') {
              currentBalance += Number(transaction.amount);
            } else {
              currentBalance -= Number(transaction.amount);
            }

            processedTransactions.push({
              id: transaction.id,
              transaction_type: transaction.transaction_type,
              amount: Number(transaction.amount),
              transaction_date: transaction.transaction_date,
              payment_method: transaction.payment_method || undefined,
              service_description: transaction.service_description || undefined,
              notes: transaction.notes || undefined,
              running_balance: currentBalance
            });
          }

          // Sort by date descending for display (most recent first)
          processedTransactions.reverse();
        }
      } else if (transactions) {
        // Just format without running balance
        processedTransactions.push(...transactions.map((transaction: any) => ({
          id: transaction.id,
          transaction_type: transaction.transaction_type,
          amount: Number(transaction.amount),
          transaction_date: transaction.transaction_date,
          payment_method: transaction.payment_method || undefined,
          service_description: transaction.service_description || undefined,
          notes: transaction.notes || undefined,
        })));
      }

      // Calculate summary statistics
      const summary = {
        total_transactions: transactions?.length || 0,
        total_quotes: transactions?.filter(t => t.transaction_type === 'quote').length || 0,
        total_payments: transactions?.filter(t => t.transaction_type === 'payment').length || 0,
        total_adjustments: transactions?.filter(t => t.transaction_type === 'adjustment').length || 0,
      };

      // Format client info
      const clientInfo = {
        id: client.id,
        name: client.client_name,
        total_quoted: balanceData ? Number(balanceData[0]?.total_quoted || 0) : 0,
        total_paid: balanceData ? Number(balanceData[0]?.total_paid || 0) : 0,
        current_balance: balanceData ? Number(balanceData[0]?.balance || 0) : 0,
      };

      // Format message
      let message = `Found ${summary.total_transactions} transaction${summary.total_transactions === 1 ? '' : 's'} for ${client.client_name}.`;
      if (summary.total_quotes > 0) message += ` ${summary.total_quotes} quote${summary.total_quotes === 1 ? '' : 's'}.`;
      if (summary.total_payments > 0) message += ` ${summary.total_payments} payment${summary.total_payments === 1 ? '' : 's'}.`;
      if (summary.total_adjustments > 0) message += ` ${summary.total_adjustments} adjustment${summary.total_adjustments === 1 ? '' : 's'}.`;

      if (clientInfo.current_balance > 0) {
        message += ` Current balance: $${clientInfo.current_balance.toFixed(2)}.`;
      } else if (clientInfo.current_balance < 0) {
        message += ` Credit balance: $${Math.abs(clientInfo.current_balance).toFixed(2)}.`;
      } else {
        message += ' Account is fully paid.';
      }

      return {
        success: true,
        message,
        client: clientInfo,
        transactions: processedTransactions,
        summary
      };

    } catch (error) {
      console.error('❌ FINANCIAL HISTORY TOOL: Error getting financial history:', error);
      return {
        success: false,
        message: `Error getting financial history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        client: null,
        transactions: [],
        summary: { total_transactions: 0, total_quotes: 0, total_payments: 0, total_adjustments: 0 }
      };
    }
  },
});