import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCommunicationsSyncService } from "@/lib/openphone-communications-service";

type CanonicalBodyResult = {
  canonicalBody: string;
  parsedBody: any | null;
  isJson: boolean;
};

type SignatureEntry = {
  scheme?: string;
  version?: string;
  timestamp?: string;
  signature?: string;
};

const SHA256_REGEX = /sha256=(.+)/i;
const VERSIONED_SIGNATURE_REGEX = /v\d=([A-Za-z0-9+/=]+)/;
const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;

function canonicalizeRequestBody(rawBody: string): CanonicalBodyResult {
  if (!rawBody) {
    return { canonicalBody: "", parsedBody: null, isJson: false };
  }
  try {
    const parsedBody = JSON.parse(rawBody);
    return {
      canonicalBody: JSON.stringify(parsedBody),
      parsedBody,
      isJson: true,
    };
  } catch {
    return { canonicalBody: rawBody.trim(), parsedBody: null, isJson: false };
  }
}

function collectSignatureHeaderValues(request: NextRequest): string[] {
  const headerNames = [
    "openphone-signature",
    "x-openphone-signature",
    "x-openphone-signature-sha256",
    "x-quo-signature",
  ];
  const values: string[] = [];
  for (const name of headerNames) {
    const value = request.headers.get(name);
    if (value) {
      values.push(value);
    }
  }
  return values;
}

function stripWrappingQuotes(value?: string | null): string | undefined {
  if (!value) {
    return;
  }
  return value.replace(/^['"]+|['"]+$/g, "").trim();
}

function parseSignatureHeader(value: string): SignatureEntry[] {
  const entries: SignatureEntry[] = [];
  if (!value) {
    return entries;
  }

  const fragments = value
    .split(",")
    .map((fragment) => fragment.trim())
    .filter(Boolean);

  for (const fragment of fragments) {
    if (fragment.includes(";")) {
      const [scheme, version, timestamp, signature] = fragment.split(";");
      entries.push({
        scheme: stripWrappingQuotes(scheme),
        version: stripWrappingQuotes(version),
        timestamp: stripWrappingQuotes(timestamp),
        signature: stripWrappingQuotes(signature),
      });
      continue;
    }

    const shaMatch = fragment.match(SHA256_REGEX);
    if (shaMatch?.[1]) {
      entries.push({ signature: stripWrappingQuotes(shaMatch[1]) });
      continue;
    }

    const versionedMatch = fragment.match(VERSIONED_SIGNATURE_REGEX);
    if (versionedMatch?.[1]) {
      entries.push({ signature: stripWrappingQuotes(versionedMatch[1]) });
      continue;
    }

    entries.push({ signature: stripWrappingQuotes(fragment) });
  }

  return entries;
}

function constantTimeEquals(a?: string | null, b?: string | null): boolean {
  if (!a || !b) {
    return false;
  }
  try {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) {
      return false;
    }
    return timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
}

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

function isLikelyBase64(value: string): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.replace(/\s+/g, "");
  return BASE64_REGEX.test(normalized) && normalized.length % 4 === 0;
}

function buildSigningKeyCandidates(secret: string): Buffer[] {
  const trimmed = secret.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const candidates: Buffer[] = [Buffer.from(trimmed, "utf8")];

  if (isLikelyBase64(normalized)) {
    try {
      const decoded = Buffer.from(normalized, "base64");
      if (decoded.byteLength > 0) {
        candidates.unshift(decoded);
      }
    } catch {
      // Ignore base64 decoding errors, we'll fall back to utf8 secret.
    }
  }

  return candidates;
}

function computeHmacDigests(data: string, signingKeys: Buffer[]): string[] {
  if (!data || signingKeys.length === 0) {
    return [];
  }
  const payloadBuffer = Buffer.from(data, "utf8");
  return signingKeys.map((key) =>
    createHmac("sha256", key).update(payloadBuffer).digest("base64")
  );
}

function verifySignature(request: NextRequest, canonicalBody: string): boolean {
  const secret = process.env.OPENPHONE_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }

  const headerValues = collectSignatureHeaderValues(request);
  const bearerToken = extractBearerToken(request.headers.get("authorization"));

  if (bearerToken && constantTimeEquals(bearerToken, secret)) {
    return true;
  }

  if (headerValues.length === 0) {
    console.warn("OpenPhone webhook missing signature headers");
    return false;
  }

  if (headerValues.some((value) => constantTimeEquals(value, secret))) {
    return true;
  }

  const signingKeys = buildSigningKeyCandidates(secret);
  if (signingKeys.length === 0) {
    console.warn("Unable to derive signing key for OpenPhone webhook");
    return false;
  }

  const canonicalPayload = canonicalBody ?? "";
  const bodyOnlyDigests = canonicalPayload
    ? computeHmacDigests(canonicalPayload, signingKeys)
    : [];

  for (const headerValue of headerValues) {
    const entries = parseSignatureHeader(headerValue);
    for (const entry of entries) {
      const providedSignature = entry.signature;
      if (!providedSignature) {
        continue;
      }

      if (entry.timestamp) {
        const signedData = `${entry.timestamp}.${canonicalPayload}`;
        const expectedDigests = computeHmacDigests(signedData, signingKeys);
        if (
          expectedDigests.some((digest) =>
            constantTimeEquals(providedSignature, digest)
          )
        ) {
          return true;
        }
      }

      // Fallback to direct body hash for legacy headers without timestamp.
      if (
        bodyOnlyDigests.some((digest) =>
          constantTimeEquals(providedSignature, digest)
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const { canonicalBody, parsedBody, isJson } =
    canonicalizeRequestBody(rawBody);

  if (!verifySignature(request, canonicalBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (!isJson || typeof parsedBody !== "object" || parsedBody === null) {
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 }
    );
  }

  try {
    const syncService = getCommunicationsSyncService();
    await syncService.handleWebhookEvent(parsedBody);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("OpenPhone webhook error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
