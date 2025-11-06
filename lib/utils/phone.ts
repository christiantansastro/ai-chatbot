import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

export interface NormalizedPhoneNumber {
  e164: string;
  national: string;
  raw: string;
}

const DEFAULT_REGION = toCountryCode(
  process.env.NEXT_PUBLIC_PHONE_DEFAULT_REGION,
) || ("US" as CountryCode);

function toCountryCode(code?: string): CountryCode | undefined {
  if (!code) {
    return undefined;
  }
  const normalized = code.trim().toUpperCase();
  return normalized ? (normalized as CountryCode) : undefined;
}

/**
 * Normalize a phone number using libphonenumber-js. Returns null when the value
 * cannot be parsed into a valid number.
 */
export function normalizePhoneNumber(
  input: string,
  region?: string,
): NormalizedPhoneNumber | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const countryCode = toCountryCode(region) ?? DEFAULT_REGION;

  try {
    const parsed = countryCode
      ? parsePhoneNumberFromString(trimmed, countryCode)
      : parsePhoneNumberFromString(trimmed);
    if (!parsed || !parsed.isValid()) {
      return null;
    }

    return {
      e164: parsed.number,
      national: parsed.formatNational(),
      raw: trimmed,
    };
  } catch {
    return null;
  }
}

/**
 * Normalize and return only the E.164 value (e.g. +17705551234) for storage.
 */
export function normalizePhoneNumberForStorage(
  input: string,
  region?: string,
): string | null {
  const normalized = normalizePhoneNumber(input, region);
  return normalized ? normalized.e164 : null;
}

/**
 * Remove all non-digit characters while keeping a leading '+'. Useful for
 * loose comparisons when a fully parsed number is not available.
 */
export function stripPhoneToComparable(input: string): string {
  if (!input) {
    return "";
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const hasPlusPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${hasPlusPrefix ? "+" : ""}${digits}` : "";
}
