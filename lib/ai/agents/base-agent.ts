import { tool } from "ai";
import { z } from "zod";

/**
 * Base Agent class that all specialized agents inherit from
 */
export abstract class BaseAgent {
  public readonly name: string;
  public readonly description: string;
  public readonly category: AgentCategory;
  protected tools: Map<string, any> = new Map();

  constructor(name: string, description: string, category: AgentCategory) {
    this.name = name;
    this.description = description;
    this.category = category;
  }

  /**
   * Register a tool with this agent
   */
  protected registerTool(toolName: string, toolInstance: any): void {
    this.tools.set(toolName, toolInstance);
  }

  /**
   * Get all tools registered with this agent
   */
  public getTools(): Map<string, any> {
    return this.tools;
  }

  /**
   * Check if this agent can handle a given query
   */
  public abstract canHandle(query: string): boolean;

  /**
   * Process a query using this agent's specialized tools
   */
  public abstract processQuery(query: string, context?: any): Promise<AgentResponse>;

  /**
   * Get agent information
   */
  public getInfo(): AgentInfo {
    return {
      name: this.name,
      description: this.description,
      category: this.category,
      toolCount: this.tools.size,
      tools: Array.from(this.tools.keys())
    };
  }
}

/**
 * Agent categories for classification
 */
export type AgentCategory = 'clients' | 'financials' | 'communications' | 'files' | 'general';

/**
 * Agent response interface
 */
export interface AgentResponse {
  success: boolean;
  message: string;
  data?: any;
  agent: string;
  category: AgentCategory;
  metadata?: {
    processingTime?: number;
    toolsUsed?: string[];
    confidence?: number;
  };
}

/**
 * Agent information interface
 */
export interface AgentInfo {
  name: string;
  description: string;
  category: AgentCategory;
  toolCount: number;
  tools: string[];
}

/**
 * Query classification result
 */
export interface QueryClassification {
  category: AgentCategory;
  confidence: number;
  keywords: string[];
  reasoning: string;
}