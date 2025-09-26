import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { auth, type UserType } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import type { ChatModel } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { queryClients } from "@/lib/ai/tools/query-clients";
import { createClient } from "@/lib/ai/tools/create-client";
import { updateClient } from "@/lib/ai/tools/update-client";
import { queryFinancialBalance } from "@/lib/ai/tools/query-financial-balance";
import { addFinancialTransaction } from "@/lib/ai/tools/add-financial-transaction";
import { getFinancialHistory } from "@/lib/ai/tools/get-financial-history";
import { queryCommunications } from "@/lib/ai/tools/query-communications";
import { addCommunication } from "@/lib/ai/tools/add-communication";
import { getCommunicationSummary } from "@/lib/ai/tools/get-communication-summary";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatLastContextById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";
import { testDatabaseOperations } from "@/lib/db/queries";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 } // 24 hours
);

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes("REDIS_URL")) {
        console.log(
          " > Resumable streams are disabled due to missing REDIS_URL"
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    console.log('Received request body:', JSON.stringify(json, null, 2));
    requestBody = postRequestBodySchema.parse(json);
    console.log('Parsed request body successfully');
  } catch (error) {
    console.error('Failed to parse request body:', error);
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    let {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel["id"];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = (session.user as any).type || "regular";

    const messageCount = await getMessageCountByUserId({
      id: session.user.id!,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const chat = await getChatById({ id });

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      const title = await generateTitleFromUserMessage({
        message,
      });

      const savedChat = await saveChat({
        id,
        userId: session.user.id!,
        title,
        visibility: selectedVisibilityType,
      });

      // Use the database-generated chat ID for subsequent operations
      id = savedChat.id;
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    console.log('Saving user message with parts:', message.parts);

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;

    console.log('=== STARTING STREAM PROCESSING ===');
    console.log('Selected model:', selectedChatModel);
    console.log('UI Messages count:', uiMessages.length);

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        console.log('Executing stream with dataStream writer');

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools:
            selectedChatModel === "chat-model-reasoning"
              ? []
              : [
                  "queryClients",
                  "createClient",
                  "updateClient",
                  "queryFinancialBalance",
                  "addFinancialTransaction",
                  "getFinancialHistory",
                  "queryCommunications",
                  "addCommunication",
                  "getCommunicationSummary",
                ],
          experimental_transform: smoothStream({ chunking: "word" }),
          tools: {
            queryClients,
            createClient,
            updateClient,
            queryFinancialBalance,
            addFinancialTransaction,
            getFinancialHistory,
            queryCommunications,
            addCommunication,
            getCommunicationSummary,
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
          onFinish: async ({ usage }) => {
            console.log('=== STREAM FINISH DEBUG ===');
            console.log('Usage data:', usage);

            try {
              const providers = await getTokenlensCatalog();
              const modelId =
                myProvider.languageModel(selectedChatModel).modelId;

              console.log('Model ID:', modelId);
              console.log('Providers:', !!providers);

              if (!modelId) {
                console.log('No model ID, using basic usage');
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              if (!providers) {
                console.log('No providers, using basic usage');
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              const summary = getUsage({ modelId, usage, providers });
              finalMergedUsage = { ...usage, ...summary, modelId } as AppUsage;
              console.log('Final merged usage:', finalMergedUsage);
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            } catch (err) {
              console.warn("TokenLens enrichment failed", err);
              finalMergedUsage = usage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            }
          },
        });

        console.log('Stream created, consuming stream...');
        result.consumeStream();

        console.log('Merging UI message stream...');
        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          })
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        console.log('=== AI RESPONSE FINISH DEBUG ===');
        console.log('Saving AI response messages:', messages.length);

        for (const currentMessage of messages) {
          console.log('Processing AI message:', {
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            partsType: typeof currentMessage.parts,
            hasParts: !!currentMessage.parts
          });

          // Add null safety check
          if (!currentMessage.parts) {
            console.error('AI message parts is undefined/null:', currentMessage);
            continue;
          }

          console.log('AI message parts:', currentMessage.parts);
        }

        // Filter out messages with undefined parts
        const validMessages = messages.filter(msg => {
          if (!msg.parts) {
            console.warn('Skipping message with undefined parts:', msg.id);
            return false;
          }
          return true;
        });

        if (validMessages.length === 0) {
          console.error('No valid messages to save!');
          return;
        }

        console.log('Saving valid messages:', validMessages.length);
        await saveMessages({
          messages: validMessages.map((currentMessage) => ({
            id: currentMessage.id,
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });

        if (finalMergedUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: finalMergedUsage,
            });
          } catch (err) {
            console.warn("Unable to persist last usage for chat", id, err);
          }
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    // const streamContext = getStreamContext();

    // if (streamContext) {
    //   return new Response(
    //     await streamContext.resumableStream(streamId, () =>
    //       stream.pipeThrough(new JsonToSseTransformStream())
    //     )
    //   );
    // }

    console.log('=== CREATING RESPONSE ===');
    console.log('Stream created successfully, piping through JsonToSseTransformStream');

    try {
      const response = new Response(stream.pipeThrough(new JsonToSseTransformStream()));
      console.log('Response created successfully');
      return response;
    } catch (error) {
      console.error('Error creating response:', error);
      throw error;
    }
  } catch (error: unknown) {
    const vercelId = request.headers.get("x-vercel-id");

    console.error("=== CATCHING ERROR IN CHAT API ===");
    console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    console.error("Vercel ID:", vercelId);

    if (error instanceof ChatSDKError) {
      console.error("ChatSDKError details:", error);
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      console.error("AI Gateway credit card error detected");
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    // Check for the specific "Cannot read properties of undefined" error
    if (
      error instanceof TypeError &&
      error.message?.includes("Cannot read properties of undefined")
    ) {
      console.error("=== TYPEERROR: Cannot read properties of undefined ===");
      console.error("This is likely the 'failed to pipe response' error");
      console.error("Full error details:", error);
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const test = searchParams.get("test");

  if (test === "db") {
    // Test database operations
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    try {
      const result = await testDatabaseOperations(session.user.id!);
      return Response.json(result, { status: 200 });
    } catch (error) {
      console.error("Database test failed:", error);
      return new ChatSDKError("bad_request:database").toResponse();
    }
  }

  if (test === "clients") {
    // Test client querying functionality
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return Response.json({
          error: "Missing Supabase configuration",
          details: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required"
        }, { status: 500 });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Test basic connectivity - try with service role to bypass RLS
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      let clients, error;

      if (serviceRoleKey) {
        const serviceSupabase = createClient(supabaseUrl, serviceRoleKey);
        const result = await serviceSupabase
          .from('clients')
          .select('client_name, email, phone, address, contact_1, relationship_1, notes')
          .limit(5);
        clients = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from('clients')
          .select('client_name, email, phone, address, contact_1, relationship_1, notes')
          .limit(5);
        clients = result.data;
        error = result.error;
      }

      if (error) {
        return Response.json({
          error: "Database query failed",
          details: error.message,
          code: error.code
        }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `Found ${clients?.length || 0} clients`,
        data: clients
      }, { status: 200 });
    } catch (error) {
      return Response.json({
        error: "Test failed",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }
  }

  return new ChatSDKError("bad_request:api").toResponse();
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
