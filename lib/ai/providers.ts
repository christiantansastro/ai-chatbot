import { openai } from "@ai-sdk/openai";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

console.log('Creating AI provider, isTestEnvironment:', isTestEnvironment);

export const myProvider = isTestEnvironment
  ? (() => {
      console.log('Using mock models for testing');
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-gpt5-mini": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : (() => {
      console.log('Using OpenAI models');
      return customProvider({
        languageModels: {
          "chat-model": openai("gpt-4o-mini"),
          "chat-model-gpt5-mini": openai("gpt-5-mini"),
          "chat-model-reasoning": wrapLanguageModel({
            model: openai("gpt-4o"),
            middleware: extractReasoningMiddleware({ tagName: "think" }),
          }),
          "title-model": openai("gpt-4o-mini"),
          "artifact-model": openai("gpt-4o-mini"),
        },
      });
    })();
