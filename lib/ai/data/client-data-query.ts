import type { ClientDataOverviewView } from "@/lib/db/schema";
import { runSupabaseSql } from "./db";

export type ClientDataQueryRow = Partial<ClientDataOverviewView> & Record<string, unknown>;

type FieldType = "string" | "number" | "boolean" | "date";

interface FieldConfig {
  column: string;
  type: FieldType;
  description?: string;
}

type QuerySource = "client_data_overview";

interface SourceDefinition {
  table: string;
  alias: string;
  defaultSelect: string[];
  fields: Record<string, FieldConfig>;
}

const CLIENT_DATA_FIELDS: Record<string, FieldConfig> = {
  client_id: { column: "client_id", type: "string" },
  client_name: { column: "client_name", type: "string" },
  client_type: { column: "client_type", type: "string" },
  email: { column: "email", type: "string" },
  phone: { column: "phone", type: "string" },
  address: { column: "address", type: "string" },
  county: { column: "county", type: "string" },
  case_type: { column: "case_type", type: "string" },
  court_date: { column: "court_date", type: "date" },
  quoted: { column: "quoted", type: "string" },
  initial_payment: { column: "initial_payment", type: "string" },
  due_date_balance: { column: "due_date_balance", type: "string" },
  arrested: { column: "arrested", type: "boolean" },
  currently_incarcerated: { column: "currently_incarcerated", type: "boolean" },
  on_probation: { column: "on_probation", type: "boolean" },
  on_parole: { column: "on_parole", type: "boolean" },
  created_at: { column: "created_at", type: "date" },
  updated_at: { column: "updated_at", type: "date" },
  total_quoted: { column: "total_quoted", type: "number" },
  total_paid: { column: "total_paid", type: "number" },
  outstanding_balance: { column: "outstanding_balance", type: "number" },
  transaction_count: { column: "transaction_count", type: "number" },
  latest_transaction_date: { column: "latest_transaction_date", type: "date" },
  total_communications: { column: "total_communications", type: "number" },
  communications_last_30_days: { column: "communications_last_30_days", type: "number" },
  last_communication_date: { column: "last_communication_date", type: "date" },
  last_communication_created_at: { column: "last_communication_created_at", type: "date" },
  total_files: { column: "total_files", type: "number" },
  last_file_uploaded_at: { column: "last_file_uploaded_at", type: "date" },
};

const SOURCES: Record<QuerySource, SourceDefinition> = {
  client_data_overview: {
    table: "client_data_overview",
    alias: "data",
    defaultSelect: ["client_name", "client_type", "outstanding_balance"],
    fields: CLIENT_DATA_FIELDS,
  },
};

type FieldSelection = string | { field: string; alias?: string };

type AggregateFunction = "count" | "sum" | "avg" | "min" | "max";

interface AggregateSelection {
  func: AggregateFunction;
  field?: string;
  alias: string;
  distinct?: boolean;
}

type Scalar = string | number | boolean;

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "not_in"
  | "between"
  | "is_null"
  | "not_null";

interface BetweenValue {
  from: Scalar;
  to: Scalar;
}

type FilterValue = Scalar | Scalar[] | BetweenValue;

interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value?: FilterValue;
}

interface SortSpec {
  field: string;
  direction?: "asc" | "desc";
}

export interface ClientDataQueryRequest {
  source?: QuerySource;
  select?: FieldSelection[];
  aggregates?: AggregateSelection[];
  filters?: QueryFilter[];
  groupBy?: string[];
  orderBy?: SortSpec[];
  limit?: number;
}

export interface ClientDataQueryPlan {
  sql: string;
  source: QuerySource;
  limit?: number;
  selectedFields: Array<{ field: string; alias?: string }>;
  aggregateAliases: string[];
  appliedFilters: string[];
}

export async function executeClientDataQuery(
  request: ClientDataQueryRequest
): Promise<{
  rows: ClientDataQueryRow[];
  rowCount: number;
  plan: ClientDataQueryPlan;
}> {
  const plan = buildClientDataQuery(request);
  const rows = await runSupabaseSql<ClientDataQueryRow>(plan.sql, plan.limit);

  return {
    rows,
    rowCount: rows.length,
    plan,
  };
}

export function buildClientDataQuery(request: ClientDataQueryRequest): ClientDataQueryPlan {
  const source = request.source ?? "client_data_overview";
  const sourceConfig = SOURCES[source];

  if (!sourceConfig) {
    throw new Error(`Unsupported data source "${source}".`);
  }

  const sanitizedLimit = clampLimit(request.limit);
  const selectInput = Array.isArray(request.select) ? request.select : sourceConfig.defaultSelect;
  const { selectSql, selectedFields, groupableColumns } = buildSelectClause(selectInput, sourceConfig);
  const { aggregateSql, aggregateAliases } = buildAggregateClause(request.aggregates, sourceConfig);

  if (!selectSql.length && !aggregateSql.length) {
    throw new Error("Select at least one field or aggregate to run a query.");
  }

  const filterClauses = (request.filters ?? []).map((filter) => buildFilterClause(filter, sourceConfig));
  const whereSql = filterClauses.length ? `WHERE ${filterClauses.join(" AND ")}` : "";

  const groupBySql = buildGroupByClause(request.groupBy, groupableColumns, sourceConfig, aggregateSql.length > 0);
  const orderBySql = buildOrderByClause(request.orderBy, sourceConfig, selectedFields, aggregateAliases);
  const limitSql = sanitizedLimit ? `LIMIT ${sanitizedLimit}` : "";

  const selectPieces = [...selectSql, ...aggregateSql];
  const sql = [
    `SELECT ${selectPieces.join(", ")}`,
    `FROM ${sourceConfig.table} ${sourceConfig.alias}`,
    whereSql,
    groupBySql,
    orderBySql,
    limitSql,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    sql,
    source,
    limit: sanitizedLimit,
    selectedFields,
    aggregateAliases,
    appliedFilters: filterClauses,
  };
}

function buildSelectClause(selections: FieldSelection[], source: SourceDefinition) {
  const selectSql: string[] = [];
  const selectedFields: Array<{ field: string; alias?: string }> = [];
  const groupableColumns: string[] = [];

  for (const entry of selections) {
    const selection = typeof entry === "string" ? { field: entry } : entry;
    const field = resolveField(selection.field, source);
    const alias = selection.alias ? validateIdentifier(selection.alias) : undefined;
    const expression = `${source.alias}.${field.column}`;

    selectSql.push(alias ? `${expression} AS ${alias}` : expression);
    selectedFields.push({ field: field.column, alias });
    groupableColumns.push(expression);
  }

  return { selectSql, selectedFields, groupableColumns };
}

function buildAggregateClause(aggregates: AggregateSelection[] | undefined, source: SourceDefinition) {
  const aggregateSql: string[] = [];
  const aggregateAliases: string[] = [];

  if (!aggregates?.length) {
    return { aggregateSql, aggregateAliases };
  }

  for (const aggregate of aggregates) {
    const func = aggregate.func.toUpperCase();
    const alias = validateIdentifier(aggregate.alias);

    if (aggregate.distinct && aggregate.func !== "count") {
      throw new Error("DISTINCT is only supported with COUNT aggregates.");
    }

    let target = "*";
    if (aggregate.field) {
      const field = resolveField(aggregate.field, source);
      target = `${source.alias}.${field.column}`;
    } else if (aggregate.func !== "count") {
      throw new Error(`${aggregate.func.toUpperCase()} aggregate requires a field.`);
    }

    const distinctModifier = aggregate.distinct ? "DISTINCT " : "";
    aggregateSql.push(`${func}(${distinctModifier}${target}) AS ${alias}`);
    aggregateAliases.push(alias);
  }

  return { aggregateSql, aggregateAliases };
}

function buildFilterClause(filter: QueryFilter, source: SourceDefinition): string {
  const field = resolveField(filter.field, source);
  const operator = filter.operator;
  const qualifiedColumn = `${source.alias}.${field.column}`;

  switch (operator) {
    case "is_null":
      return `${qualifiedColumn} IS NULL`;
    case "not_null":
      return `${qualifiedColumn} IS NOT NULL`;
    case "between": {
      if (!isBetweenValue(filter.value)) {
        throw new Error(`Filter "${operator}" requires a value with "from" and "to" properties.`);
      }
      const from = formatValue(filter.value.from, field.type);
      const to = formatValue(filter.value.to, field.type);
      return `${qualifiedColumn} BETWEEN ${from} AND ${to}`;
    }
    case "in":
    case "not_in": {
      if (!Array.isArray(filter.value) || !filter.value.length) {
        throw new Error(`Filter "${operator}" requires a non-empty array value.`);
      }
      const values = filter.value.map((value) => formatValue(value, field.type)).join(", ");
      const op = operator === "in" ? "IN" : "NOT IN";
      return `${qualifiedColumn} ${op} (${values})`;
    }
    case "like":
    case "ilike": {
      const value = filter.value;
      if (typeof value !== "string") {
        throw new Error(`Filter "${operator}" requires a string pattern value.`);
      }
      const op = operator === "like" ? "LIKE" : "ILIKE";
      return `${qualifiedColumn} ${op} ${formatValue(value, "string")}`;
    }
    default: {
      if (filter.value === undefined) {
        throw new Error(`Filter "${operator}" requires a value.`);
      }
      const value = formatValue(filter.value as Scalar, field.type);
      const op = comparisonOperator(operator);
      return `${qualifiedColumn} ${op} ${value}`;
    }
  }
}

function buildGroupByClause(
  fields: string[] | undefined,
  selectColumns: string[],
  source: SourceDefinition,
  hasAggregates: boolean
): string {
  const columnSet = new Set<string>();
  const resolvedFields = (fields ?? []).map((field) => resolveField(field, source).column);

  if (!resolvedFields.length && hasAggregates) {
    selectColumns.forEach((column) => columnSet.add(column));
  } else {
    resolvedFields.forEach((column) => columnSet.add(`${source.alias}.${column}`));
  }

  if (!columnSet.size) {
    return "";
  }

  return `GROUP BY ${Array.from(columnSet).join(", ")}`;
}

function buildOrderByClause(
  orderBy: SortSpec[] | undefined,
  source: SourceDefinition,
  selectedFields: Array<{ field: string; alias?: string }>,
  aggregateAliases: string[]
): string {
  if (!orderBy?.length) {
    return "";
  }

  const allowedAliasMap = new Map<string, string>();
  selectedFields.forEach(({ field, alias }) => {
    const normalizedField = normalizeFieldKey(field);
    allowedAliasMap.set(normalizedField, `${source.alias}.${field}`);
    if (alias) {
      allowedAliasMap.set(normalizeFieldKey(alias), alias);
    }
  });

  aggregateAliases.forEach((alias) => {
    allowedAliasMap.set(normalizeFieldKey(alias), alias);
  });

  const clauses = orderBy.map((sort) => {
    const normalized = normalizeFieldKey(sort.field);
    let target = allowedAliasMap.get(normalized);

    if (!target) {
      const fieldDef = source.fields[normalized];
      if (!fieldDef) {
        throw new Error(`Cannot order by unknown field "${sort.field}".`);
      }
      target = `${source.alias}.${fieldDef.column}`;
    }

    const direction = sort.direction?.toLowerCase() === "desc" ? "DESC" : "ASC";
    return `${target} ${direction}`;
  });

  return clauses.length ? `ORDER BY ${clauses.join(", ")}` : "";
}

function resolveField(field: string, source: SourceDefinition) {
  const normalized = normalizeFieldKey(field);
  const definition = source.fields[normalized];

  if (!definition) {
    throw new Error(`Unknown field "${field}" for source "${source.table}".`);
  }

  return definition;
}

function comparisonOperator(operator: FilterOperator): string {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "!=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    default:
      throw new Error(`Unsupported comparison operator "${operator}".`);
  }
}

function formatValue(value: Scalar, type: FieldType): string {
  switch (type) {
    case "number":
      if (typeof value === "boolean") {
        throw new Error("Numeric filters cannot use boolean values.");
      }
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num)) {
        throw new Error(`Value "${value}" is not a valid number.`);
      }
      return String(num);
    case "boolean":
      if (typeof value === "boolean") {
        return value ? "TRUE" : "FALSE";
      }
      if (typeof value === "string") {
        if (value.toLowerCase() === "true") return "TRUE";
        if (value.toLowerCase() === "false") return "FALSE";
      }
      throw new Error(`Value "${value}" is not a valid boolean.`);
    case "date":
      if (typeof value !== "string") {
        throw new Error(`Date filters require ISO date strings. Received: ${value}`);
      }
      return escapeLiteral(value);
    default:
      return escapeLiteral(String(value));
  }
}

function escapeLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeFieldKey(field: string): string {
  return field
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();
}

function validateIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error("Aliases must start with a letter/underscore and contain only letters, numbers, or underscores.");
  }
  return value;
}

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) {
    return undefined;
  }
  return Math.max(1, Math.min(Math.floor(limit), 200));
}

function isBetweenValue(value: FilterValue | undefined): value is BetweenValue {
  return Boolean(value && typeof value === "object" && "from" in value && "to" in value);
}
