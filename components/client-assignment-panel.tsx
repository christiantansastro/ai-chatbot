"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Loader2, PlusIcon, SearchIcon } from "lucide-react";
import type { Dispatch, SetStateAction, ChangeEvent } from "react";
import type { Attachment } from "@/lib/types";
import type { PendingClientFile } from "@/lib/types/uploads";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { ScrollArea } from "./ui/scroll-area";
import { toast } from "./toast";

type ClientSearchResult = {
  id: string;
  name: string;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
  county?: string | null;
};

type ClientAssignmentPanelProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pendingFiles: PendingClientFile[];
  setPendingClientFiles: Dispatch<SetStateAction<PendingClientFile[]>>;
  setStoredClientAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setAttachedClientName: Dispatch<SetStateAction<string | null>>;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

export function ClientAssignmentPanel({
  onOpenChange,
  open,
  pendingFiles,
  setPendingClientFiles,
  setStoredClientAttachments,
  setAttachedClientName,
}: ClientAssignmentPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [selectedClient, setSelectedClient] =
    useState<ClientSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleFiles = useMemo(() => pendingFiles, [pendingFiles]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedClient(null);
      setErrorMessage(null);
      setUploadError(null);
      abortController.current?.abort();
      abortController.current = null;
      return;
    }

    const handle = window.setTimeout(() => {
      loadClients(query);
    }, 250);

    return () => {
      window.clearTimeout(handle);
    };
  }, [open, query]);

  const loadClients = async (term: string) => {
    abortController.current?.abort();
    const controller = new AbortController();
    abortController.current = controller;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "15");
      if (term.trim()) {
        params.set("query", term.trim());
      }

      const response = await fetch(`/api/client-insights?${params.toString()}`, {
        signal: controller.signal,
      });

      const payload = (await response
        .json()
        .catch(() => null)) as { results?: ClientSearchResult[]; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load clients.");
      }

      setResults(payload?.results ?? []);
    } catch (error) {
      if ((error as DOMException).name === "AbortError") {
        return;
      }
      console.error("Failed to load clients:", error);
      setResults([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load clients.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (visibleFiles.length === 0) {
      toast({
        type: "info",
        description: "Upload files before assigning them to a client.",
      });
      return;
    }

    if (!selectedClient) {
      setErrorMessage("Select a client to continue.");
      return;
    }

    setIsAssigning(true);

    try {
  const storePromises = visibleFiles.map(async (tempFile: PendingClientFile) => {
        const response = await fetch("/api/files/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tempId: tempFile.tempId,
            filename: tempFile.filename,
            contentType: tempFile.contentType,
            size: tempFile.size,
            fileBuffer: arrayBufferToBase64(tempFile.fileBuffer),
            clientId: selectedClient.id,
            clientName: selectedClient.name,
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            (payload as { error?: string })?.error ||
              `Failed to store ${tempFile.filename}`,
          );
        }

        return {
          url: (payload as { url: string }).url,
          name: tempFile.filename,
          contentType: tempFile.contentType,
        };
      });

      const storedFiles = await Promise.all(storePromises);

        setPendingClientFiles([]);
  setStoredClientAttachments((current: Attachment[]) => [...current, ...storedFiles]);
      setAttachedClientName(selectedClient.name);
      onOpenChange(false);

      toast({
        type: "success",
        description: `Attached ${storedFiles.length} file${
          storedFiles.length > 1 ? "s" : ""
        } to ${selectedClient.name}.`,
      });
    } catch (error) {
      console.error("Failed to assign files:", error);
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to assign files to the selected client.",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
  const files: File[] = Array.from(event.target.files || []);
      setUploadError(null);

      if (files.length === 0) {
        return;
      }

      const validFiles: File[] = [];
      const invalidFiles: string[] = [];

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ];

      const allowedExtensions = [
        "jpg",
        "jpeg",
        "png",
        "pdf",
        "doc",
        "docx",
        "xlsx",
        "csv",
      ];

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          invalidFiles.push(`${file.name} (file too large - max 10MB)`);
          continue;
        }

        if (
          !allowedTypes.includes(file.type) &&
          !allowedExtensions.includes(file.name.toLowerCase().split(".").pop() ?? "")
        ) {
          invalidFiles.push(`${file.name} (unsupported file type)`);
          continue;
        }

        validFiles.push(file);
      }

      if (invalidFiles.length > 0) {
        setUploadError(
          `Some files were rejected:\n${invalidFiles.join("\n")}`
        );
      }

      if (validFiles.length === 0) {
        event.target.value = "";
        return;
      }

      setIsUploading(true);

      try {
        const uploadResponses = await Promise.all(
          validFiles.map(async (file: File) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("filename", file.name);

            const response = await fetch("/api/files/upload", {
              method: "POST",
              body: formData,
            });

            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload?.error || "Upload failed");
            }

            return { file, payload };
          })
        );

        const processedFiles = await Promise.all(
          uploadResponses.map(async ({ file, payload }: { file: File; payload: any }) => ({
            tempId: payload.tempId,
            filename: file.name,
            contentType: file.type,
            size: file.size,
            fileBuffer: await file.arrayBuffer(),
          }))
        );

  setPendingClientFiles((current: PendingClientFile[]) => [...current, ...processedFiles]);
        toast({
          type: "success",
          description: `${processedFiles.length} file${
            processedFiles.length > 1 ? "s" : ""
          } ready for assignment.`,
        });
      } catch (error) {
        console.error("Failed to upload files:", error);
        setUploadError(
          error instanceof Error ? error.message : "Failed to upload files."
        );
      } finally {
        setIsUploading(false);
        event.target.value = "";
      }
    },
    [setPendingClientFiles]
  );

  const removePendingFile = useCallback(
    (tempId: string) => {
      setPendingClientFiles((current: PendingClientFile[]) =>
        current.filter((file: PendingClientFile) => file.tempId !== tempId)
      );
    },
    [setPendingClientFiles]
  );

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="flex h-full w-full flex-col gap-4 overflow-hidden border-l border-border bg-card p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-4">
          <SheetTitle>Assign uploaded files</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Choose which client should receive your uploaded files.
          </p>
        </SheetHeader>

        <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4">
          <div className="rounded-lg border bg-background px-4 py-3 text-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">Upload files</p>
                  <p className="text-xs text-muted-foreground">
                    Pick the files you want to attach to a client.
                  </p>
                </div>
                <Button onClick={handleUploadClick} size="sm" type="button">
                  <PlusIcon className="mr-1 size-3.5" />
                  Add files
                </Button>
              </div>
              <input
                accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.csv,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                multiple
                onChange={handleFileSelection}
                ref={fileInputRef}
                type="file"
              />
              {uploadError && (
                <p className="text-xs text-destructive whitespace-pre-line">
                  {uploadError}
                </p>
              )}
              {isUploading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Uploading files…
                </div>
              )}
              <div className="rounded-md border px-3 py-2 text-xs">
                {visibleFiles.length === 0 ? (
                  <p className="text-muted-foreground">
                    No files uploaded yet.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {visibleFiles.map((file: PendingClientFile) => (
                      <li
                        className="flex items-center justify-between gap-2"
                        key={file.tempId}
                      >
                        <span className="truncate">{file.filename}</span>
                        <button
                          className="text-xs text-destructive hover:underline"
                          onClick={() => removePendingFile(file.tempId)}
                          type="button"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search clients by name..."
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              />
              {isLoading && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="rounded-lg border bg-background p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">
                Selected client
              </p>
              <p className="text-sm font-semibold text-foreground">
                {selectedClient ? selectedClient.name : "No client selected"}
              </p>
            </div>
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}

          <ScrollArea className="flex-1 min-h-0 rounded-lg border bg-background">
            <div className="divide-y">
              {results.length === 0 && !isLoading ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? "No clients matched your search."
                    : "Start typing to find a client."}
                </p>
              ) : (
                results.map((client: ClientSearchResult) => {
                  const isSelected = selectedClient?.id === client.id;
                  return (
                    <button
                      key={client.id}
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm transition",
                        isSelected
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted",
                      )}
                      onClick={() => {
                        setSelectedClient(client);
                        setErrorMessage(null);
                      }}
                      type="button"
                    >
                      <p className="font-medium">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[client.type, client.county, client.email]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <div className="mt-auto pt-2">
            <Button
              className="w-full"
              disabled={
                visibleFiles.length === 0 || isAssigning || !selectedClient
              }
              onClick={handleAssign}
            >
              {isAssigning ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Attaching files...
                </>
              ) : (
                "Attach files to client"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
