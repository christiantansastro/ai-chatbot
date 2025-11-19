export interface PendingFilePayload {
  tempId: string;
  filename: string;
  contentType: string;
  size: number;
  fileBuffer: string;
}

export interface PendingFileContext {
  clientName?: string;
  tempFiles?: PendingFilePayload[];
  storedFiles?: Array<{
    id?: string;
    name: string;
    url: string;
    contentType: string;
  }>;
  timestamp: number;
}

const fileContextMap = new Map<string, PendingFileContext>();

export function setFileContext(chatId: string, context: Omit<PendingFileContext, "timestamp">) {
  fileContextMap.set(chatId, {
    ...context,
    timestamp: Date.now(),
  });
}

export function getFileContext(chatId: string): PendingFileContext | undefined {
  const context = fileContextMap.get(chatId);
  if (!context) {
    return undefined;
  }

  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - context.timestamp > fiveMinutes) {
    fileContextMap.delete(chatId);
    return undefined;
  }

  return context;
}

export function clearFileContext(chatId: string) {
  fileContextMap.delete(chatId);
}
