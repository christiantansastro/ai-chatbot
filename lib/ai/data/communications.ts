import type { ClientCommunicationView } from "@/lib/db/schema";
import { getReadonlySupabaseClient } from "./db";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type CommunicationSearchFilters = {
  clientId?: string;
  clientName?: string;
  communicationType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

function clampLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_LIMIT));
}

export async function searchClientCommunications(
  filters: CommunicationSearchFilters = {}
): Promise<ClientCommunicationView[]> {
  const {
    clientId,
    clientName,
    communicationType,
    dateFrom,
    dateTo,
    limit,
  } = filters;

  const supabase = getReadonlySupabaseClient();
  const effectiveLimit = clampLimit(limit);

  let query = supabase
    .from("client_communications")
    .select(
      "id, client_id, client_name, communication_date, communication_type, subject, notes, created_at, updated_at"
    )
    .order("communication_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(effectiveLimit);

  if (clientId) {
    query = query.eq("client_id", clientId);
  } else if (clientName?.trim()) {
    query = query.ilike("client_name", `%${clientName.trim()}%`);
  }

  if (communicationType && communicationType !== "all") {
    query = query.eq("communication_type", communicationType);
  }

  if (dateFrom) {
    query = query.gte("communication_date", dateFrom);
  }

  if (dateTo) {
    query = query.lte("communication_date", dateTo);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Failed to query communications: ${error.message}`,
      { cause: error }
    );
  }

  return data ?? [];
}
