import { tool } from "ai";
import { z } from "zod";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

interface CreateClientData {
  client_name: string;
  client_type?: string;
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
  county?: string;
  arrested?: boolean;
  charges?: string;
  served_papers_or_initial_filing?: string;
  case_type?: string;
  court_date?: string;
  quoted?: string;
  initial_payment?: string;
  due_date_balance?: string;
}

export const createClient = tool({
  description: "Create a new client record in the Supabase database with the provided information",
  inputSchema: z.object({
    client_name: z.string().describe("Full name of the client (required)"),
    client_type: z.string().optional().describe("Client type: 'criminal' or 'civil'"),
    email: z.string().optional().describe("Client's email address"),
    phone: z.string().optional().describe("Client's phone number"),
    address: z.string().optional().describe("Client's address"),
    date_of_birth: z.string().optional().describe("Client's date of birth (YYYY-MM-DD format)"),
    date_intake: z.string().optional().describe("Date of intake (YYYY-MM-DD format, defaults to today if not provided)"),
    contact_1: z.string().optional().describe("First contact person's name"),
    relationship_1: z.string().optional().describe("Relationship of first contact to client"),
    contact_2: z.string().optional().describe("Second contact person's name"),
    relationship_2: z.string().optional().describe("Relationship of second contact to client"),
    notes: z.string().optional().describe("Additional notes about the client"),
    county: z.string().optional().describe("County where legal issues are located"),
    arrested: z.boolean().optional().describe("Whether client was arrested ( criminal clients only)"),
    charges: z.string().optional().describe("Criminal charges ( criminal clients only)"),
    served_papers_or_initial_filing: z.string().optional().describe("Whether served papers or initial filing (civil clients only)"),
    case_type: z.string().optional().describe("Type of civil case (divorce, custody, etc.)"),
    court_date: z.string().optional().describe("Scheduled court date (YYYY-MM-DD format)"),
    quoted: z.string().optional().describe("Quoted amount for services"),
    initial_payment: z.string().optional().describe("Initial payment amount"),
    due_date_balance: z.string().optional().describe("Due date for balance (YYYY-MM-DD format)"),
  }),
  execute: async (clientData): Promise<{
    success: boolean;
    message: string;
    client: any;
  }> => {
    try {
      console.log('🆕 CLIENT CREATE TOOL: Creating new client:', clientData);

      // Validate environment variables
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ CLIENT CREATE TOOL: Missing Supabase environment variables');
        return {
          success: false,
          message: 'Database configuration error: Missing Supabase credentials',
          client: null
        };
      }

      console.log('🆕 CLIENT CREATE TOOL: Environment variables validated');

      // Create Supabase client
      const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

      // Prepare the data for insertion
      const insertData: CreateClientData = {
        client_name: clientData.client_name,
        client_type: clientData.client_type || undefined,
        email: clientData.email || undefined,
        phone: clientData.phone || undefined,
        address: clientData.address || undefined,
        date_of_birth: clientData.date_of_birth || undefined,
        date_intake: clientData.date_intake || undefined,
        contact_1: clientData.contact_1 || undefined,
        relationship_1: clientData.relationship_1 || undefined,
        contact_2: clientData.contact_2 || undefined,
        relationship_2: clientData.relationship_2 || undefined,
        notes: clientData.notes || undefined,
        county: clientData.county || undefined,
        arrested: clientData.arrested || undefined,
        charges: clientData.charges || undefined,
        served_papers_or_initial_filing: clientData.served_papers_or_initial_filing || undefined,
        case_type: clientData.case_type || undefined,
        court_date: clientData.court_date || undefined,
        quoted: clientData.quoted || undefined,
        initial_payment: clientData.initial_payment || undefined,
        due_date_balance: clientData.due_date_balance || undefined,
      };

      console.log('🆕 CLIENT CREATE TOOL: Inserting client data:', insertData);

      // Insert the new client record
      const { data, error } = await supabase
        .from('clients')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('❌ CLIENT CREATE TOOL: Database insert failed:', error);
        return {
          success: false,
          message: `Failed to create client: ${error.message}`,
          client: null
        };
      }

      console.log('✅ CLIENT CREATE TOOL: Client created successfully:', data);

      // Format the response
      const createdClient = {
        id: data.id,
        name: data.client_name,
        clientType: data.client_type || 'Not specified',
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
        county: data.county || 'Not provided',
        arrested: data.arrested !== undefined ? (data.arrested ? 'Yes' : 'No') : 'Not specified',
        charges: data.charges || 'Not provided',
        servedPapersOrInitialFiling: data.served_papers_or_initial_filing || 'Not provided',
        caseType: data.case_type || 'Not provided',
        courtDate: data.court_date ? new Date(data.court_date).toLocaleDateString() : 'Not provided',
        quoted: data.quoted || 'Not provided',
        initialPayment: data.initial_payment || 'Not provided',
        dueDateBalance: data.due_date_balance ? new Date(data.due_date_balance).toLocaleDateString() : 'Not provided',
        createdAt: new Date(data.created_at).toLocaleDateString(),
        updatedAt: new Date(data.updated_at).toLocaleDateString(),
        summary: `${data.client_name} (${data.client_type || 'Unspecified'}) - ${data.email || 'No email'} (${data.phone || 'No phone'})`
      };

      return {
        success: true,
        message: `Successfully created client: ${data.client_name}`,
        client: createdClient
      };

    } catch (error) {
      console.error('❌ CLIENT CREATE TOOL: Error creating client:', error);
      return {
        success: false,
        message: `Error creating client: ${error instanceof Error ? error.message : 'Unknown error'}`,
        client: null
      };
    }
  },
});