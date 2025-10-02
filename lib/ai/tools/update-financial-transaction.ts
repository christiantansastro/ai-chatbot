import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface UpdateFinancialTransactionData {
  transaction_type?: string;
  amount?: number;
  payment_method?: string;
  transaction_date?: string;
  payment_due_date?: string;
  service_description?: string;
  notes?: string;
  case_number?: string;
}

export const updateFinancialTransaction = tool({
  description: "Update an existing financial transaction record by searching for it first, then applying the updates. Can modify transaction details, amounts, dates, and notes.",
  inputSchema: z.object({
    searchQuery: z.string().describe("Transaction ID, case number, or client name to find the transaction to update"),
    transaction_type: z.enum(['quote', 'payment', 'adjustment']).optional().describe("Updated transaction type"),
    amount: z.number().positive().optional().describe("Updated transaction amount (must be positive)"),
    payment_method: z.string().optional().describe("Updated payment method (Cash, Credit Card, Bank Transfer, etc.)"),
    transaction_date: z.string().optional().describe("Updated transaction date (YYYY-MM-DD format)"),
    payment_due_date: z.string().optional().describe("Updated payment due date (YYYY-MM-DD format)"),
    service_description: z.string().optional().describe("Updated description of service provided"),
    notes: z.string().optional().describe("Updated notes about this transaction"),
    case_number: z.string().optional().describe("Updated case or reference number"),
  }),
  execute: async (updateData): Promise<{
    success: boolean;
    message: string;
    transaction: any;
  }> => {
    try {
      console.log('💰 FINANCIAL UPDATE TOOL: Updating transaction:', updateData);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ FINANCIAL UPDATE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          transaction: null
        };
      }

      console.log('💰 FINANCIAL UPDATE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // First, find the transaction to update
      console.log('💰 FINANCIAL UPDATE TOOL: Searching for transaction to update...');

      // Try to find by ID first
      let transactionQuery = supabase
        .from('financials')
        .select('*');

      // If searchQuery looks like a UUID, search by ID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(updateData.searchQuery)) {
        transactionQuery = transactionQuery.eq('id', updateData.searchQuery);
      } else {
        // Search by case number or client name
        transactionQuery = transactionQuery.or(`case_number.ilike.${updateData.searchQuery},client_name.ilike.${updateData.searchQuery}`);
      }

      const { data: transactions, error: searchError } = await transactionQuery.limit(1);

      if (searchError) {
        console.error('❌ FINANCIAL UPDATE TOOL: Search failed:', searchError);
        return {
          success: false,
          message: `Failed to find transaction: ${searchError.message}`,
          transaction: null
        };
      }

      if (!transactions || transactions.length === 0) {
        console.log('❌ FINANCIAL UPDATE TOOL: No transaction found matching:', updateData.searchQuery);
        return {
          success: false,
          message: `No transaction found matching "${updateData.searchQuery}". Please check the ID, case number, or client name.`,
          transaction: null
        };
      }

      const transactionToUpdate = transactions[0];
      console.log('✅ FINANCIAL UPDATE TOOL: Found transaction to update:', transactionToUpdate.id);

      // Prepare the update data (only include fields that are provided)
      const updateFields: UpdateFinancialTransactionData = {};

      if (updateData.transaction_type !== undefined) updateFields.transaction_type = updateData.transaction_type;
      if (updateData.amount !== undefined) updateFields.amount = updateData.amount;
      if (updateData.payment_method !== undefined) updateFields.payment_method = updateData.payment_method;
      if (updateData.transaction_date !== undefined) updateFields.transaction_date = updateData.transaction_date;
      if (updateData.payment_due_date !== undefined) updateFields.payment_due_date = updateData.payment_due_date;
      if (updateData.service_description !== undefined) updateFields.service_description = updateData.service_description;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;
      if (updateData.case_number !== undefined) updateFields.case_number = updateData.case_number;

      console.log('💰 FINANCIAL UPDATE TOOL: Update fields:', updateFields);

      // Update the transaction record
      const { data, error } = await supabase
        .from('financials')
        .update(updateFields)
        .eq('id', transactionToUpdate.id)
        .select()
        .single();

      if (error) {
        console.error('❌ FINANCIAL UPDATE TOOL: Database update failed:', error);
        return {
          success: false,
          message: `Failed to update transaction: ${error.message}`,
          transaction: null
        };
      }

      console.log('✅ FINANCIAL UPDATE TOOL: Transaction updated successfully:', data);

      // Format the response
      const updatedTransaction = {
        id: data.id,
        clientName: data.client_name,
        transactionType: data.transaction_type,
        amount: Number(data.amount),
        paymentMethod: data.payment_method || 'Not specified',
        transactionDate: new Date(data.transaction_date).toLocaleDateString(),
        paymentDueDate: data.payment_due_date ? new Date(data.payment_due_date).toLocaleDateString() : 'Not set',
        serviceDescription: data.service_description || 'Not provided',
        notes: data.notes || 'No notes',
        caseNumber: data.case_number || 'Not provided',
        createdAt: new Date(data.created_at).toLocaleDateString(),
        updatedAt: new Date(data.updated_at).toLocaleDateString(),
        summary: `${data.transaction_type} of $${Number(data.amount).toFixed(2)} for ${data.client_name}`
      };

      return {
        success: true,
        message: `Successfully updated ${data.transaction_type} transaction for ${data.client_name}`,
        transaction: updatedTransaction
      };

    } catch (error) {
      console.error('❌ FINANCIAL UPDATE TOOL: Error updating transaction:', error);
      return {
        success: false,
        message: `Error updating transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        transaction: null
      };
    }
  },
});