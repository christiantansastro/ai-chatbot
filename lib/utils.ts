import type {
  CoreAssistantMessage,
  CoreToolMessage,
  UIMessage,
  UIMessagePart,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { formatISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import type { DBMessage, Document } from '@/lib/db/schema';
import { ChatSDKError, type ErrorCode } from './errors';
import type { ChatMessage, ChatTools, CustomUIDataTypes } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    const { code, cause } = await response.json();
    throw new ChatSDKError(code as ErrorCode, cause);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await response.json();
      throw new ChatSDKError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ChatSDKError('offline:chat');
    }

    throw error;
  }
}

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ResponseMessageWithoutId = CoreToolMessage | CoreAssistantMessage;
type ResponseMessage = ResponseMessageWithoutId & { id: string };

export function getMostRecentUserMessage(messages: UIMessage[]) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Document[],
  index: number,
) {
  if (!documents) { return new Date(); }
  if (index > documents.length) { return new Date(); }

  return documents[index].createdAt;
}

export function getTrailingMessageId({
  messages,
}: {
  messages: ResponseMessage[];
}): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) { return null; }

  return trailingMessage.id;
}

export function sanitizeText(text: string) {
  return text.replace('<has_function_call>', '');
}

export function convertToUIMessages(messages: DBMessage[]): ChatMessage[] {
  console.log('Converting DB messages to UI messages:', messages.length);

  return messages.map((message, index) => {
    console.log(`Converting message ${index}:`, {
      id: message.id,
      role: message.role,
      parts: message.parts,
      partsType: typeof message.parts,
      hasParts: !!message.parts
    });

    const uiMessage = {
      id: message.id,
      role: message.role as 'user' | 'assistant' | 'system',
      parts: message.parts as UIMessagePart<CustomUIDataTypes, ChatTools>[],
      metadata: {
        createdAt: formatISO(message.createdAt),
      },
    };

    console.log(`Converted message ${index}:`, uiMessage);
    return uiMessage;
  });
}

export function getTextFromMessage(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function convertMessagePartsToStrings(parts: any[]): string[] {
  console.log('Converting message parts to strings:', parts);
  if (!parts || !Array.isArray(parts)) {
    console.log('Parts is not an array or is null/undefined, returning empty array');
    return [];
  }

  return parts.map((part, index) => {
    console.log(`Processing part ${index}:`, part, 'Type:', typeof part);

    if (!part) {
      console.log(`Part ${index} is null/undefined, returning empty string`);
      return '';
    }

    if (part.type === 'text' && part.text !== undefined) {
      console.log(`Part ${index} is text type with text:`, part.text);
      return part.text;
    } else if (part.type === 'data-textDelta' && part.data !== undefined) {
      console.log(`Part ${index} is data-textDelta type with data:`, part.data);
      return part.data;
    } else if (part.text !== undefined) {
      // Fallback: if it has a text property but different type
      console.log(`Part ${index} has text property (fallback):`, part.text);
      return part.text;
    } else if (part.data !== undefined) {
      // Fallback: if it has a data property but different type
      console.log(`Part ${index} has data property (fallback):`, part.data);
      return part.data;
    } else {
      // For other types, convert to string representation
      console.log(`Part ${index} is unknown type, converting to string:`, part);
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    }
  });
}
