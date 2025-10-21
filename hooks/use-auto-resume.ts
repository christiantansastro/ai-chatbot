"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect, useRef } from "react";
import { useDataStream } from "@/components/data-stream-provider";
import type { ChatMessage } from "@/lib/types";

export type UseAutoResumeParams = {
  autoResume: boolean;
  initialMessages: ChatMessage[];
  resumeStream: UseChatHelpers<ChatMessage>["resumeStream"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
};

export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}: UseAutoResumeParams) {
  const { dataStream } = useDataStream();
  const lastAppendedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoResume) {
      return;
    }

    const mostRecentMessage = initialMessages.at(-1);

    if (mostRecentMessage?.role === "user") {
      resumeStream();
    }

    // we intentionally run this once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, initialMessages, resumeStream]);

  useEffect(() => {
    if (!dataStream?.length) {
      return;
    }

    const latestAppend = [...dataStream]
      .reverse()
      .find((part) => part.type === "data-appendMessage");

    if (!latestAppend) {
      return;
    }

    const message = JSON.parse(latestAppend.data);

    if (!message?.id || message.id === lastAppendedMessageIdRef.current) {
      return;
    }

    lastAppendedMessageIdRef.current = message.id;
    setMessages((previousMessages) => [...previousMessages, message]);
  }, [dataStream, setMessages]);
}
