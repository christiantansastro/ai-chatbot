"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import {
  type ChangeEvent,
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
import { FileStorageManager } from "@/lib/utils/file-storage-manager";
import { EdgeCaseHandler } from "@/lib/utils/edge-case-handler";
import { identifyClientsInText, getPrimaryClientReference } from "@/lib/utils/client-identification";
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
  PaperclipIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { SuggestedActions } from "./suggested-actions";
import { Button } from "./ui/button";
import type { VisibilityType } from "./visibility-selector";

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

  const [tempFiles, setTempFiles] = useState<Array<{
    tempId: string;
    filename: string;
    contentType: string;
    size: number;
    fileBuffer: ArrayBuffer;
  }>>([]);

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  // Handle client assignment for temporary files
  const handleClientAssignment = useCallback(async (clientMessage: string) => {
    try {
      if (tempFiles.length === 0) {
        toast.info('No temporary files to assign');
        return;
      }

      // Extract client name from message
      const clientMatch = clientMessage.match(/(?:for|to)\s+client\s+([A-Za-z\s]+)|client\s+([A-Za-z\s]+)/i);
      const clientName = clientMatch ? (clientMatch[1] || clientMatch[2]).trim() : clientMessage.trim();

      if (!clientName || clientName.length < 2) {
        toast.error('Please specify a valid client name');
        return;
      }

      // Get current user session
      const session = await fetch('/api/auth/session').then(res => res.json());
      if (!session?.user?.id) {
        toast.error('Authentication required');
        return;
      }

      // Store all temp files with the identified client
      const storePromises = tempFiles.map(async (tempFile) => {
        const response = await fetch("/api/files/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tempId: tempFile.tempId,
            filename: tempFile.filename,
            contentType: tempFile.contentType,
            size: tempFile.size,
            fileBuffer: btoa(String.fromCharCode(...new Uint8Array(tempFile.fileBuffer))),
            clientName: clientName,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          return {
            url: result.url,
            name: tempFile.filename,
            contentType: tempFile.contentType,
          };
        }
        throw new Error('Failed to store file');
      });

      const storedFiles = await Promise.all(storePromises);

      if (storedFiles.length > 0) {
        // Update attachments with stored file URLs
        const newAttachments = storedFiles.map(file => ({
          url: file.url,
          name: file.name,
          contentType: file.contentType,
        }));

        setAttachments(newAttachments);
        setTempFiles([]);

        toast.success(`${storedFiles.length} file(s) stored for client: ${clientName}`);
      }
    } catch (error) {
      console.error('Error assigning files to client:', error);
      toast.error('Failed to assign files to client');
    }
  }, [tempFiles, chatId, setAttachments, setTempFiles]);

  const submitForm = useCallback(async () => {
    try {
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

      let finalAttachments = attachments;
      let needsClientAssignment = false;

      // Handle temp files that need client assignment
      if (tempFiles.length > 0) {
        // Check if client is identified in the message
        const clientIdentification = await identifyClientsInText(input);

        if (clientIdentification.success && clientIdentification.clients.length > 0) {
          const primaryClient = getPrimaryClientReference(clientIdentification.clients);

          if (primaryClient) {
            // Store files to Supabase Storage and database with identified client
            try {
              const storePromises = tempFiles.map(async (tempFile) => {
                const response = await fetch("/api/files/store", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    tempId: tempFile.tempId,
                    filename: tempFile.filename,
                    contentType: tempFile.contentType,
                    size: tempFile.size,
                    fileBuffer: btoa(String.fromCharCode(...new Uint8Array(tempFile.fileBuffer))),
                    clientName: primaryClient.name,
                  }),
                });

                if (response.ok) {
                  const result = await response.json();
                  return {
                    url: result.url,
                    name: tempFile.filename,
                    contentType: tempFile.contentType,
                  };
                }
                throw new Error('Failed to store file');
              });

              const storedFiles = await Promise.all(storePromises);
              finalAttachments = storedFiles;

              // Clear temp files since they've been stored
              setTempFiles([]);

              toast.success(`Files stored for client: ${primaryClient.name}`);
            } catch (error) {
              console.error('Error storing files:', error);
              toast.error('Failed to store files. They will remain in temporary queue.');
              needsClientAssignment = true;
            }
          } else {
            needsClientAssignment = true;
          }
        } else {
          needsClientAssignment = true;
        }
      }

      // Send the message to AI (no files sent to AI, but pass temp file data in context)
      window.history.replaceState({}, "", `/chat/${chatId}`);

      // Clear temp file data since files have been stored successfully
      if (tempFiles.length > 0 && finalAttachments.length > 0) {
        // Files were stored successfully, clear temp data and update state
        sessionStorage.removeItem(`tempFiles_${chatId}`);
        setTempFiles([]);
        console.log(`📁 CLIENT: Cleared ${tempFiles.length} temp files after successful storage`);
      } else if (tempFiles.length > 0) {
        // Files need client assignment, keep temp data
        sessionStorage.setItem(`tempFiles_${chatId}`, JSON.stringify(tempFiles));
        console.log(`📁 CLIENT: Keeping ${tempFiles.length} temp files for client assignment`);
      }

      // Send the original user message without modification
      const messageToSend = input;

      sendMessage({
        role: "user",
        parts: [
          {
            type: "text",
            text: messageToSend,
          },
        ],
      });

      // Clear form state
      setAttachments([]);
      setLocalStorageInput("");
      resetHeight();
      setInput("");

      if (width && width > 768) {
        textareaRef.current?.focus();
      }

      // Handle post-submission logic for temp files
      if (needsClientAssignment && tempFiles.length > 0) {
        toast.warning(`Please specify which client these ${tempFiles.length} file(s) are for.`);
      }

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
    tempFiles,
    sendMessage,
    setAttachments,
    setTempFiles,
    setLocalStorageInput,
    width,
    chatId,
    resetHeight,
  ]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (_error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, []);

  const _modelResolver = useMemo(() => {
    return myProvider.languageModel(selectedModelId);
  }, [selectedModelId]);

  const contextProps = useMemo(
    () => ({
      usage,
    }),
    [usage]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];

      // Validate files before uploading
      for (const file of files) {
        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
          invalidFiles.push(`${file.name} (file too large - max 10MB)`);
          continue;
        }

        // Check file type
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/csv'
        ];

        if (!allowedTypes.includes(file.type)) {
          // Also check by file extension as fallback
          const extension = file.name.toLowerCase().split('.').pop();
          const allowedExtensions = ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xlsx', 'csv'];

          if (!extension || !allowedExtensions.includes(extension)) {
            invalidFiles.push(`${file.name} (unsupported file type)`);
            continue;
          }
        }

        validFiles.push(file);
      }

      // Show errors for invalid files
      if (invalidFiles.length > 0) {
        toast.error(`Some files were rejected:\n${invalidFiles.join('\n')}`);
      }

      if (validFiles.length === 0) {
        return;
      }

      setUploadQueue(validFiles.map((file) => file.name));

      try {
        // Upload files to get temp IDs (no storage yet)
        const tempFilePromises = validFiles.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("filename", file.name); // Send filename explicitly

          console.log('📁 CLIENT DEBUG: Uploading file:', {
            name: file.name,
            type: file.type,
            size: file.size,
            formDataFilename: formData.get("filename")
          });

          const response = await fetch("/api/files/upload", {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const result = await response.json();
            console.log('📁 CLIENT DEBUG: Upload response:', result);
            return result;
          }
          const error = await response.json();
          throw new Error(error.error || "Upload failed");
        });

        const tempFileResults = await Promise.all(tempFilePromises);
        const validTempFiles = tempFileResults.filter((result) => result.tempId);

        console.log('📁 CLIENT DEBUG: Upload results:', tempFileResults);
        console.log('📁 CLIENT DEBUG: Valid temp files:', validTempFiles);

        // Store file buffers for later storage
        const filesWithBuffers = await Promise.all(
          validFiles.map(async (file) => {
            const matchedTempFile = validTempFiles.find(t => t.filename === file.name);
            console.log('📁 CLIENT DEBUG: Matching file:', {
              originalName: file.name,
              matchedTempFile: matchedTempFile,
              matchedFilename: matchedTempFile?.filename
            });

            return {
              tempId: matchedTempFile?.tempId,
              filename: file.name,
              contentType: file.type,
              size: file.size,
              fileBuffer: await file.arrayBuffer(),
            };
          })
        );

        const filesWithValidTempIds = filesWithBuffers.filter(f => f.tempId);

        if (filesWithValidTempIds.length > 0) {
          setTempFiles((currentTempFiles) => [
            ...currentTempFiles,
            ...filesWithValidTempIds,
          ]);

          // Create temporary attachments for preview (no image preview for temp files)
          const tempAttachments = filesWithValidTempIds.map((tempFile) => ({
            url: '', // No preview URL for temp files
            name: tempFile.filename,
            contentType: tempFile.contentType,
          }));

          setAttachments((currentAttachments) => [
            ...currentAttachments,
            ...tempAttachments,
          ]);

          toast.success(`${filesWithValidTempIds.length} file(s) ready. Please specify the client.`);
        }
      } catch (error) {
        console.error("Error processing files!", error);
        toast.error("Failed to process some files. Please try again.");
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments]
  );

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions
            chatId={chatId}
            selectedVisibilityType={selectedVisibilityType}
            sendMessage={sendMessage}
          />
        )}

      <input
        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xlsx,.csv,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

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
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
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
            <AttachmentsButton
              fileInputRef={fileInputRef}
              selectedModelId={selectedModelId}
              status={status}
            />
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
              disabled={!input.trim() || uploadQueue.length > 0}
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
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedModelId !== nextProps.selectedModelId) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  status,
  selectedModelId,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers<ChatMessage>["status"];
  selectedModelId: string;
}) {
  const isReasoningModel = selectedModelId === "chat-model-reasoning";

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={status !== "ready" || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

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
