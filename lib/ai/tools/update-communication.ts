import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface UpdateCommunicationData {
  communication_date?: string;
  communication_type?: string;
  direction?: string;
  priority?: string;
  subject?: string;
  notes?: string;
  follow_up_required?: boolean;
  follow_up_date?: string;
  follow_up_notes?: string;
  related_case_number?: string;
  court_date?: string;
  duration_minutes?: number;
  outcome?: string;
  next_action?: string;
  created_by?: string;
}

export const updateCommunication = tool({
  description: "Update an existing communication record by searching for it first, then applying the updates. Can modify communication details, dates, priorities, and follow-up information.",
  inputSchema: z.object({
    searchQuery: z.string().describe("Communication ID, client name, or subject to find the communication to update"),
    communication_date: z.string().optional().describe("Updated communication date (YYYY-MM-DD format)"),
    communication_type: z.enum(['phone_call', 'email', 'meeting', 'sms', 'letter', 'court_hearing', 'other']).optional().describe("Updated communication type"),
    direction: z.enum(['inbound', 'outbound']).optional().describe("Updated communication direction"),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe("Updated priority level"),
    subject: z.string().optional().describe("Updated subject or title"),
    notes: z.string().optional().describe("Updated detailed notes"),
    follow_up_required: z.boolean().optional().describe("Updated follow-up requirement"),
    follow_up_date: z.string().optional().describe("Updated follow-up date (YYYY-MM-DD format)"),
    follow_up_notes: z.string().optional().describe("Updated follow-up notes"),
    related_case_number: z.string().optional().describe("Updated case or reference number"),
    court_date: z.string().optional().describe("Updated court hearing date (YYYY-MM-DD format)"),
    duration_minutes: z.number().optional().describe("Updated duration in minutes"),
    outcome: z.string().optional().describe("Updated communication outcome"),
    next_action: z.string().optional().describe("Updated next action required"),
    created_by: z.string().optional().describe("Updated person who recorded this communication"),
  }),
  execute: async (updateData): Promise<{
    success: boolean;
    message: string;
    communication: any;
  }> => {
    try {
      console.log('📞 COMMUNICATION UPDATE TOOL: Updating communication:', updateData);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ COMMUNICATION UPDATE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          communication: null
        };
      }

      console.log('📞 COMMUNICATION UPDATE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // First, find the communication to update
      console.log('📞 COMMUNICATION UPDATE TOOL: Searching for communication to update...');

      // Try to find by ID first
      let communicationQuery = supabase
        .from('communications')
        .select('*');

      // If searchQuery looks like a UUID, search by ID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(updateData.searchQuery)) {
        communicationQuery = communicationQuery.eq('id', updateData.searchQuery);
      } else {
        // Search by subject or client name
        communicationQuery = communicationQuery.or(`subject.ilike.${updateData.searchQuery},client_name.ilike.${updateData.searchQuery}`);
      }

      const { data: communications, error: searchError } = await communicationQuery.limit(1);

      if (searchError) {
        console.error('❌ COMMUNICATION UPDATE TOOL: Search failed:', searchError);
        return {
          success: false,
          message: `Failed to find communication: ${searchError.message}`,
          communication: null
        };
      }

      if (!communications || communications.length === 0) {
        console.log('❌ COMMUNICATION UPDATE TOOL: No communication found matching:', updateData.searchQuery);
        return {
          success: false,
          message: `No communication found matching "${updateData.searchQuery}". Please check the ID, subject, or client name.`,
          communication: null
        };
      }

      const communicationToUpdate = communications[0];
      console.log('✅ COMMUNICATION UPDATE TOOL: Found communication to update:', communicationToUpdate.id);

      // Prepare the update data (only include fields that are provided)
      const updateFields: UpdateCommunicationData = {};

      if (updateData.communication_date !== undefined) updateFields.communication_date = updateData.communication_date;
      if (updateData.communication_type !== undefined) updateFields.communication_type = updateData.communication_type;
      if (updateData.direction !== undefined) updateFields.direction = updateData.direction;
      if (updateData.priority !== undefined) updateFields.priority = updateData.priority;
      if (updateData.subject !== undefined) updateFields.subject = updateData.subject;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;
      if (updateData.follow_up_required !== undefined) updateFields.follow_up_required = updateData.follow_up_required;
      if (updateData.follow_up_date !== undefined) updateFields.follow_up_date = updateData.follow_up_date;
      if (updateData.follow_up_notes !== undefined) updateFields.follow_up_notes = updateData.follow_up_notes;
      if (updateData.related_case_number !== undefined) updateFields.related_case_number = updateData.related_case_number;
      if (updateData.court_date !== undefined) updateFields.court_date = updateData.court_date;
      if (updateData.duration_minutes !== undefined) updateFields.duration_minutes = updateData.duration_minutes;
      if (updateData.outcome !== undefined) updateFields.outcome = updateData.outcome;
      if (updateData.next_action !== undefined) updateFields.next_action = updateData.next_action;
      if (updateData.created_by !== undefined) updateFields.created_by = updateData.created_by;

      console.log('📞 COMMUNICATION UPDATE TOOL: Update fields:', updateFields);

      // Update the communication record
      const { data, error } = await supabase
        .from('communications')
        .update(updateFields)
        .eq('id', communicationToUpdate.id)
        .select()
        .single();

      if (error) {
        console.error('❌ COMMUNICATION UPDATE TOOL: Database update failed:', error);
        return {
          success: false,
          message: `Failed to update communication: ${error.message}`,
          communication: null
        };
      }

      console.log('✅ COMMUNICATION UPDATE TOOL: Communication updated successfully:', data);

      // Format the response
      const updatedCommunication = {
        id: data.id,
        clientName: data.client_name,
        communicationDate: new Date(data.communication_date).toLocaleDateString(),
        communicationType: data.communication_type,
        direction: data.direction,
        priority: data.priority,
        subject: data.subject || 'Not provided',
        notes: data.notes,
        followUpRequired: data.follow_up_required,
        followUpDate: data.follow_up_date ? new Date(data.follow_up_date).toLocaleDateString() : 'Not set',
        followUpNotes: data.follow_up_notes || 'No follow-up notes',
        relatedCaseNumber: data.related_case_number || 'Not provided',
        courtDate: data.court_date ? new Date(data.court_date).toLocaleDateString() : 'Not applicable',
        durationMinutes: data.duration_minutes || 'Not specified',
        outcome: data.outcome || 'Not specified',
        nextAction: data.next_action || 'No action specified',
        createdBy: data.created_by || 'Not specified',
        createdAt: new Date(data.created_at).toLocaleDateString(),
        updatedAt: new Date(data.updated_at).toLocaleDateString(),
        summary: `${data.communication_type.replace('_', ' ')} with ${data.client_name}${data.subject ? ` - ${data.subject}` : ''}`
      };

      return {
        success: true,
        message: `Successfully updated ${data.communication_type.replace('_', ' ')} communication for ${data.client_name}`,
        communication: updatedCommunication
      };

    } catch (error) {
      console.error('❌ COMMUNICATION UPDATE TOOL: Error updating communication:', error);
      return {
        success: false,
        message: `Error updating communication: ${error instanceof Error ? error.message : 'Unknown error'}`,
        communication: null
      };
    }
  },
});