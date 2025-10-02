import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const deleteClient = tool({
  description: "Delete a client record from the database. This action cannot be undone and will also delete all associated financial transactions and communications. Use with extreme caution.",
  inputSchema: z.object({
    searchQuery: z.string().describe("Name, email, or phone number to find the client to delete"),
    confirmDeletion: z.boolean().describe("Must be true to confirm deletion of the client and all associated data"),
  }),
  execute: async ({ searchQuery, confirmDeletion }): Promise<{
    success: boolean;
    message: string;
    deletedClient?: any;
  }> => {
    try {
      console.log('🗑️ CLIENT DELETE TOOL: Deleting client:', searchQuery);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ CLIENT DELETE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials'
        };
      }

      if (!confirmDeletion) {
        return {
          success: false,
          message: 'Deletion not confirmed. Set confirmDeletion to true to proceed with client deletion.'
        };
      }

      console.log('🗑️ CLIENT DELETE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // First, find the client to delete
      console.log('🗑️ CLIENT DELETE TOOL: Searching for client to delete...');
      const { data: searchResults, error: searchError } = await supabase
        .from('clients')
        .select('*')
        .or(`client_name.ilike.${searchQuery},email.ilike.${searchQuery},phone.ilike.${searchQuery}`)
        .limit(1);

      if (searchError) {
        console.error('❌ CLIENT DELETE TOOL: Search failed:', searchError);
        return {
          success: false,
          message: `Failed to find client: ${searchError.message}`
        };
      }

      if (!searchResults || searchResults.length === 0) {
        console.log('❌ CLIENT DELETE TOOL: No client found matching:', searchQuery);
        return {
          success: false,
          message: `No client found matching "${searchQuery}". Please check the name, email, or phone number.`
        };
      }

      const clientToDelete = searchResults[0];
      console.log('✅ CLIENT DELETE TOOL: Found client to delete:', clientToDelete.client_name);

      // Get counts of related records before deletion
      const { count: financialCount, error: financialCountError } = await supabase
        .from('financials')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientToDelete.id);

      const { count: communicationCount, error: communicationCountError } = await supabase
        .from('communications')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientToDelete.id);

      console.log(`🗑️ CLIENT DELETE TOOL: Client has ${financialCount || 0} financial records and ${communicationCount || 0} communications`);

      // Delete the client (this will cascade delete related records due to foreign key constraints)
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete.id);

      if (deleteError) {
        console.error('❌ CLIENT DELETE TOOL: Database deletion failed:', deleteError);
        return {
          success: false,
          message: `Failed to delete client: ${deleteError.message}`
        };
      }

      console.log('✅ CLIENT DELETE TOOL: Client deleted successfully');

      // Format the response
      const deletedClient = {
        id: clientToDelete.id,
        name: clientToDelete.client_name,
        email: clientToDelete.email || 'Not provided',
        phone: clientToDelete.phone || 'Not provided',
        financialRecordsDeleted: financialCount || 0,
        communicationRecordsDeleted: communicationCount || 0,
        deletedAt: new Date().toISOString(),
        summary: `${clientToDelete.client_name} and all associated data permanently deleted`
      };

      return {
        success: true,
        message: `Successfully deleted client "${clientToDelete.client_name}" and ${financialCount || 0} financial records, ${communicationCount || 0} communications.`,
        deletedClient
      };

    } catch (error) {
      console.error('❌ CLIENT DELETE TOOL: Error deleting client:', error);
      return {
        success: false,
        message: `Error deleting client: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});