import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  DownloadIcon,
  CopyIcon,
  MessageIcon,
  PenIcon,
} from "@/components/icons";

type ClientReportArtifactMetadata = {
  // Add any metadata specific to client reports if needed
};

export const clientReportArtifact = new Artifact<
  "client-report",
  ClientReportArtifactMetadata
>({
  kind: "client-report",
  description:
    "Professional client report document with client information and communication history.",
  initialize: async ({ documentId, setMetadata }) => {
    // Initialize metadata if needed
    setMetadata({});
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    // Handle streaming for client reports
    if (streamPart.type === "data-textDelta") {
      setArtifact((draftArtifact) => {
        const newContent = draftArtifact.content + streamPart.data;
        // For client reports, show the artifact panel with HTML content preview
        console.log("🔍 CLIENT REPORT ARTIFACT: StreamPart received", {
          dataLength: streamPart.data.length,
          newContentLength: newContent.length,
          currentVisible: draftArtifact.isVisible,
        });

        return {
          ...draftArtifact,
          content: newContent,
          isVisible: false, // Hide artifact panel for client reports - only show when clicked
          status: "streaming",
        };
      });
    }
  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
  }) => {
    if (isLoading) {
      return (
        <div className="flex w-full flex-col gap-4 p-8">
          <div className="h-12 w-1/2 animate-pulse rounded-lg bg-muted-foreground/20" />
          <div className="h-5 w-full animate-pulse rounded-lg bg-muted-foreground/20" />
          <div className="h-5 w-full animate-pulse rounded-lg bg-muted-foreground/20" />
          <div className="h-5 w-1/3 animate-pulse rounded-lg bg-muted-foreground/20" />
        </div>
      );
    }

    // For client reports, we'll display the HTML content as a document
    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-950">
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-4xl min-h-full">
            {/* Render HTML content as a document */}
            <div
              className="prose prose-sm max-w-none dark:prose-invert p-8"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>
        </div>
      </div>
    );
  },
  actions: [
    {
      icon: <DownloadIcon size={18} />,
      description: "Download as Word document",
      onClick: async ({ content }) => {
        try {
          // Extract client name from HTML content (simple parsing)
          const clientNameMatch = content.match(
            /<div class="label">Client Name<\/div>\s*<div class="value">([^<]+)<\/div>/
          );
          const dateMatch = content.match(
            /<div class="date">Report Date: ([^<]+)<\/div>/
          );

          const clientName = clientNameMatch ? clientNameMatch[1] : null;
          const reportDate = dateMatch ? dateMatch[1] : null;

          // Call the download API
          const response = await fetch("/api/client-report-download", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              htmlContent: content,
              clientName,
              reportDate,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to generate document");
          }

          // Get the blob from the response
          const blob = await response.blob();

          // Create download link
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${clientName ? `client-report-${clientName}` : "client-report"}.docx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          toast.success("Client report downloaded!");
        } catch (error) {
          console.error("Download error:", error);
          toast.error("Failed to download client report");
        }
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy HTML content",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("HTML content copied to clipboard!");
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: "Edit report details",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please help me edit this client report. What changes would you like to make?",
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Get report insights",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please analyze this client report and provide insights about the client's status.",
            },
          ],
        });
      },
    },
  ],
});
