"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import type { VisibilityType } from "@/components/visibility-selector";
import { myProvider } from "@/lib/ai/providers";
import {
  type CreateClientData,
  createClientRecord,
} from "@/lib/clients/create-client";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from "@/lib/db/queries";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel("title-model"),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}

export async function createClientAction(
  clientData: CreateClientData
): Promise<{
  success: boolean;
  message: string;
  client?: any;
}> {
  try {
    const { formatted, financial, record } = await createClientRecord(
      clientData,
      { includeFinancialTransactions: true }
    );

    for (const errorMessage of financial.errors) {
      console.warn("CLIENT CREATE ACTION: %s", errorMessage);
    }

    return {
      success: true,
      message: `Successfully created client: ${record.client_name}`,
      client: formatted,
    };
  } catch (error) {
    console.error("CLIENT CREATE ACTION: Error creating client:", error);
    return {
      success: false,
      message: `Error creating client: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    };
  }
}
