import { tool } from "ai";
import { z } from "zod";
import {
  createClientRecord,
  type CreateClientData,
} from "@/lib/clients/create-client";

export const createClient = tool({
  description: "Create a new client record in the Supabase database with the provided information",
  inputSchema: z.object({
    // Common fields
    client_name: z.string().describe("Full name of the client (required)"),
    client_type: z.enum(["civil", "criminal"]).describe("Client type: 'criminal' or 'civil' (required)"),
    email: z.string().optional().describe("Client's email address"),
    phone: z.string().describe("Client's phone number (required)"),
    address: z.string().optional().describe("Client's address"),
    date_of_birth: z.string().optional().describe("Client's date of birth (YYYY-MM-DD format)"),
    date_intake: z.string().optional().describe("Date of intake (YYYY-MM-DD format, defaults to today if not provided)"),
    
    // Contact information
    contact_1: z.string().optional().describe("First contact person's name"),
    relationship_1: z.string().optional().describe("Relationship of first contact to client"),
    contact_1_phone: z.string().optional().describe("Phone number of first contact"),
    contact_2: z.string().optional().describe("Second contact person's name"),
    relationship_2: z.string().optional().describe("Relationship of second contact to client"),
    contact_2_phone: z.string().optional().describe("Phone number of second contact"),
    
    // Common case details
    notes: z.string().optional().describe("Additional notes about the client"),
    county: z.string().optional().describe("County where legal issues are located"),
    court_date: z.string().optional().describe("Scheduled court date (YYYY-MM-DD format)"),
    quoted: z.string().optional().describe("Quoted amount for services"),
    initial_payment: z.string().optional().describe("Initial payment amount"),
    due_date_balance: z.string().optional().describe("Due date for balance (YYYY-MM-DD format)"),
    
    // Criminal-specific fields
    arrested: z.boolean().optional().describe("Whether client was arrested (criminal clients only)"),
    arrested_county: z.string().optional().describe("County where arrested (criminal clients only)"),
    currently_incarcerated: z.boolean().optional().describe("Whether client is currently incarcerated"),
    incarceration_location: z.string().optional().describe("Location of incarceration"),
    incarceration_reason: z.string().optional().describe("Reason for incarceration"),
    last_bond_hearing_date: z.string().optional().describe("Date of last bond hearing (YYYY-MM-DD format)"),
    last_bond_hearing_location: z.string().optional().describe("Location of last bond hearing"),
    date_of_incident: z.string().optional().describe("Date of incident (YYYY-MM-DD format)"),
    incident_county: z.string().optional().describe("County where incident occurred"),
    on_probation: z.boolean().optional().describe("Whether client is on probation"),
    probation_county: z.string().optional().describe("County of probation"),
    probation_officer: z.string().optional().describe("Name of probation officer"),
    probation_time_left: z.string().optional().describe("Time remaining on probation"),
    on_parole: z.boolean().optional().describe("Whether client is on parole"),
    parole_officer: z.string().optional().describe("Name of parole officer"),
    parole_time_left: z.string().optional().describe("Time remaining on parole"),
    arrest_reason: z.string().optional().describe("Reason for arrest"),
    charges: z.string().optional().describe("Criminal charges"),
    
    // Civil-specific fields
    served_papers_or_initial_filing: z.string().optional().describe("Details about papers served or initial filing"),
    case_type: z.string().optional().describe("Type of civil case (divorce, custody, etc.)"),
    other_side_name: z.string().optional().describe("Name of opposing party"),
    other_side_relation: z.string().optional().describe("Relation to opposing party"),
    other_side_contact_info: z.string().optional().describe("Contact information for opposing party"),
    other_side_attorney_info: z.string().optional().describe("Attorney information for opposing party"),
    children_involved: z.boolean().optional().describe("Whether children are involved in the case"),
    children_details: z.string().optional().describe("Details about involved children"),
    previous_court_orders: z.boolean().optional().describe("Whether there are previous court orders"),
    previous_orders_county: z.string().optional().describe("County of previous court orders"),
    previous_orders_case_number: z.string().optional().describe("Case number of previous court orders"),
  }),
  execute: async (clientData): Promise<{
    success: boolean;
    message: string;
    client: any;
  }> => {
    try {
      console.log('🆕 CLIENT CREATE TOOL: Creating new client:', clientData);

      const { formatted, financial, record } = await createClientRecord(
        clientData as CreateClientData,
        { includeFinancialTransactions: true }
      );

      console.log('✅ CLIENT CREATE TOOL: Client created successfully:', {
        id: record.id,
        name: record.client_name,
      });

      financial.errors.forEach((errorMessage) =>
        console.warn('⚠️ CLIENT CREATE TOOL: %s', errorMessage)
      );

      return {
        success: true,
        message: `Successfully created client: ${record.client_name}`,
        client: formatted,
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
