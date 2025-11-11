import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface CommunicationResult {
  id: string;
  client_id: string;
  client_name: string;
  communication_date: string;
  communication_type: string;
  subject?: string;
  notes: string;
}

export const addCommunication = tool({
  description: "Add a new communication record to track client interactions. Supports all communication types including phone calls, emails, meetings, SMS, letters, and court hearings with follow-up tracking.",
  inputSchema: z.object({
    clientName: z.string().describe("Name of the client for this communication"),
    communicationType: z.enum(['phone_call', 'email', 'meeting', 'sms', 'letter', 'court_hearing', 'other']).describe("Type of communication"),
    subject: z.string().optional().describe("Brief subject or title for the communication"),
    notes: z.string().describe("Detailed notes about the communication content"),
    relatedCaseNumber: z.string().optional().describe("Case or reference number if this relates to a specific case"),
    courtDate: z.string().optional().describe("Court hearing date if applicable (YYYY-MM-DD format)"),
  }),
  execute: async (commData): Promise<{
    success: boolean;
    message: string;
    communication: CommunicationResult | null;
  }> => {
    try {
      console.log('📞 COMMUNICATION ADD TOOL: Adding communication:', commData);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ COMMUNICATION ADD TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          communication: null
        };
      }

      console.log('📞 COMMUNICATION ADD TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // No follow-up validation needed since we removed follow-up fields

      // Find the client by name
      console.log('📞 COMMUNICATION ADD TOOL: Finding client...');
      let { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('id, client_name')
        .ilike('client_name', commData.clientName)
        .limit(1);

      // If clients table doesn't exist or no client found, check if communications table has client_name column
      if (clientError || !clients || clients.length === 0) {
        console.log('📞 COMMUNICATION ADD TOOL: Clients table not available or client not found, checking communications table...');

        // Check if communications table has client_name column (standalone version)
        const { data: existingComms, error: commError } = await supabase
          .from('communications')
          .select('client_name')
          .ilike('client_name', commData.clientName)
          .limit(1);

        if (!commError && existingComms && existingComms.length > 0) {
          // Use the client name directly since we're in standalone mode
          clients = [{ id: null, client_name: commData.clientName }];
          console.log('📞 COMMUNICATION ADD TOOL: Using standalone mode with client name');
        } else {
          console.log('❌ COMMUNICATION ADD TOOL: Client not found in either table');
        }
      }

      if (!clients || clients.length === 0) {
        return {
          success: false,
          message: `Client "${commData.clientName}" not found. Please check the name and try again.`,
          communication: null
        };
      }

      const client = clients[0];
      console.log('✅ COMMUNICATION ADD TOOL: Found client:', client.client_name);

      // Prepare communication data
      const communication: any = {
        client_name: commData.clientName,
        communication_date: new Date().toISOString().split('T')[0], // Today's date
        communication_type: commData.communicationType,
        subject: commData.subject || null,
        notes: commData.notes,
        related_case_number: commData.relatedCaseNumber || null,
        court_date: commData.courtDate || null,
        source: 'chatbot',
      };

      // Add client reference based on what's available
      if (client.id) {
        communication.client_id = client.id;
      } else {
        // Use client name directly (standalone mode)
        communication.client_name = client.client_name;
      }

      console.log('📞 COMMUNICATION ADD TOOL: Inserting communication:', communication);

      // Insert the communication
      const { data: insertedCommunication, error: insertError } = await supabase
        .from('communications')
        .insert(communication)
        .select()
        .single();

      if (insertError) {
        console.error('❌ COMMUNICATION ADD TOOL: Communication insert failed:', insertError);
        return {
          success: false,
          message: `Failed to add communication: ${insertError.message}`,
          communication: null
        };
      }

      console.log('✅ COMMUNICATION ADD TOOL: Communication added successfully:', insertedCommunication);

      // Format the result
      const result: CommunicationResult = {
        id: insertedCommunication.id,
        client_id: insertedCommunication.client_id,
        client_name: client.client_name,
        communication_date: insertedCommunication.communication_date,
        communication_type: insertedCommunication.communication_type,
        subject: insertedCommunication.subject || undefined,
        notes: insertedCommunication.notes,
      };

      // Format success message based on communication type and details
      let message = `Successfully recorded ${commData.communicationType.replace('_', ' ')}`;

      if (commData.subject) {
        message += ` about "${commData.subject}"`;
      }

      message += ` for ${client.client_name}.`;

      if (commData.relatedCaseNumber) {
        message += ` Case: ${commData.relatedCaseNumber}.`;
      }

      if (commData.courtDate) {
        message += ` Court date: ${commData.courtDate}.`;
      }

      return {
        success: true,
        message,
        communication: result
      };

    } catch (error) {
      console.error('❌ COMMUNICATION ADD TOOL: Error adding communication:', error);
      return {
        success: false,
        message: `Error adding communication: ${error instanceof Error ? error.message : 'Unknown error'}`,
        communication: null
      };
    }
  },
});
