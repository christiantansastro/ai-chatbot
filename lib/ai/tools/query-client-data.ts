import { tool } from "ai";
import { z } from "zod";
import {
  executeClientDataQuery,
  type ClientDataQueryRequest,
} from "@/lib/ai/data/client-data-query";

const scalarValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const fieldSelectionSchema = z.union([
  z.string(),
  z.object({
    field: z.string(),
    alias: z
      .string()
      .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Alias must use letters, numbers, or underscores.")
      .optional(),
  }),
]);

const aggregateSchema = z.object({
  func: z.enum(["count", "sum", "avg", "min", "max"]).describe("Aggregate function to apply"),
  field: z
    .string()
    .optional()
    .describe("Column to aggregate. Optional for COUNT(*) queries."),
  alias: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Alias must start with a letter/underscore and only use alphanumeric characters or underscores."),
  distinct: z.boolean().optional().describe("Counts distinct values when func is count."),
});

const filterSchema = z.object({
  field: z.string().min(1, "Filter field is required."),
  operator: z.enum([
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "in",
    "not_in",
    "between",
    "is_null",
    "not_null",
  ]),
  value: z
    .union([
      scalarValueSchema,
      z.array(scalarValueSchema),
      z.object({ from: scalarValueSchema, to: scalarValueSchema }),
    ])
    .optional()
    .describe("Value for comparison filters. Between operators expect { from, to }. IN filters expect an array."),
});

const sortSchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export const queryClientDataTool = tool({
  description:
    "Builds and runs structured analytics queries on the read-only client_data_overview view. Supports selecting fields, grouping, aggregates, multi-field filters, and ordering so the assistant can answer questions such as “How many civil clients have outstanding balances over $5,000?” or “Show the top 5 counties by total outstanding balance.”",
  inputSchema: z.object({
    source: z.literal("client_data_overview").default("client_data_overview"),
    select: z
      .array(fieldSelectionSchema)
      .optional()
      .describe("Fields to return (defaults to client_name, client_type, outstanding_balance)."),
    aggregates: z.array(aggregateSchema).optional().describe("Aggregate metrics to compute."),
    filters: z.array(filterSchema).optional().describe("Filters to apply before aggregation."),
    groupBy: z.array(z.string()).optional().describe("Fields to group by when using aggregates."),
    orderBy: z.array(sortSchema).optional().describe("Sort the result set by one or more fields."),
    limit: z
      .number()
      .int()
      .positive()
      .max(200)
      .optional()
      .describe("Maximum number of rows to return (default capped at 50)."),
  }),
  execute: async (input: ClientDataQueryRequest) => {
    const result = await executeClientDataQuery(input);

    return {
      success: true,
      source: result.plan.source,
      sql: result.plan.sql,
      rowCount: result.rowCount,
      rows: result.rows,
      selectedFields: result.plan.selectedFields,
      aggregates: result.plan.aggregateAliases,
      filters: result.plan.appliedFilters,
      limit: result.plan.limit,
    };
  },
});
