import { tool } from "ai";
import { z } from "zod";
import {
  runSupabaseSql as executeReadOnlySql,
  allowedReadOnlySources,
} from "@/lib/ai/data/db";

export const runSupabaseSqlTool = tool({
  description:
    "Run a custom read-only SQL SELECT query against approved sources (financials or client_balances). Prefer dedicated helpers when available.",
  inputSchema: z.object({
    sql: z
      .string()
      .min(1, "Provide a SELECT statement to execute.")
      .describe(
        "SQL SELECT statement targeting financials or client_balances. For example: SELECT client_name, outstanding_balance FROM client_balances ORDER BY outstanding_balance DESC"
      ),
    resultLimit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe("Override the automatic LIMIT (defaults to 50)."),
  }),
  execute: async ({ sql, resultLimit }) => {
    const rows = await executeReadOnlySql(sql, resultLimit);

    return {
      success: true,
      rowCount: rows.length,
      allowedSources: allowedReadOnlySources,
      rows,
    };
  },
});
