import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const deleteCommunication = tool({
  description: "Delete a communication record from the database. This action cannot be undone and will remove the communication from the client's history. Use with extreme caution.",
  inputSchema: z.object({
    searchQuery: z.string().describe("Communication ID, client name, or subject to find the communication to delete"),
    confirmDeletion: z.boolean().describe("Must be true to confirm deletion of the communication record"),
  }),
  execute: async ({ searchQuery, confirmDeletion }): Promise<{
    success: boolean;
    message: string;
    deletedCommunication?: any;
  }> => {
    try {
      console.log('🗑️ COMMUNICATION DELETE TOOL: Deleting communication:', searchQuery);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ COMMUNICATION DELETE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials'
        };
      }

      if (!confirmDeletion) {
        return {
          success: false,
          message: 'Deletion not confirmed. Set confirmDeletion to true to proceed with communication deletion.'
        };
      }

      console.log('🗑️ COMMUNICATION DELETE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // First, find the communication to delete
      console.log('🗑️ COMMUNICATION DELETE TOOL: Searching for communication to delete...');

      // Try to find by ID first
      let communicationQuery = supabase
        .from('communications')
        .select('*');

      // If searchQuery looks like a UUID, search by ID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(searchQuery)) {
        communicationQuery = communicationQuery.eq('id', searchQuery);
      } else {
        // Search by subject or client name
        communicationQuery = communicationQuery.or(`subject.ilike.${searchQuery},client_name.ilike.${searchQuery}`);
      }

      const { data: communications, error: searchError } = await communicationQuery.limit(1);

      if (searchError) {
        console.error('❌ COMMUNICATION DELETE TOOL: Search failed:', searchError);
        return {
          success: false,
          message: `Failed to find communication: ${searchError.message}`
        };
      }

      if (!communications || communications.length === 0) {
        console.log('❌ COMMUNICATION DELETE TOOL: No communication found matching:', searchQuery);
        return {
          success: false,
          message: `No communication found matching "${searchQuery}". Please check the ID, subject, or client name.`
        };
      }

      const communicationToDelete = communications[0];
      console.log('✅ COMMUNICATION DELETE TOOL: Found communication to delete:', communicationToDelete.id);

      // Get the communication details before deletion for the response
      const communicationDetails = {
        id: communicationToDelete.id,
        clientName: communicationToDelete.client_name,
        communicationDate: communicationToDelete.communication_date,
        communicationType: communicationToDelete.communication_type,
        direction: communicationToDelete.direction,
        priority: communicationToDelete.priority,
        subject: communicationToDelete.subject || 'Not provided',
        notes: communicationToDelete.notes,
        followUpRequired: communicationToDelete.follow_up_required,
        followUpDate: communicationToDelete.follow_up_date,
        followUpNotes: communicationToDelete.follow_up_notes || 'No follow-up notes',
        relatedCaseNumber: communicationToDelete.related_case_number || 'Not provided',
        courtDate: communicationToDelete.court_date,
        durationMinutes: communicationToDelete.duration_minutes,
        outcome: communicationToDelete.outcome || 'Not specified',
        nextAction: communicationToDelete.next_action || 'No action specified',
        createdBy: communicationToDelete.created_by || 'Not specified'
      };

      // Delete the communication
      const { error: deleteError } = await supabase
        .from('communications')
        .delete()
        .eq('id', communicationToDelete.id);

      if (deleteError) {
        console.error('❌ COMMUNICATION DELETE TOOL: Database deletion failed:', deleteError);
        return {
          success: false,
          message: `Failed to delete communication: ${deleteError.message}`
        };
      }

      console.log('✅ COMMUNICATION DELETE TOOL: Communication deleted successfully');

      return {
        success: true,
        message: `Successfully deleted ${communicationToDelete.communication_type.replace('_', ' ')} communication for ${communicationToDelete.client_name}${communicationToDelete.subject ? ` - ${communicationToDelete.subject}` : ''}.`,
        deletedCommunication: {
          ...communicationDetails,
          deletedAt: new Date().toISOString(),
          summary: `${communicationToDelete.communication_type.replace('_', ' ')} communication for ${communicationToDelete.client_name} permanently deleted`
        }
      };

    } catch (error) {
      console.error('❌ COMMUNICATION DELETE TOOL: Error deleting communication:', error);
      return {
        success: false,
        message: `Error deleting communication: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },
});