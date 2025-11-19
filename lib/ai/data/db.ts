import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";

const READ_ONLY_SOURCES = [
  "financials",
  "client_balances",
  "client_profiles",
  "client_communications",
  "client_files",
  "client_data_overview",
  "clients",
] as const;
const LIMIT_REGEX = /\blimit\s+\d+/i;
const MAX_LIMIT = 200;

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createServerSupabaseClient();
  }

  return supabaseClient;
}

function sanitizeSql(sql: string, resultLimit: number) {
  const trimmed = sql.trim().replace(/;+\s*$/, "");

  if (!trimmed) {
    throw new Error("SQL query cannot be empty.");
  }

  const normalized = trimmed.toLowerCase();
  if (
    !normalized.startsWith("select") &&
    !normalized.startsWith("with")
  ) {
    throw new Error("Only SELECT statements are allowed from the AI agent.");
  }

  const referencesAllowedSource = READ_ONLY_SOURCES.some((source) =>
    normalized.includes(source)
  );

  if (!referencesAllowedSource) {
    throw new Error(
      `Query must reference one of the approved read-only sources: ${READ_ONLY_SOURCES.join(
        ", "
      )}.`
    );
  }

  if (LIMIT_REGEX.test(normalized)) {
    return trimmed;
  }

  const clampedLimit = Math.max(1, Math.min(resultLimit, MAX_LIMIT));
  return `${trimmed} LIMIT ${clampedLimit}`;
}

export async function runSupabaseSql<T = Record<string, unknown>>(
  sql: string,
  resultLimit = 50
): Promise<T[]> {
  const supabase = getSupabaseClient();
  const finalSql = sanitizeSql(sql, resultLimit);

  const { data, error } = await supabase.rpc("run_sql_readonly", {
    query: finalSql,
  });

  if (error) {
    throw new Error(
      `Failed to execute read-only SQL query: ${error.message}`,
      { cause: error }
    );
  }

  if (!data) {
    return [];
  }

  return Array.isArray(data) ? (data as T[]) : [data as T];
}

export function getReadonlySupabaseClient(): SupabaseClient {
  return getSupabaseClient();
}

export const allowedReadOnlySources = [...READ_ONLY_SOURCES];
