import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  DownloadIcon,
  CopyIcon,
  MessageIcon,
  PenIcon,
} from "@/components/icons";

type FinancialStatementArtifactMetadata = {
  // Add any metadata specific to financial statements if needed
};

export const financialStatementArtifact = new Artifact<"financial-statement", FinancialStatementArtifactMetadata>({
  kind: "financial-statement",
  description: "Professional financial statement document with client transaction history and balance information.",
  initialize: async ({ documentId, setMetadata }) => {
    // Initialize metadata if needed
    setMetadata({});
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    // Handle streaming for financial statements
    if (streamPart.type === "data-textDelta") {
      setArtifact((draftArtifact) => {
        const newContent = draftArtifact.content + streamPart.data;
        const shouldBeVisible =
          draftArtifact.status === "streaming" &&
          (newContent.length > 200 || streamPart.data.includes('<html>'));

        console.log('🔍 FINANCIAL STATEMENT ARTIFACT: StreamPart received', {
          dataLength: streamPart.data.length,
          newContentLength: newContent.length,
          shouldBeVisible,
          currentVisible: draftArtifact.isVisible
        });

        return {
          ...draftArtifact,
          content: newContent,
          isVisible: shouldBeVisible ? true : draftArtifact.isVisible,
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

    // For financial statements, we'll display the HTML content as a document
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
          // Extract client name and date from HTML content (simple parsing)
          const clientNameMatch = content.match(/<p><strong>Client Name:<\/strong> ([^<]+)<\/p>/);
          const dateMatch = content.match(/<div class="date">Statement Date: ([^<]+)<\/div>/);

          const clientName = clientNameMatch ? clientNameMatch[1] : null;
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

          toast.success("Financial statement downloaded!");
        } catch (error) {
          console.error('Download error:', error);
          toast.error("Failed to download financial statement");
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
      description: "Edit statement details",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please help me edit this financial statement. What changes would you like to make?",
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Get statement insights",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please analyze this financial statement and provide insights about the client's financial status.",
            },
          ],
        });
      },
    },
  ],
});