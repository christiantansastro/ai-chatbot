import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface TransactionResult {
  id: string;
  client_id: string;
  client_name: string;
  transaction_type: string;
  amount: number;
  payment_method?: string;
  transaction_date: string;
  service_description?: string;
  notes?: string;
  new_balance: number;
}

export const addFinancialTransaction = tool({
  description: "Add a new financial transaction (quote, payment, or adjustment) to a client's account. Can create quotes for services, record payments received, or make adjustments to balances.",
  inputSchema: z.object({
    clientName: z.string().describe("Name of the client for this transaction"),
    transactionType: z.enum(['quote', 'payment', 'adjustment']).describe("Type of transaction: 'quote' for billing, 'payment' for money received, 'adjustment' for corrections"),
    amount: z.number().positive().describe("Transaction amount (must be positive)"),
    paymentMethod: z.string().optional().describe("Payment method (Cash, Credit Card, Bank Transfer, etc.) - required for payments"),
    caseNumber: z.string().optional().describe("Case or reference number for this transaction"),
    serviceDescription: z.string().optional().describe("Description of service provided (for quotes) or reason for transaction"),
    notes: z.string().optional().describe("Additional notes about this transaction"),
    transactionDate: z.string().optional().describe("Transaction date in YYYY-MM-DD format (defaults to today)"),
  }),
  execute: async (transactionData): Promise<{
    success: boolean;
    message: string;
    transaction: TransactionResult | null;
    balanceUpdate?: {
      total_quoted: number;
      total_paid: number;
      new_balance: number;
    };
  }> => {
    try {
      console.log('💰 FINANCIAL TRANSACTION TOOL: Adding transaction:', transactionData);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ FINANCIAL TRANSACTION TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          transaction: null
        };
      }

      console.log('💰 FINANCIAL TRANSACTION TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Find the client by name
      console.log('💰 FINANCIAL TRANSACTION TOOL: Finding client...');

      // First try to find in clients table
      let { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('id, client_name')
        .ilike('client_name', transactionData.clientName)
        .limit(1);

      // If clients table doesn't exist or no client found, check if financials table has client_name column
      if (clientError || !clients || clients.length === 0) {
        console.log('💰 FINANCIAL TRANSACTION TOOL: Clients table not available or client not found, checking financials table...');

        // Check if financials table has client_name column (standalone version)
        const { data: financialClients, error: financialError } = await supabase
          .from('financials')
          .select('client_name')
          .ilike('client_name', transactionData.clientName)
          .limit(1);

        if (!financialError && financialClients && financialClients.length > 0) {
          // Use the client name directly since we're in standalone mode
          clients = [{ id: null, client_name: transactionData.clientName }];
          console.log('💰 FINANCIAL TRANSACTION TOOL: Using standalone mode with client name');
        } else {
          console.log('❌ FINANCIAL TRANSACTION TOOL: Client not found in either table');
        }
      }

      if (clientError) {
        console.error('❌ FINANCIAL TRANSACTION TOOL: Client search failed:', clientError);
        return {
          success: false,
          message: `Failed to find client: ${clientError.message}`,
          transaction: null
        };
      }

      if (!clients || clients.length === 0) {
        console.log('❌ FINANCIAL TRANSACTION TOOL: Client not found:', transactionData.clientName);
        return {
          success: false,
          message: `Client "${transactionData.clientName}" not found. Please check the name and try again.`,
          transaction: null
        };
      }

      const client = clients[0];
      console.log('✅ FINANCIAL TRANSACTION TOOL: Found client:', client.client_name);

      // Validate payment method for payments
      if (transactionData.transactionType === 'payment' && !transactionData.paymentMethod) {
        return {
          success: false,
          message: 'Payment method is required for payment transactions.',
          transaction: null
        };
      }

      // Prepare transaction data
      const transaction: any = {
        case_number: transactionData.caseNumber || null,
        transaction_type: transactionData.transactionType,
        amount: transactionData.amount,
        payment_method: transactionData.paymentMethod || null,
        transaction_date: transactionData.transactionDate || new Date().toISOString().split('T')[0],
        service_description: transactionData.serviceDescription || null,
        notes: transactionData.notes || null,
      };

      // Add client reference based on what's available
      if (client.id) {
        transaction.client_id = client.id;
      } else {
        // Use client name directly (standalone mode)
        transaction.client_name = client.client_name;
      }

      console.log('💰 FINANCIAL TRANSACTION TOOL: Inserting transaction:', transaction);

      // Insert the transaction
      const { data: insertedTransaction, error: insertError } = await supabase
        .from('financials')
        .insert(transaction)
        .select()
        .single();

      if (insertError) {
        console.error('❌ FINANCIAL TRANSACTION TOOL: Transaction insert failed:', insertError);
        return {
          success: false,
          message: `Failed to add transaction: ${insertError.message}`,
          transaction: null
        };
      }

      console.log('✅ FINANCIAL TRANSACTION TOOL: Transaction added successfully:', insertedTransaction);

      // Get updated balance
      console.log('💰 FINANCIAL TRANSACTION TOOL: Calculating new balance...');
      const { data: balanceData, error: balanceError } = await supabase
        .rpc('get_client_balance', {
          client_uuid: client.id
        });

      if (balanceError) {
        console.warn('⚠️ FINANCIAL TRANSACTION TOOL: Could not get updated balance:', balanceError);
      }

      // Format the result
      const result: TransactionResult = {
        id: insertedTransaction.id,
        client_id: insertedTransaction.client_id,
        client_name: client.client_name,
        transaction_type: insertedTransaction.transaction_type,
        amount: Number(insertedTransaction.amount),
        payment_method: insertedTransaction.payment_method,
        transaction_date: insertedTransaction.transaction_date,
        service_description: insertedTransaction.service_description,
        notes: insertedTransaction.notes,
        new_balance: balanceData ? Number(balanceData[0]?.balance || 0) : 0
      };

      // Create balance update info
      const balanceUpdate = balanceData ? {
        total_quoted: Number(balanceData[0]?.total_quoted || 0),
        total_paid: Number(balanceData[0]?.total_paid || 0),
        new_balance: Number(balanceData[0]?.balance || 0)
      } : undefined;

      // Format success message based on transaction type
      let message = '';
      switch (transactionData.transactionType) {
        case 'quote':
          message = `Successfully created quote of $${transactionData.amount.toFixed(2)} for ${client.client_name}`;
          if (transactionData.serviceDescription) {
            message += ` for "${transactionData.serviceDescription}"`;
          }
          message += '.';
          break;
        case 'payment':
          message = `Successfully recorded payment of $${transactionData.amount.toFixed(2)} from ${client.client_name} via ${transactionData.paymentMethod}`;
          if (balanceUpdate && balanceUpdate.new_balance > 0) {
            message += `. Remaining balance: $${balanceUpdate.new_balance.toFixed(2)}.`;
          } else if (balanceUpdate && balanceUpdate.new_balance <= 0) {
            message += '. Account is now fully paid.';
          }
          break;
        case 'adjustment':
          message = `Successfully recorded adjustment of $${transactionData.amount.toFixed(2)} for ${client.client_name}`;
          if (transactionData.serviceDescription) {
            message += ` for "${transactionData.serviceDescription}"`;
          }
          if (balanceUpdate && balanceUpdate.new_balance !== 0) {
            message += `. New balance: $${balanceUpdate.new_balance.toFixed(2)}.`;
          }
          break;
      }

      return {
        success: true,
        message,
        transaction: result,
        balanceUpdate
      };

    } catch (error) {
      console.error('❌ FINANCIAL TRANSACTION TOOL: Error adding transaction:', error);
      return {
        success: false,
        message: `Error adding transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        transaction: null
      };
    }
  },
});