"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { saveChatModelAsCookie } from "@/app/(chat)/actions";
import { SelectItem } from "@/components/ui/select";
import { chatModels } from "@/lib/ai/models";
import { myProvider } from "@/lib/ai/providers";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";

import { EdgeCaseHandler } from "@/lib/utils/edge-case-handler";
import { Context } from "./elements/context";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CpuIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";
import type { PendingClientFile } from "@/lib/types/uploads";

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType,
  selectedModelId,
  onModelChange,
  pendingClientFiles,
  storedClientAttachments,
  setStoredClientAttachments,
  attachedClientName,
  setAttachedClientName,
  onOpenClientAssignment,
  usage,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  pendingClientFiles: PendingClientFile[];
  storedClientAttachments: Attachment[];
  setStoredClientAttachments: Dispatch<SetStateAction<Attachment[]>>;
  attachedClientName: string | null;
  setAttachedClientName: Dispatch<SetStateAction<string | null>>;
  onOpenClientAssignment: () => void;
  usage?: AppUsage;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    "input",
    ""
  );


  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustHeight, localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const submitForm = useCallback(async () => {
    try {
      if (pendingClientFiles.length > 0) {
        toast.error("Assign uploaded files to a client before sending a message.");
        return;
      }

      // Validate message and attachments
      const messageValidation = EdgeCaseHandler.validateMessageText(input);
      if (!messageValidation.isValid) {
        EdgeCaseHandler.showErrorMessage({
          handled: true,
          shouldContinue: false,
          message: `Message validation failed: ${messageValidation.errors.join(', ')}`
        });
        return;
      }

      // Get current user session
      const session = await fetch('/api/auth/session').then(res => res.json());
      if (!session?.user?.id) {
        EdgeCaseHandler.showErrorMessage({
          handled: true,
          shouldContinue: false,
          message: 'Authentication required for file operations'
        });
        return;
      }

      const finalAttachments = [
        ...storedClientAttachments,
        ...attachments,
      ];

      let fileContextForAI = null;
      if (finalAttachments.length > 0) {
        const clientMatch = input.match(
          /(?:for|to)\s+client\s+([A-Za-z\s]+)|client\s+([A-Za-z\s]+)/i
        );
        const extractedClientName = clientMatch
          ? (clientMatch[1] || clientMatch[2]).trim()
          : null;

        fileContextForAI = {
          hasStoredFiles: true,
          hasPendingClientFiles: false,
          storedFiles: finalAttachments,
          pendingFilesCount: 0,
          clientName: attachedClientName || extractedClientName,
        };

        sessionStorage.setItem(
          `aiFileContext_${chatId}`,
          JSON.stringify(fileContextForAI)
        );
        console.log(`📁 CLIENT: Stored file context for API:`, fileContextForAI);
      }



      // Send clean original message to chat (no visible context added)
      sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: input, // Keep original message clean and visible
          },
        ],
      });

      // Clear form state
      setAttachments([]);
      setAttachedClientName(null);
      setLocalStorageInput("");
      resetHeight();
      setInput("");

      if (width && width > 768) {
        textareaRef.current?.focus();
      }

      // Handle post-submission logic for temp files
      setStoredClientAttachments([]);

    } catch (error) {
      console.error('Error in submitForm:', error);
      EdgeCaseHandler.showErrorMessage(
        EdgeCaseHandler.handleUnexpectedError(error, 'message submission')
      );
    }
  }, [
    input,
    setInput,
    attachments,
    pendingClientFiles,
    storedClientAttachments,
    sendMessage,
    setAttachments,
    setStoredClientAttachments,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
    attachedClientName,
  ]);

  const _modelResolver = useMemo(() => {
    return myProvider.languageModel(selectedModelId);
  }, [selectedModelId]);

  const contextProps = useMemo(
    () => ({
      usage,
    }),
    [usage]
  );

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {messages.length === 0 &&
        attachments.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      {pendingClientFiles.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-sm shadow-xs">
          <p className="font-medium text-foreground">
            {pendingClientFiles.length} file
            {pendingClientFiles.length > 1 ? "s are" : " is"} waiting for client assignment.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Use the "Assign files" button near Client quick search to choose who should receive them.
            </span>
            <Button onClick={onOpenClientAssignment} size="sm" variant="outline">
              Assign now
            </Button>
          </div>
        </div>
      )}

      <PromptInput
        className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
          if (status !== "ready") {
            toast.error("Please wait for the model to finish its response!");
          } else {
            submitForm();
          }
        }}
      >
        {attachments.length > 0 && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) => {
                    const next = currentAttachments.filter(
                      (a) =>
                        !(
                          a.url === attachment.url &&
                          a.name === attachment.name
                        )
                    );
                    if (next.length === 0) {
                      setAttachedClientName(null);
                    }
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}
        <div className="flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            autoFocus
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder="Send a message..."
            ref={textareaRef}
            rows={1}
            value={input}
          />{" "}
          <Context {...contextProps} />
        </div>
        <PromptInputToolbar className="!border-top-0 border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <ModelSelectorCompact
              onModelChange={onModelChange}
              selectedModelId={selectedModelId}
            />
          </PromptInputTools>

          {status === "submitted" ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <PromptInputSubmit
              className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              disabled={!input.trim() || pendingClientFiles.length > 0}
              status={status}
            >
              <ArrowUpIcon size={14} />
            </PromptInputSubmit>
          )}
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.pendingClientFiles !== nextProps.pendingClientFiles) {
      return false;
    }
    if (!equal(prevProps.storedClientAttachments, nextProps.storedClientAttachments)) {
      return false;
    }
    if (prevProps.attachedClientName !== nextProps.attachedClientName) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureModelSelectorCompact({
  selectedModelId,
  onModelChange,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
}) {
  const [optimisticModelId, setOptimisticModelId] = useState(selectedModelId);

  useEffect(() => {
    setOptimisticModelId(selectedModelId);
  }, [selectedModelId]);

  const selectedModel = chatModels.find(
    (model) => model.id === optimisticModelId
  );

  return (
    <PromptInputModelSelect
      onValueChange={(modelName) => {
        const model = chatModels.find((m) => m.name === modelName);
        if (model) {
          setOptimisticModelId(model.id);
          onModelChange?.(model.id);
          startTransition(() => {
            saveChatModelAsCookie(model.id);
          });
        }
      }}
      value={selectedModel?.name}
    >
      <Trigger
        className="flex h-8 items-center gap-2 rounded-lg border-0 bg-background px-2 text-foreground shadow-none transition-colors hover:bg-accent focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        type="button"
      >
        <CpuIcon size={16} />
        <span className="hidden font-medium text-xs sm:block">
          {selectedModel?.name}
        </span>
        <ChevronDownIcon size={16} />
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[260px] p-0">
        <div className="flex flex-col gap-px">
          {chatModels.map((model) => (
            <SelectItem key={model.id} value={model.name}>
              <div className="truncate font-medium text-xs">{model.name}</div>
              <div className="mt-px truncate text-[10px] text-muted-foreground leading-tight">
                {model.description}
              </div>
            </SelectItem>
          ))}
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const ModelSelectorCompact = memo(PureModelSelectorCompact);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      className="size-7 rounded-full bg-foreground p-1 text-background transition-colors duration-200 hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);



