import { tool } from "ai";
import { z } from "zod";
import { findClientByName } from "@/lib/ai/data/financials";

export const getClientByNameTool = tool({
  description:
    "Look up a specific client by name using the financials table. Best when the user asks for a client like 'Find client named Bob'. Returns the most recent financial records for matching names.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1, "Client name is required.")
      .describe("Full or partial client name to search for."),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe("Maximum number of financial records to return (defaults to 50)."),
  }),
  execute: async ({ name, limit }) => {
    const records = await findClientByName(name, limit);

    return {
      success: true,
      clientNameQuery: name,
      recordCount: records.length,
      records,
    };
  },
});
