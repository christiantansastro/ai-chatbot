import { tool } from "ai";
import { z } from "zod";
import { listClientsWithOutstandingBalance } from "@/lib/ai/data/financials";

export const listClientsWithOutstandingBalanceTool = tool({
  description:
    "List clients who still owe money by using the client_balances view. Use this for requests like 'Who has an outstanding balance?'.",
  inputSchema: z.object({
    minBalance: z
      .number()
      .nonnegative()
      .optional()
      .describe(
        "Only include clients whose outstanding balance is greater than this amount (defaults to 0)."
      ),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe("Maximum number of clients to return (defaults to 50)."),
  }),
  execute: async ({ minBalance = 0, limit }) => {
    const clients = await listClientsWithOutstandingBalance(
      minBalance,
      limit
    );

    return {
      success: true,
      minBalance,
      clientCount: clients.length,
      clients,
    };
  },
});
