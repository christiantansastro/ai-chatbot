// Base Agent System
export type { AgentCategory, AgentResponse, QueryClassification, AgentInfo } from "./base-agent";
export { BaseAgent } from "./base-agent";

// Specialized Agents
export { ClientsAgent } from "./clients-agent";
export { FinancialsAgent } from "./financials-agent";
export { CommunicationsAgent } from "./communications-agent";
export { FilesAgent } from "./files-agent";

// Intent Classification
export { IntentClassifier } from "./intent-classifier";

// Query Routing
export type { RoutingResult, RoutingStats } from "./query-router";
export { QueryRouter } from "./query-router";

// Main Multi-Agent System
export type { MultiAgentResponse, SystemStatus, DiagnosticResult } from "./multi-agent-system";
export { MultiAgentSystem } from "./multi-agent-system";

// Chat Integration
export type { AgentSuggestion } from "./chat-integration";
export { ChatIntegration, createChatIntegration, getChatIntegration, initializeChatIntegration } from "./chat-integration";

// Convenience function to create and initialize the multi-agent system
import { MultiAgentSystem, MultiAgentResponse } from "./multi-agent-system";

export async function createMultiAgentSystem(): Promise<MultiAgentSystem> {
  const system = new MultiAgentSystem();
  await system.initialize();
  return system;
}

// Example usage function
export async function processQuery(query: string, context?: any): Promise<MultiAgentResponse> {
  const system = await createMultiAgentSystem();
  return await system.processQuery(query, context);
}