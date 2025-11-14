import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { formatClientRecord } from "@/lib/clients/create-client";
import { generateUUID } from "@/lib/utils";
import {
  getChatById,
  saveMessages,
  type DBMessage,
} from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";

const SECTION_SCHEMA = z.enum([
  "overview",
  "communications",
  "financials",
  "files",
  "all",
]);

const getQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().min(1).max(25).default(10),
});

const postSchema = z.object({
  chatId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  clientName: z.string().min(1, "Client name is required"),
  section: SECTION_SCHEMA,
  includeHistory: z.boolean().optional(),
});

type QueryParams = z.infer<typeof getQuerySchema>;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const parsed = getQuerySchema.safeParse({
      query: searchParams.get("query") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid search parameters" },
        { status: 400 },
      );
    }

    const { query, limit } = parsed.data as QueryParams;

    let builder = supabase
      .from("clients")
      .select(
        `
          id,
          client_name,
          client_type,
          email,
          phone,
          county,
          updated_at,
          created_at
        `,
      )
      .order("updated_at", { ascending: false })
      .limit(limit + 1);

    if (query?.trim()) {
      builder = builder.ilike("client_name", `%${query.trim()}%`);
    }

    const { data, error } = await builder;

    if (error) {
      throw error;
    }

    const results = (data ?? []).slice(0, limit).map((row) => ({
      id: row.id,
      name: row.client_name,
      type: row.client_type,
      email: row.email,
      phone: row.phone,
      county: row.county,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      results,
      hasMore: (data ?? []).length > results.length,
    });
  } catch (error) {
    console.error("Failed to complete client search:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to search clients",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = postSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { chatId, clientId, clientName, section, includeHistory } =
      parsed.data;

    const chat = await getChatById({ id: chatId });
    const canPersist = Boolean(chat);

    if (chat && chat.userId !== session.user.id) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const supabase = createServerSupabaseClient();
    const normalizedName = clientName.trim();
    const response = await fetchSectionData({
      supabase,
      clientId,
      clientName: normalizedName,
      section,
      includeHistory: includeHistory ?? false,
    });

    const assistantMessage = buildAssistantMessage({
      section,
      clientLabel: response.clientLabel ?? normalizedName,
      content: response.content,
      summary: response.summary,
    });

    const now = new Date();

    const dbMessage: DBMessage = {
      id: assistantMessage.id,
      chatId,
      role: assistantMessage.role,
      parts: assistantMessage.parts,
      attachments: [],
      createdAt: now,
    };

    let persisted = false;
    if (canPersist) {
      try {
        await saveMessages({ messages: [dbMessage] });
        persisted = true;
      } catch (error) {
        console.error("Failed to persist client insight message:", error);
      }
    }

    return NextResponse.json({
      message: {
        ...assistantMessage,
        metadata: { createdAt: now.toISOString() },
      } satisfies ChatMessage,
      insight: response.meta,
      persisted,
    });
  } catch (error) {
    console.error("Failed to retrieve client insight:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete request",
      },
      { status: 500 },
    );
  }
}

type FetchSectionArgs = {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  clientId?: string;
  clientName: string;
  section: z.infer<typeof SECTION_SCHEMA>;
  includeHistory: boolean;
};

async function fetchSectionData({
  supabase,
  clientId,
  clientName,
  section,
  includeHistory,
}: FetchSectionArgs) {
  switch (section) {
    case "overview":
      return fetchOverview(supabase, clientId, clientName);
    case "communications":
      return fetchCommunications(supabase, clientId, clientName);
    case "financials":
      return fetchFinancials(
        supabase,
        clientId,
        clientName,
        includeHistory,
      );
    case "files":
      return fetchFiles(supabase, clientId, clientName);
    case "all":
      return fetchAllSections({
        supabase,
        clientId,
        clientName,
        includeHistory,
      });
    default:
      throw new Error("Unsupported section");
  }
}

async function fetchOverview(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string | undefined,
  clientName: string,
) {
  let builder = supabase
    .from("client_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (clientId) {
    builder = builder.eq("id", clientId);
  } else {
    builder = builder.ilike("client_name", `%${clientName}%`);
  }

  let { data, error } = await builder;

  if (isMissingRelationError(error)) {
    let fallback = supabase
      .from("clients")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (clientId) {
      fallback = fallback.eq("id", clientId);
    } else {
      fallback = fallback.ilike("client_name", `%${clientName}%`);
    }

    const fallbackResult = await fallback;
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  const record = data?.[0];

  if (!record) {
    return {
      clientLabel: clientName,
      content: `No profile information found for ${clientName}.`,
      summary: "No client details were returned.",
      meta: null,
    };
  }

  const formatted = formatClientRecord(record);
  const profileSection = [
    "**Profile**",
    formatFact("Client type", formatted.clientType),
    formatFact("Email", formatted.email),
    formatFact("Phone", formatted.phone),
    formatFact("Address", formatted.address),
    formatFact("County", formatted.county),
    formatFact("Intake date", formatted.intakeDate),
    formatFact("Court date", formatted.courtDate),
  ]
    .filter(Boolean)
    .join("\n");

  const notesSection =
    formatted.notes && formatted.notes !== "No notes"
      ? ["", "**Notes**", formatted.notes].join("\n")
      : "";

  const statusSection = [
    "",
    "**Status & Legal Context**",
    formatFact("Arrested", formatted.arrested),
    formatFact("Currently incarcerated", formatted.currentlyIncarcerated),
    formatFact("On probation", formatted.onProbation),
    formatFact("On parole", formatted.onParole),
  ].join("\n");

  const formatContactLine = (
    label: string,
    name: string,
    relationship: string,
    phone: string | undefined,
  ) => {
    const segments = [`${name} (${relationship})`];
    if (phone && isMeaningful(phone)) {
      segments.push(`Phone: ${phone}`);
    }
    return `- ${label}: ${segments.join(" - ")}`;
  };

  const contactsSection = [
    "",
    "**Key Contacts**",
    formatContactLine(
      "Primary",
      formatted.contact1,
      formatted.relationship1,
      formatted.contact1Phone,
    ),
    formatContactLine(
      "Secondary",
      formatted.contact2,
      formatted.relationship2,
      formatted.contact2Phone,
    ),
  ].join("\n");

  const summary = buildOverviewSummary(formatted);

  return {
    clientLabel: formatted.name,
    content: [profileSection, notesSection, statusSection, contactsSection]
      .filter(Boolean)
      .join("\n"),
    summary,
    meta: { record: formatted },
  };
}

async function fetchCommunications(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string | undefined,
  clientName: string,
) {
  let builder = supabase
    .from("client_communications")
    .select(
      `
        id,
        client_id,
        client_name,
        communication_date,
        communication_type,
        direction,
        priority,
        subject,
        notes
      `,
    )
    .order("communication_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(12);

  if (clientId) {
    builder = builder.eq("client_id", clientId);
  } else {
    builder = builder.ilike("client_name", `%${clientName}%`);
  }

  let { data, error } = await builder;

  if (isMissingRelationError(error)) {
    let fallback = supabase
      .from("communications")
      .select(
        `
          *,
          clients!inner(client_name)
        `,
      )
      .order("communication_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);

    if (clientId) {
      fallback = fallback.eq("client_id", clientId);
    } else {
      fallback = fallback.ilike("clients.client_name", `%${clientName}%`);
    }

    const fallbackResult = await fallback;
    const fallbackData = fallbackResult.data ?? [];
    data = fallbackData.map((entry: any) => ({
      ...entry,
      client_name: entry.client_name ?? entry.clients?.client_name ?? null,
    }));
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return {
      clientLabel: clientName,
      content: `No communication history found for **${clientName}**.`,
      summary: "No communications to display.",
      meta: { communications: [] },
    };
  }

  const lines = data.map((entry) => {
    const date = formatDate(entry.communication_date);
    const type = titleCase(entry.communication_type ?? "Unknown");
    const subject = entry.subject ? ` â€” ${entry.subject}` : "";
    const notes = entry.notes ? `\n  -> ${entry.notes}` : "";
    return `- ${date} - ${type}${subject}${notes}`;
  });

  return {
    clientLabel: data[0]?.client_name ?? clientName,
    content: lines.join("\n"),
    summary: `Retrieved ${data.length} communication ${
      data.length === 1 ? "record" : "records"
    }.`,
    meta: { communications: data },
  };
}

async function fetchFinancials(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string | undefined,
  clientName: string,
  includeHistory: boolean,
) {
  const buildQuery = () =>
    supabase
      .from("financials")
      .select(
        `
        id,
        client_id,
        client_name,
        transaction_type,
        transaction_date,
        amount,
        payment_method,
        service_description,
        notes
      `,
      )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(includeHistory ? 20 : 10);

  let data: any[] | null = null;
  let error: any = null;

  const result = clientId
    ? await buildQuery().eq("client_id", clientId)
    : await buildQuery().ilike("client_name", `%${clientName}%`);
  data = result.data;
  error = result.error;

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return {
      clientLabel: clientName,
      content: `No financial activity found for **${clientName}**.`,
      summary: "No financial records to display.",
      meta: { transactions: [] },
    };
  }

  let totalQuoted = 0;
  let totalPaid = 0;
  let adjustments = 0;

  data.forEach((tx) => {
      const amount = Number(tx.amount ?? 0);
      if (Number.isNaN(amount)) {
        return;
      }
      const type = tx.transaction_type?.toLowerCase();
      if (type === "quote") {
        totalQuoted += amount;
      } else if (type === "payment") {
        totalPaid += amount;
      } else if (type === "adjustment") {
        adjustments += amount;
      }
  });

  const balance = totalQuoted - totalPaid - adjustments;
  const head = [
    "**Summary**",
    formatFact("Total quoted", formatCurrency(totalQuoted)),
    formatFact("Total paid", formatCurrency(totalPaid)),
    adjustments !== 0
      ? formatFact("Adjustments", formatCurrency(adjustments))
      : undefined,
    formatFact("Balance", formatCurrency(balance)),
  ].filter(Boolean) as string[];

  const historyLines = data.map((tx) => {
    const date = formatDate(tx.transaction_date);
    const type = titleCase(tx.transaction_type ?? "Transaction");
    const amountValue = Number(tx.amount ?? 0);
    const amount = Number.isNaN(amountValue)
      ? String(tx.amount ?? "Unknown")
      : amountValue.toFixed(2);

    const entries = [
      `- ${date} - ${type}`,
      `  Amount: ${formatCurrency(amount)}`,
      tx.payment_method ? `  Method: ${tx.payment_method}` : undefined,
      tx.service_description ? `  Service: ${tx.service_description}` : undefined,
      tx.notes ? `  Notes: ${tx.notes}` : undefined,
    ].filter(Boolean);

    return entries.join("\n");
  });

  return {
    clientLabel: data[0]?.client_name ?? clientName,
    content: [...head, "", "**Recent Transactions**", ...historyLines].join(
      "\n",
    ),
    summary: `Balance for ${
      data[0]?.client_name ?? clientName
    } is $${balance.toFixed(2)}.`,
    meta: {
      totals: { totalQuoted, totalPaid, adjustments, balance },
      transactions: data,
    },
  };
}

async function fetchFiles(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string | undefined,
  clientName: string,
) {
  let nameFilter = clientName;

  if (clientId) {
    const resolvedName = await resolveClientName(supabase, clientId);
    if (resolvedName) {
      nameFilter = resolvedName;
    }
  }

  const buildQuery = () =>
    supabase
      .from("client_files")
      .select(
        `
        id,
        client_name,
        file_name,
        file_type,
        file_url,
        upload_timestamp
      `,
      )
      .order("upload_timestamp", { ascending: false })
      .limit(15);

  let result = await buildQuery().ilike("client_name", `%${nameFilter}%`);

  let data = result.data;
  let error = result.error;

  if (isMissingRelationError(error) || isMissingColumnError(error)) {
    const fallbackQuery = () =>
      supabase
        .from("files")
        .select(
          `
          id,
          client_name,
          file_name,
          file_type,
          file_url,
          upload_timestamp
        `,
        )
        .order("upload_timestamp", { ascending: false })
        .limit(15);

    result = await fallbackQuery().ilike("client_name", `%${nameFilter}%`);

    data = result.data;
    error = result.error;
  }

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return {
      clientLabel: clientName,
      content: `No files found for **${clientName}**.`,
      summary: "No files to display.",
      meta: { files: [] },
    };
  }

  const entries = data.map((file) => {
    const date = formatDate(file.upload_timestamp);
    const label = file.file_name ?? "Unnamed file";
    return `- ${date} - [${label}](${file.file_url})`;
  });

  return {
    clientLabel: data[0]?.client_name ?? clientName,
    content: entries.join("\n"),
    summary: `Listed ${data.length} file ${
      data.length === 1 ? "entry" : "entries"
    }.`,
    meta: { files: data },
  };
}

async function fetchAllSections({
  supabase,
  clientId,
  clientName,
  includeHistory,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  clientId?: string;
  clientName: string;
  includeHistory: boolean;
}) {
  const [overview, communications, financials, files] = await Promise.all([
    fetchOverview(supabase, clientId, clientName),
    fetchCommunications(supabase, clientId, clientName),
    fetchFinancials(supabase, clientId, clientName, includeHistory ?? true),
    fetchFiles(supabase, clientId, clientName),
  ]);

  const sections = [
    { title: "Client Overview", data: overview },
    { title: "Communication History", data: communications },
    { title: "Financials", data: financials },
    { title: "Files", data: files },
  ];

  const content = sections
    .map(({ title, data }) => {
      if (!data.content) {
        return null;
      }
      return [`#### ${title}`, data.content].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const summary =
    sections
      .map(({ data }) => data.summary)
      .filter(Boolean)
      .join(" ")
      .trim() ||
    `Compiled all available information for ${clientName}.`;

  const clientLabel =
    overview.clientLabel ||
    communications.clientLabel ||
    financials.clientLabel ||
    files.clientLabel ||
    clientName;

  return {
    clientLabel,
    content:
      content ||
      `No additional information was available for ${clientLabel}.`,
    summary,
    meta: {
      overview: overview.meta,
      communications: communications.meta,
      financials: financials.meta,
      files: files.meta,
    },
  };
}

function buildAssistantMessage({
  section,
  clientLabel,
  content,
  summary,
}: {
  section: z.infer<typeof SECTION_SCHEMA>;
  clientLabel: string;
  content: string;
  summary: string;
}) {
  const id = generateUUID();
  const sectionLabel =
    section === "all" ? "All data" : titleCase(section);

  const text = [
    `### ${sectionLabel} for ${clientLabel}`,
    summary ? `${summary}\n` : "",
    content,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id,
    role: "assistant" as const,
    parts: [
      {
        type: "text" as const,
        text,
      },
    ],
    attachments: [],
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((segment) =>
      segment.length > 0
        ? segment.charAt(0).toUpperCase() + segment.slice(1)
        : segment,
    )
    .join(" ");
}

function isMissingRelationError(error: any) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    (typeof error.message === "string" &&
      error.message.toLowerCase().includes("does not exist"))
  );
}

function isMissingColumnError(error: any) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    (typeof error.message === "string" &&
      error.message.toLowerCase().includes("column"))
  );
}

async function resolveClientName(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  clientId: string,
) {
  let { data, error } = await supabase
    .from("client_profiles")
    .select("client_name")
    .eq("id", clientId)
    .limit(1);

  if (isMissingRelationError(error)) {
    const fallback = await supabase
      .from("clients")
      .select("client_name")
      .eq("id", clientId)
      .limit(1);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.warn("Failed to resolve client name for files view", error);
    return null;
  }

  return data?.[0]?.client_name ?? null;
}

type FormattedClient = ReturnType<typeof formatClientRecord>;

function formatFact(label: string, value: string) {
  const cleaned = value ? value.trim() : "";
  const display = cleaned ? cleaned : "Not provided";
  return `- ${label}: ${display}`;
}

function formatCurrency(value: number | string) {
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return `$${numeric.toFixed(2)}`;
    }
    return value;
  }

  if (!Number.isFinite(value)) {
    return "Unknown";
  }

  return `$${value.toFixed(2)}`;
}

function buildOverviewSummary(client: FormattedClient) {
  const summaryParts = [client.name];

  if (isMeaningful(client.clientType)) {
    summaryParts.push(client.clientType);
  }

  const contactParts = [];
  if (isMeaningful(client.email)) {
    contactParts.push(`Email ${client.email.trim()}`);
  }
  if (isMeaningful(client.phone)) {
    contactParts.push(`Phone ${client.phone.trim()}`);
  }
  if (contactParts.length > 0) {
    summaryParts.push(contactParts.join(" | "));
  }

  if (isMeaningful(client.county)) {
    summaryParts.push(`County ${client.county}`);
  }

  return summaryParts.join(" - ");
}

function isMeaningful(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return !(
    normalized === "" ||
    normalized === "not provided" ||
    normalized === "not specified" ||
    normalized === "no email"
  );
}


