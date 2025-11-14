import { tool } from "ai";
import { z } from "zod";
import { searchClientProfiles } from "@/lib/ai/data/clients";

export const getClientProfileTool = tool({
  description:
    "Retrieve general client information (contact details, case context, status) from the client_profiles view. Use for requests like 'pull data for Sally'.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1, "Client name or keyword is required.")
      .describe("Full or partial client name (or email/phone snippet) to search for."),
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional()
      .describe("Maximum number of clients to return (defaults to 10)."),
  }),
  execute: async ({ name, limit }) => {
    const profiles = await searchClientProfiles(name, limit);

    return {
      success: true,
      query: name,
      resultCount: profiles.length,
      clients: profiles,
    };
  },
});
