import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface FinancialStatementDownloadProps {
  documentId: string;
  clientName: string;
  title: string;
}

export function FinancialStatementDownload({ 
  documentId, 
  clientName, 
  title 
}: FinancialStatementDownloadProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      
      // Call the download API
      const response = await fetch('/api/financial-statement-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          clientName,
          statementTitle: title,
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
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="financial-statement-download my-4 p-4 bg-muted rounded-lg">
      <p className="mb-3">Financial statement for {clientName} is ready.</p>
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