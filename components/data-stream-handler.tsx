"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { initialArtifactData, useArtifact } from "@/hooks/use-artifact";
import { artifactDefinitions, type UIArtifact } from "./artifact";
import { useDataStream } from "./data-stream-provider";

// Function to download financial statement as Word document
async function downloadFinancialStatement(content: string, title: string) {
  try {
    // Extract client name from title (format: "Financial Statement - ClientName")
    const clientNameMatch = title.match(/Financial Statement - (.+)/);
    const clientName = clientNameMatch ? clientNameMatch[1] : null;

    // Extract date from HTML content
    const dateMatch = content.match(/<div class="date">Statement Date: ([^<]+)<\/div>/);
    const statementDate = dateMatch ? dateMatch[1] : null;

    // Call the download API
    const response = await fetch('/api/financial-statement-download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        htmlContent: content,
        clientName,
        statementDate,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate document');
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName ? `financial-statement-${clientName}` : 'financial-statement'}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download error:', error);
    toast.error("Failed to download financial statement");
  }
}

// Function to download client report as Word document
async function downloadClientReport(content: string, title: string) {
  try {
    // Extract client name from title (format: "Client Report - ClientName")
    const clientNameMatch = title.match(/Client Report - (.+)/);
    const clientName = clientNameMatch ? clientNameMatch[1] : null;

    // Extract date from HTML content
    const dateMatch = content.match(/<div class="date">Report Date: ([^<]+)<\/div>/);
    const reportDate = dateMatch ? dateMatch[1] : null;

    // Call the download API
    const response = await fetch('/api/client-report-download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        htmlContent: content,
        clientName,
        reportDate,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate document');
    }

    // Get the blob from the response
    const blob = await response.blob();

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clientName ? `client-report-${clientName}` : 'client-report'}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download error:', error);
    toast.error("Failed to download client report");
  }
}

export function DataStreamHandler() {
  const { dataStream } = useDataStream();

  const { artifact, setArtifact, setMetadata } = useArtifact();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    for (const delta of newDeltas) {
      console.log('🔍 DATASTREAM DEBUG: Processing delta:', delta);

      // Update artifact state based on delta type
      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: "streaming" };
        }

        let updatedArtifact: UIArtifact;
        switch (delta.type) {
          case "data-id":
            updatedArtifact = {
              ...draftArtifact,
              documentId: delta.data,
              status: "streaming" as const,
            };
            break;

          case "data-title":
            updatedArtifact = {
              ...draftArtifact,
              title: delta.data,
              status: "streaming" as const,
            };
            break;

          case "data-kind":
            updatedArtifact = {
              ...draftArtifact,
              kind: delta.data,
              status: "streaming" as const,
            };
            break;

          case "data-clear":
            updatedArtifact = {
              ...draftArtifact,
              content: "",
              status: "streaming" as const,
            };
            break;

          case "data-finish":
            // For financial statements and client reports, don't open the artifact panel, just trigger download
            if (draftArtifact.kind === "financial-statement") {
              updatedArtifact = {
                ...draftArtifact,
                status: "idle" as const,
                isVisible: false, // Don't show the artifact panel
              };

              // Show toast notification
              toast.success("Financial statement generated! Click to download.", {
                action: {
                  label: "Download",
                  onClick: () => {
                    // Trigger download
                    downloadFinancialStatement(draftArtifact.content, draftArtifact.title);
                  },
                },
              });
            } else if (draftArtifact.kind === "client-report") {
              updatedArtifact = {
                ...draftArtifact,
                status: "idle" as const,
                isVisible: false, // Don't show the artifact panel
              };

              // Don't show toast - download button will be shown in chat message
            } else {
              updatedArtifact = {
                ...draftArtifact,
                status: "idle" as const,
                isVisible: true, // Make sure artifact is visible when finished for other types
              };
            }
            break;

          default:
            updatedArtifact = draftArtifact;
        }

        console.log('🔍 DATASTREAM DEBUG: Artifact state updated:', updatedArtifact);
        return updatedArtifact;
      });

      // Now find the artifact definition with updated artifact state
      const currentArtifact = artifactDefinitions.find(
        (currentArtifactDefinition) =>
          currentArtifactDefinition.kind === (delta.type === "data-kind" ? delta.data : artifact.kind)
      );

      if (currentArtifact?.onStreamPart) {
        currentArtifact.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: "streaming" };
        }

        switch (delta.type) {
          case "data-id":
            return {
              ...draftArtifact,
              documentId: delta.data,
              status: "streaming",
            };

          case "data-title":
            return {
              ...draftArtifact,
              title: delta.data,
              status: "streaming",
            };

          case "data-kind":
            return {
              ...draftArtifact,
              kind: delta.data,
              status: "streaming",
            };

          case "data-clear":
            return {
              ...draftArtifact,
              content: "",
              status: "streaming",
            };

          case "data-finish":
            return {
              ...draftArtifact,
              status: "idle",
            };

          default:
            return draftArtifact;
        }
      });
    }
  }, [dataStream, setArtifact, setMetadata, artifact]);

  return null;
}
