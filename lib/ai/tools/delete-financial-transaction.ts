import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const deleteFinancialTransaction = tool({
  description: "Delete a financial transaction record from the database. This action cannot be undone and will affect the client's balance calculations. Use with extreme caution.",
  inputSchema: z.object({
    searchQuery: z.string().describe("Transaction ID, case number, or client name to find the transaction to delete"),
    confirmDeletion: z.boolean().describe("Must be true to confirm deletion of the financial transaction"),
  }),
  execute: async ({ searchQuery, confirmDeletion }): Promise<{
    success: boolean;
    message: string;
    deletedTransaction?: any;
  }> => {
    try {
      console.log('🗑️ FINANCIAL DELETE TOOL: Deleting transaction:', searchQuery);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ FINANCIAL DELETE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials'
        };
      }

      if (!confirmDeletion) {
        return {
          success: false,
          message: 'Deletion not confirmed. Set confirmDeletion to true to proceed with transaction deletion.'
        };
      }

      console.log('🗑️ FINANCIAL DELETE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // First, find the transaction to delete
      console.log('🗑️ FINANCIAL DELETE TOOL: Searching for transaction to delete...');

      // Try to find by ID first
      let transactionQuery = supabase
        .from('financials')
        .select('*');

      // If searchQuery looks like a UUID, search by ID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(searchQuery)) {
        transactionQuery = transactionQuery.eq('id', searchQuery);
      } else {
        // Search by case number or client name
        transactionQuery = transactionQuery.or(`case_number.ilike.${searchQuery},client_name.ilike.${searchQuery}`);
      }

      const { data: transactions, error: searchError } = await transactionQuery.limit(1);

      if (searchError) {
        console.error('❌ FINANCIAL DELETE TOOL: Search failed:', searchError);
        return {
          success: false,
          message: `Failed to find transaction: ${searchError.message}`
        };
      }

      if (!transactions || transactions.length === 0) {
        console.log('❌ FINANCIAL DELETE TOOL: No transaction found matching:', searchQuery);
        return {
          success: false,
          message: `No transaction found matching "${searchQuery}". Please check the ID, case number, or client name.`
        };
      }

      const transactionToDelete = transactions[0];
      console.log('✅ FINANCIAL DELETE TOOL: Found transaction to delete:', transactionToDelete.id);

      // Get the transaction details before deletion for the response
      const transactionDetails = {
        id: transactionToDelete.id,
        clientName: transactionToDelete.client_name,
        transactionType: transactionToDelete.transaction_type,
        amount: Number(transactionToDelete.amount),
        paymentMethod: transactionToDelete.payment_method || 'Not specified',
        transactionDate: transactionToDelete.transaction_date,
        paymentDueDate: transactionToDelete.payment_due_date,
        serviceDescription: transactionToDelete.service_description || 'Not provided',
        notes: transactionToDelete.notes || 'No notes',
        caseNumber: transactionToDelete.case_number || 'Not provided'
      };

      // Delete the transaction
      const { error: deleteError } = await supabase
        .from('financials')
        .delete()
        .eq('id', transactionToDelete.id);

      if (deleteError) {
        console.error('❌ FINANCIAL DELETE TOOL: Database deletion failed:', deleteError);
        return {
          success: false,
          message: `Failed to delete transaction: ${deleteError.message}`
        };
      }

      console.log('✅ FINANCIAL DELETE TOOL: Transaction deleted successfully');

      return {
        success: true,
        message: `Successfully deleted ${transactionToDelete.transaction_type} transaction of $${Number(transactionToDelete.amount).toFixed(2)} for ${transactionToDelete.client_name}.`,
        deletedTransaction: {
          ...transactionDetails,
          deletedAt: new Date().toISOString(),
          summary: `${transactionToDelete.transaction_type} of $${Number(transactionToDelete.amount).toFixed(2)} for ${transactionToDelete.client_name} permanently deleted`
        }
      };

    } catch (error) {
      console.error('❌ FINANCIAL DELETE TOOL: Error deleting transaction:', error);
      return {
        success: false,
        message: `Error deleting transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});