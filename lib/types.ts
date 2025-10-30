import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { createDocument } from "./ai/tools/create-document";
import type { createFinancialStatement } from "./ai/tools/create-financial-statement";
import type { createClientReport } from "./ai/tools/create-client-report";
import type { getWeather } from "./ai/tools/get-weather";
import type { updateDocument } from "./ai/tools/update-document";
import type { Suggestion } from "./db/schema";
import type { AppUsage } from "./usage";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
  fileContext: z.object({
    hasStoredFiles: z.boolean(),
    hasTempFiles: z.boolean(),
    storedFiles: z.array(z.object({
      name: z.string(),
      url: z.string(),
      contentType: z.string()
    })).optional(),
    tempFilesCount: z.number(),
    clientName: z.string().optional()
  }).optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type createFinancialStatementTool = InferUITool<ReturnType<typeof createFinancialStatement>>;
type createClientReportTool = InferUITool<ReturnType<typeof createClientReport>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;


export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  createFinancialStatement: createFinancialStatementTool;
  createClientReport: createClientReportTool;
  updateDocument: updateDocumentTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  usage: AppUsage;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
