export const DEFAULT_CHAT_MODEL: string = "chat-model";

export type ChatModel = {
  id: string;
  name: string;
  description: string;
};

export const chatModels: ChatModel[] = [
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
