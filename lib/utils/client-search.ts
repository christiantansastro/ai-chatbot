import type { SupabaseClient } from "@supabase/supabase-js";

type ClientRecord = Record<string, any>;

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[] = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1, // deletion
        dp[j - 1] + 1, // insertion
        prev + cost // substitution
      );
      prev = temp;
    }
  }

  return dp[b.length];
};

export async function findBestClientMatch(
  supabase: SupabaseClient,
  rawName: string,
  limit = 10
): Promise<ClientRecord | null> {
  const trimmed = rawName?.trim();
  if (!trimmed) {
    return null;
  }

  const searchTerm = `%${trimmed}%`;
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .ilike("client_name", searchTerm)
    .limit(limit);

  if (error) {
    throw new Error(`Failed to search clients: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const target = normalizeName(trimmed);

  const scored = data
    .map((client) => {
      const candidate = normalizeName(client.client_name || "");
      const distance = levenshteinDistance(candidate, target);
      const maxLen = Math.max(candidate.length, target.length, 1);
      const similarity = 1 - distance / maxLen;
      const startsWithBonus = candidate.startsWith(target) ? 0.1 : 0;
      const containsBonus = candidate.includes(target) ? 0.05 : 0;

      return {
        client,
        score: similarity + startsWithBonus + containsBonus,
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.client ?? null;
}
