import type { ClientBalanceView } from "@/lib/db/schema";
import { getReadonlySupabaseClient } from "./db";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface FinancialRecord {
  id: string;
  client_id: string | null;
  client_name: string | null;
  case_number: string | null;
  transaction_type: string;
  amount: number;
  payment_method: string | null;
  transaction_date: string | null;
  payment_due_date: string | null;
  service_description: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_LIMIT));
}

export async function findClientByName(
  clientName: string,
  limit = DEFAULT_LIMIT
): Promise<FinancialRecord[]> {
  const trimmedName = clientName?.trim();

  if (!trimmedName) {
    throw new Error("Client name is required to search financial records.");
  }

  const supabase = getReadonlySupabaseClient();
  const effectiveLimit = clampLimit(limit);

  const { data, error } =
    await supabase
      .from("financials")
      .select(
        "id, client_id, client_name, case_number, transaction_type, amount, payment_method, transaction_date, payment_due_date, service_description, notes, created_at, updated_at"
      )
      .ilike("client_name", `%${trimmedName}%`)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(effectiveLimit);

  if (error) {
    throw new Error(
      `Failed to find client by name "${trimmedName}": ${error.message}`,
      { cause: error }
    );
  }

  return data ?? [];
}

export async function listClientsWithOutstandingBalance(
  minBalance = 0,
  limit = DEFAULT_LIMIT
): Promise<ClientBalanceView[]> {
  const supabase = getReadonlySupabaseClient();
  const sanitizedLimit = clampLimit(limit);
  const minimumBalance =
    Number.isFinite(minBalance) && minBalance > 0 ? minBalance : 0;

  const { data, error } =
    await supabase
      .from("client_balances")
      .select(
        "client_name, total_quoted, total_paid, outstanding_balance, transaction_count, latest_transaction_date"
      )
      .gt("outstanding_balance", minimumBalance)
      .order("outstanding_balance", { ascending: false })
      .limit(sanitizedLimit);

  if (error) {
    throw new Error(
      `Failed to list clients with outstanding balances: ${error.message}`,
      { cause: error }
    );
  }

  return (data ?? []).map((row) => ({
    ...row,
    total_quoted: Number((row as any).total_quoted ?? 0),
    total_paid: Number((row as any).total_paid ?? 0),
    outstanding_balance: Number((row as any).outstanding_balance ?? 0),
    transaction_count: Number((row as any).transaction_count ?? 0),
  }));
}
