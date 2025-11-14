import { tool } from "ai";
import { z } from "zod";
import { searchClientCommunications } from "@/lib/ai/data/communications";

interface CommunicationRecord {
  id: string;
  client_id: string | null;
  client_name: string | null;
  communication_date: string | null;
  communication_type: string | null;
  subject?: string;
  notes: string | null;
}

export const queryCommunications = tool({
  description:
    "Query communication records for clients with advanced filtering options. Can search by client name, communication type, and date range.",
  inputSchema: z.object({
    clientName: z
      .string()
      .optional()
      .describe(
        "Name of the client to get communications for (optional - if not provided, returns all)"
      ),
    communicationType: z
      .enum([
        "all",
        "phone_call",
        "email",
        "meeting",
        "sms",
        "letter",
        "court_hearing",
        "other",
      ])
      .optional()
      .default("all")
      .describe("Filter by communication type"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date for communication records (YYYY-MM-DD format)"),
    dateTo: z
      .string()
      .optional()
      .describe("End date for communication records (YYYY-MM-DD format)"),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of records to return"),
  }),
  execute: async ({
    clientName,
    communicationType = "all",
    dateFrom,
    dateTo,
    limit = 20,
  }): Promise<{
    success: boolean;
    message: string;
    communications: CommunicationRecord[];
    summary: {
      total_found: number;
      by_type: Record<string, number>;
    };
  }> => {
    try {
      console.log("dY\"z COMMUNICATIONS QUERY TOOL: Searching communications:", {
        clientName,
        communicationType,
        dateFrom,
        dateTo,
        limit,
      });

      const communications = await searchClientCommunications({
        clientName,
        communicationType,
        dateFrom,
        dateTo,
        limit,
      });

      console.log(
        `�o. COMMUNICATIONS QUERY TOOL: Found ${communications.length} communications`
      );

      const formattedCommunications: CommunicationRecord[] = communications.map(
        (record) => ({
          id: record.id,
          client_id: record.client_id,
          client_name: record.client_name || "Unknown Client",
          communication_date: record.communication_date,
          communication_type: record.communication_type || "unknown",
          subject: record.subject || undefined,
          notes: record.notes,
        })
      );

      const summary = {
        total_found: formattedCommunications.length,
        by_type: formattedCommunications.reduce((acc, comm) => {
          const type = comm.communication_type || "unknown";
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };

      let message = `Found ${summary.total_found} communication${
        summary.total_found === 1 ? "" : "s"
      }`;

      if (clientName) {
        message += ` for "${clientName}"`;
      }

      if (communicationType !== "all") {
        message += ` of type "${communicationType}"`;
      }

      message += ".";

      return {
        success: true,
        message,
        communications: formattedCommunications,
        summary,
      };
    } catch (error) {
      console.error(
        "�?O COMMUNICATIONS QUERY TOOL: Error querying communications:",
        error
      );
      return {
        success: false,
        message: `Error querying communications: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        communications: [],
        summary: {
          total_found: 0,
          by_type: {},
        },
      };
    }
  },
});
