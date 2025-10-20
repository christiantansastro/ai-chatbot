import { tool } from "ai";
import { z } from "zod";
import {
  createClientRecord,
  type CreateClientData,
} from "@/lib/clients/create-client";

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
    payment_method: z.string().optional().describe("Payment method associated with the initial payment"),
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
