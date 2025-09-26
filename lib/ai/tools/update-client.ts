import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface UpdateClientData {
  client_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  date_intake?: string;
  contact_1?: string;
  relationship_1?: string;
  contact_2?: string;
  relationship_2?: string;
  notes?: string;
}

export const updateClient = tool({
  description: "Update an existing client record in the Supabase database by searching for the client first, then applying the updates",
  inputSchema: z.object({
    searchQuery: z.string().describe("Name, email, or phone number to find the client to update"),
    client_name: z.string().optional().describe("Updated full name of the client"),
    email: z.string().optional().describe("Updated email address"),
    phone: z.string().optional().describe("Updated phone number"),
    address: z.string().optional().describe("Updated address"),
    date_of_birth: z.string().optional().describe("Updated date of birth (YYYY-MM-DD format)"),
    date_intake: z.string().optional().describe("Updated date of intake (YYYY-MM-DD format)"),
    contact_1: z.string().optional().describe("Updated first contact person's name"),
    relationship_1: z.string().optional().describe("Updated relationship of first contact to client"),
    contact_2: z.string().optional().describe("Updated second contact person's name"),
    relationship_2: z.string().optional().describe("Updated relationship of second contact to client"),
    notes: z.string().optional().describe("Updated notes about the client"),
  }),
  execute: async (updateData): Promise<{
    success: boolean;
    message: string;
    client: any;
  }> => {
    try {
      console.log('🔄 CLIENT UPDATE TOOL: Updating client:', updateData);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ CLIENT UPDATE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          client: null
        };
      }

      console.log('🔄 CLIENT UPDATE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // First, find the client to update
      console.log('🔄 CLIENT UPDATE TOOL: Searching for client to update...');
      const { data: searchResults, error: searchError } = await supabase
        .from('clients')
        .select('*')
        .or(`client_name.ilike.${updateData.searchQuery},email.ilike.${updateData.searchQuery},phone.ilike.${updateData.searchQuery}`)
        .limit(1);

      if (searchError) {
        console.error('❌ CLIENT UPDATE TOOL: Search failed:', searchError);
        return {
          success: false,
          message: `Failed to find client: ${searchError.message}`,
          client: null
        };
      }

      if (!searchResults || searchResults.length === 0) {
        console.log('❌ CLIENT UPDATE TOOL: No client found matching:', updateData.searchQuery);
        return {
          success: false,
          message: `No client found matching "${updateData.searchQuery}". Please check the name, email, or phone number.`,
          client: null
        };
      }

      const clientToUpdate = searchResults[0];
      console.log('✅ CLIENT UPDATE TOOL: Found client to update:', clientToUpdate.client_name);

      // Prepare the update data (only include fields that are provided)
      const updateFields: UpdateClientData = {};

      if (updateData.client_name !== undefined) updateFields.client_name = updateData.client_name;
      if (updateData.email !== undefined) updateFields.email = updateData.email;
      if (updateData.phone !== undefined) updateFields.phone = updateData.phone;
      if (updateData.address !== undefined) updateFields.address = updateData.address;
      if (updateData.date_of_birth !== undefined) updateFields.date_of_birth = updateData.date_of_birth;
      if (updateData.date_intake !== undefined) updateFields.date_intake = updateData.date_intake;
      if (updateData.contact_1 !== undefined) updateFields.contact_1 = updateData.contact_1;
      if (updateData.relationship_1 !== undefined) updateFields.relationship_1 = updateData.relationship_1;
      if (updateData.contact_2 !== undefined) updateFields.contact_2 = updateData.contact_2;
      if (updateData.relationship_2 !== undefined) updateFields.relationship_2 = updateData.relationship_2;
      if (updateData.notes !== undefined) updateFields.notes = updateData.notes;

      console.log('🔄 CLIENT UPDATE TOOL: Update fields:', updateFields);

      // Update the client record
      const { data, error } = await supabase
        .from('clients')
        .update(updateFields)
        .eq('client_name', clientToUpdate.client_name)
        .select()
        .single();

      if (error) {
        console.error('❌ CLIENT UPDATE TOOL: Database update failed:', error);
        return {
          success: false,
          message: `Failed to update client: ${error.message}`,
          client: null
        };
      }

      console.log('✅ CLIENT UPDATE TOOL: Client updated successfully:', data);

      // Format the response
      const updatedClient = {
        name: data.client_name,
        email: data.email || 'Not provided',
        phone: data.phone || 'Not provided',
        address: data.address || 'Not provided',
        dateOfBirth: data.date_of_birth ? new Date(data.date_of_birth).toLocaleDateString() : 'Not provided',
        intakeDate: data.date_intake ? new Date(data.date_intake).toLocaleDateString() : 'Not provided',
        contact1: data.contact_1 || 'Not provided',
        relationship1: data.relationship_1 || 'Not provided',
        contact2: data.contact_2 || 'Not provided',
        relationship2: data.relationship_2 || 'Not provided',
        notes: data.notes || 'No notes',
        createdAt: new Date(data.created_at).toLocaleDateString(),
        updatedAt: new Date(data.updated_at).toLocaleDateString(),
        summary: `${data.client_name} - ${data.email || 'No email'} (${data.phone || 'No phone'})`
      };

      return {
        success: true,
        message: `Successfully updated client: ${data.client_name}`,
        client: updatedClient
      };

    } catch (error) {
      console.error('❌ CLIENT UPDATE TOOL: Error updating client:', error);
      return {
        success: false,
        message: `Error updating client: ${error instanceof Error ? error.message : 'Unknown error'}`,
        client: null
      };
    }
  },
});