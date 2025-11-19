export const DEFAULT_CHAT_MODEL: string = "chat-model-gpt5-mini";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  {
    id: "chat-model-gpt5-mini",
    name: "OpenAI GPT-5 mini",
    description:
      "Improved reasoning and higher throughput with the latest GPT-5 architecture",
  },
  {
    id: "chat-model",
    name: "OpenAI GPT-4.0 mini",
    description: "Lightweight model with vision and text capabilities",
  },
  {
    id: "chat-model-reasoning",
    name: "OpenAI GPT-4.0",
    description:
      "Uses advanced chain-of-thought reasoning for complex problems",
  },
];
