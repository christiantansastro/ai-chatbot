import type { ClientProfileView } from "@/lib/db/schema";
import { getReadonlySupabaseClient } from "./db";

const DEFAULT_PROFILE_LIMIT = 10;
const MAX_PROFILE_LIMIT = 100;

function clampProfileLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_PROFILE_LIMIT;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_PROFILE_LIMIT));
}

export async function searchClientProfiles(
  searchTerm: string,
  limit?: number
): Promise<ClientProfileView[]> {
  const term = searchTerm?.trim();

  if (!term) {
    throw new Error("Client name or keyword is required to search profiles.");
  }

  const supabase = getReadonlySupabaseClient();
  const effectiveLimit = clampProfileLimit(limit);
  const sanitizedTerm = term.replace(/%/g, "").replace(/_/g, "");
  const likeTerm = `%${sanitizedTerm}%`;

  const { data, error } = await supabase
    .from("client_profiles")
    .select("*")
    .or(
      [
        `client_name.ilike.${likeTerm}`,
        `email.ilike.${likeTerm}`,
        `phone.ilike.${likeTerm}`,
        `case_type.ilike.${likeTerm}`,
        `county.ilike.${likeTerm}`,
      ].join(",")
    )
    .order("updated_at", { ascending: false })
    .limit(effectiveLimit);

  if (error) {
    throw new Error(
      `Failed to search client profiles: ${error.message}`,
      { cause: error }
    );
  }

  return data ?? [];
}
