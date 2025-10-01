import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ClientReportDownloadProps {
  documentId: string;
  clientName: string;
  title: string;
}

export function ClientReportDownload({
  documentId,
  clientName,
  title
}: ClientReportDownloadProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);

      // Call the download API
      const response = await fetch('/api/client-report-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          clientName,
          reportTitle: title,
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

      toast.success("Client report downloaded!");
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download client report");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="client-report-download my-4 p-4 bg-muted rounded-lg">
      <p className="mb-3">Client report for {clientName} is ready.</p>
      <Button
        onClick={handleDownload}
        disabled={isDownloading}
        className="download-button"
      >
        {isDownloading ? "Downloading..." : "Download Document"}
      </Button>
    </div>
  );
}