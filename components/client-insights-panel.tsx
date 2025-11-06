"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, SearchIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { toast } from "./toast";

type Section = "overview" | "communications" | "financials" | "files";

type ClientSummary = {
  id: string;
  name: string;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
  county?: string | null;
};

type InsightResponse = {
  message: ChatMessage;
  insight?: unknown;
  persisted?: boolean;
};

type ClientInsightsPanelProps = {
  chatId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMessageCreated: (message: ChatMessage) => void;
  isReadonly: boolean;
};

const SECTION_LABELS: Record<Section, string> = {
  overview: "Client overview",
  communications: "Communication history",
  financials: "Financials",
  files: "Files",
};

const RECENTS_KEY = "client-insights:recents";

export function ClientInsightsPanel({
  chatId,
  open,
  onOpenChange,
  onMessageCreated,
  isReadonly,
}: ClientInsightsPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [recents, setRecents] = useState<ClientSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(
    null,
  );
  const [selectedSection, setSelectedSection] = useState<Section>("overview");
  const fetchController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const stored = window.localStorage.getItem(RECENTS_KEY);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ClientSummary[];
        setRecents(parsed);
      } catch {
        setRecents([]);
      }
    }

    loadClients("");
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handle = window.setTimeout(() => {
      loadClients(query);
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    if (open) {
      return;
    }

    fetchController.current?.abort();
    fetchController.current = null;

    setQuery("");
    setResults([]);
    setSelectedClient(null);
    setSelectedSection("overview");
    setErrorMessage(null);
    setIsLoading(false);
    setIsSubmitting(false);
  }, [open]);

  const combinedList = useMemo(() => {
    if (query.trim()) {
      return results;
    }

    const seen = new Set<string>();
    const ordered: ClientSummary[] = [];

    [...recents, ...results].forEach((client) => {
      if (!client.id) {
        return;
      }

      if (!seen.has(client.id)) {
        ordered.push(client);
        seen.add(client.id);
      }
    });

    return ordered;
  }, [query, recents, results]);

  const handleClientSelect = (client: ClientSummary) => {
    setSelectedClient(client);
    setErrorMessage(null);
  };

  const handleSectionSelect = (section: Section) => {
    setSelectedSection(section);
    setErrorMessage(null);
  };

  const handleSubmit = async () => {
    if (!selectedClient) {
      setErrorMessage("Choose a client to continue.");
      return;
    }

    if (isReadonly) {
      toast({
        type: "error",
        description: "This chat is in read-only mode.",
      });
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/client-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId,
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          section: selectedSection,
          includeHistory: selectedSection === "financials",
        }),
      });

      if (!response.ok) {
        const payload = await safeJson(response);
        throw new Error(payload?.error || "Request failed");
      }

      const payload = (await response.json()) as InsightResponse;
      onMessageCreated(payload.message);
      updateRecents(selectedClient);
      toast({
        type: "success",
        description: `${SECTION_LABELS[selectedSection]} added to the conversation.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to submit client insight request:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadClients = async (term: string) => {
    if (!open) {
      return;
    }

    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const trimmedTerm = term.trim();
      const params = new URLSearchParams();
      if (trimmedTerm) {
        params.set("query", trimmedTerm);
      }

      const response = await fetch(
        `/api/client-insights?${params.toString()}`,
        {
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const payload = await safeJson(response);
        throw new Error(payload?.error || "Search failed");
      }

      const payload = (await response.json()) as {
        results: ClientSummary[];
      };

      setResults(payload.results);

      const isSearch = trimmedTerm.length > 0;
      if (isSearch) {
        if (
          selectedClient &&
          !payload.results.some((client) => client.id === selectedClient.id)
        ) {
          setSelectedClient(null);
        }
      }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") {
        return;
      }

      console.error("Failed to load clients:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to search clients.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const updateRecents = (client: ClientSummary) => {
    const next = [client, ...recents.filter((item) => item.id !== client.id)];
    const trimmed = next.slice(0, 6);
    setRecents(trimmed);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-4 bg-background px-0 pb-6 sm:max-w-md"
        side="right"
      >
        <SheetHeader className="border-b px-6 pb-4 pt-6 text-left">
          <SheetTitle className="text-lg font-semibold">
            Client quick search
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            Find a client, choose the info you need, and drop the results into
            this conversation.
          </p>
        </SheetHeader>

        <div className="flex flex-1 min-h-0 flex-col gap-4 px-6">
          <div className="relative">
            <Input
              autoFocus
              className="pl-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients by name"
              value={query}
            />
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            {isLoading && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 pb-4">
              {combinedList.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground">
                  {query.trim()
                    ? "No clients matched your search."
                    : "No clients available yet. Try uploading a new client first."}
                </p>
              )}

              {combinedList.map((client) => {
                const isSelected = selectedClient?.id === client.id;

                return (
                  <button
                    key={client.id}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left transition hover:border-primary",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                    )}
                    onClick={() => handleClientSelect(client)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {client.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatClientType(client.type)}
                          {client.county ? ` - ${client.county}` : ""}
                        </p>
                      </div>
                      {[client.email, client.phone].some(Boolean) && (
                        <p className="text-xs text-muted-foreground">
                          {[client.email, client.phone]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What do you need?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SECTION_LABELS) as Section[]).map((section) => {
                const isActive = selectedSection === section;

                return (
                  <Button
                    key={section}
                    className={cn(
                      "justify-start px-3 py-2 text-left text-sm",
                      isActive && "border-primary bg-primary/10 text-primary",
                    )}
                    disabled={isReadonly}
                    onClick={() => handleSectionSelect(section)}
                    size="sm"
                    variant="outline"
                  >
                    {SECTION_LABELS[section]}
                  </Button>
                );
              })}
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <Button
            className="w-full"
            disabled={!selectedClient || isReadonly || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Preparing insight...
              </>
            ) : (
              `Add ${SECTION_LABELS[selectedSection].toLowerCase()}`
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function formatClientType(type?: string | null) {
  if (!type) {
    return "Client";
  }

  return type
    .toLowerCase()
    .split(" ")
    .map((segment) =>
      segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment,
    )
    .join(" ");
}
