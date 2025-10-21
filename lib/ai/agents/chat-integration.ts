/**
 * Chat Integration Module
 * Provides integration between the Multi-Agent System and the existing chat flow
 */

import { MultiAgentSystem, MultiAgentResponse } from "./multi-agent-system";
import type { ChatMessage } from "@/lib/types";

/**
 * Enhanced chat message processor that uses the multi-agent system
 */
export class ChatIntegration {
  private multiAgentSystem: MultiAgentSystem;
  private isEnabled: boolean;

  constructor(options: { enabled?: boolean } = {}) {
    this.multiAgentSystem = new MultiAgentSystem();
    this.isEnabled = options.enabled ?? true;
  }

  /**
   * Initialize the chat integration
   */
  public async initialize(): Promise<void> {
    if (this.isEnabled) {
      await this.multiAgentSystem.initialize();
      console.log('🤖 Chat Integration: Multi-Agent System enabled');
    } else {
      console.log('🤖 Chat Integration: Multi-Agent System disabled');
    }
  }

  /**
   * Process a user message through the multi-agent system
   * This can be used to enhance the existing chat flow with agent classification
   */
  public async processMessage(message: ChatMessage, context?: any): Promise<MultiAgentResponse | null> {
    if (!this.isEnabled) {
      return null;
    }

    try {
      // Extract text content from the message
      const textContent = this.extractTextFromMessage(message);

      if (!textContent) {
        return null;
      }

      // Process through multi-agent system
      const response = await this.multiAgentSystem.processQuery(textContent, context);

      // Log the agent classification for transparency
      if (response.data.agent) {
        console.log(`🤖 Chat Integration: Query routed to ${response.data.agent} (${response.data.classification.confidence.toFixed(2)} confidence)`);
      }

      return response;

    } catch (error) {
      console.error('❌ Chat Integration: Error processing message:', error);
      return null;
    }
  }

  /**
   * Get agent suggestions for a message
   * This can be used to provide UI hints about which agent would handle the query
   */
  public getAgentSuggestions(message: ChatMessage): AgentSuggestion[] {
    if (!this.isEnabled) {
      return [];
    }

    try {
      const textContent = this.extractTextFromMessage(message);

      if (!textContent) {
        return [];
      }

      // Classify the query
      const classification = this.multiAgentSystem.classifyQuery(textContent);

      // Get agent information
      const agent = this.multiAgentSystem.getAgentByCategory(classification.category);

      if (!agent || classification.confidence < 0.5) {
        return [];
      }

      return [{
        agentName: agent.name,
        category: classification.category,
        confidence: classification.confidence,
        keywords: classification.keywords,
        description: agent.description
      }];

    } catch (error) {
      console.error('❌ Chat Integration: Error getting agent suggestions:', error);
      return [];
    }
  }

  /**
   * Enable or disable the multi-agent system
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`🤖 Chat Integration: Multi-Agent System ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if the multi-agent system is enabled
   */
  public isMultiAgentEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get system status
   */
  public getSystemStatus() {
    return this.multiAgentSystem.getSystemStatus();
  }

  /**
   * Extract text content from a chat message
   */
  private extractTextFromMessage(message: ChatMessage): string | null {
    if (!message.parts || !Array.isArray(message.parts)) {
      return null;
    }

    const textParts = message.parts
      .filter(part => part.type === 'text')
      .map(part => (part as any).text || '');

    return textParts.join(' ').trim() || null;
  }
}

/**
 * Agent suggestion interface
 */
export interface AgentSuggestion {
  agentName: string;
  category: string;
  confidence: number;
  keywords: string[];
  description: string;
}

/**
 * Create a chat integration instance
 */
export function createChatIntegration(options: { enabled?: boolean } = {}): ChatIntegration {
  return new ChatIntegration(options);
}

/**
 * Global chat integration instance
 * This can be imported and used throughout the chat system
 */
let globalChatIntegration: ChatIntegration | null = null;

/**
 * Get the global chat integration instance
 */
export function getChatIntegration(): ChatIntegration {
  if (!globalChatIntegration) {
    globalChatIntegration = createChatIntegration({ enabled: true });
  }
  return globalChatIntegration;
}

/**
 * Initialize the global chat integration
 */
export async function initializeChatIntegration(): Promise<void> {
  const integration = getChatIntegration();
  await integration.initialize();
}