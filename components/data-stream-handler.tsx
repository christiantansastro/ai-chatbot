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

  const applyArtifactDelta = (current: UIArtifact, delta: any): UIArtifact => {
    const base = current ?? { ...initialArtifactData };
    let next: UIArtifact = { ...base };

    switch (delta.type) {
      case "data-id":
        next = {
          ...next,
          documentId: delta.data,
          status: "streaming",
        };
        break;
      case "data-title":
        next = {
          ...next,
          title: delta.data,
          status: "streaming",
        };
        break;
      case "data-kind":
        next = {
          ...next,
          kind: delta.data,
          status: "streaming",
        };
        break;
      case "data-clear":
        next = {
          ...next,
          content: "",
          status: "streaming",
        };
        break;
      case "data-finish":
        if (next.kind === "financial-statement") {
          next = {
            ...next,
            status: "idle",
            isVisible: false,
          };
        } else if (next.kind === "client-report") {
          next = {
            ...next,
            status: "idle",
            isVisible: false, // Hide client reports by default - only show button
          };
        } else {
          next = {
            ...next,
            status: "idle",
            isVisible: true,
          };
        }
        break;
      default:
        break;
    }

    return next;
  };

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    let currentArtifactState = {
      ...(artifact ?? initialArtifactData),
    };

    for (const delta of newDeltas) {
      const nextArtifactState = applyArtifactDelta(currentArtifactState, delta);

      if (delta.type === "data-finish") {
        if (currentArtifactState.kind === "financial-statement") {
          toast.success("Financial statement generated! Click to download.", {
            action: {
              label: "Download",
              onClick: () => {
                downloadFinancialStatement(
                  currentArtifactState.content,
                  currentArtifactState.title
                );
              },
            },
          });
        } else if (currentArtifactState.kind === "client-report") {
          // Intentionally no toast; download option appears in chat UI
        }
      }

      setArtifact(nextArtifactState);
      currentArtifactState = nextArtifactState;

      const currentArtifactDefinition = artifactDefinitions.find(
        (definition) => definition.kind === nextArtifactState.kind
      );

      if (currentArtifactDefinition?.onStreamPart) {
        currentArtifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }
    }
  }, [artifact, dataStream, setArtifact, setMetadata]);

  return null;
}
