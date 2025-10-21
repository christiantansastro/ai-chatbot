import { QueryRouter, RoutingResult } from "./query-router";
import { IntentClassifier } from "./intent-classifier";
import { AgentCategory, QueryClassification, AgentResponse } from "./base-agent";

/**
 * Multi-Agent System
 * Main interface for the multi-agent architecture that coordinates all agents
 */
export class MultiAgentSystem {
  private queryRouter: QueryRouter;
  private intentClassifier: IntentClassifier;
  private isInitialized: boolean = false;

  constructor() {
    this.queryRouter = new QueryRouter();
    this.intentClassifier = new IntentClassifier();
  }

  /**
   * Initialize the multi-agent system
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('🤖 Multi-Agent System: Initializing...');

      // Perform any initialization tasks here
      // For example, loading agent configurations, warming up models, etc.

      this.isInitialized = true;
      console.log('✅ Multi-Agent System: Initialized successfully');

    } catch (error) {
      console.error('❌ Multi-Agent System: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Process a user query through the multi-agent system
   */
  public async processQuery(query: string, context?: any): Promise<MultiAgentResponse> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      console.log(`🤖 Multi-Agent System: Processing query: "${query}"`);

      // Route the query to the appropriate agent
      const routingResult = await this.queryRouter.routeQuery(query, context);

      const processingTime = Date.now() - startTime;

      const response: MultiAgentResponse = {
        success: routingResult.success,
        message: routingResult.message,
        data: {
          query,
          classification: routingResult.classification,
          agent: routingResult.agent,
          agentResponse: routingResult.response,
          processingTime: routingResult.processingTime,
          routingPath: routingResult.routingPath
        },
        metadata: {
          totalProcessingTime: processingTime,
          systemVersion: '1.0.0',
          agentCount: 4
        }
      };

      console.log(`🤖 Multi-Agent System: Query processed in ${processingTime}ms using ${routingResult.agent || 'no agent'}`);

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;

      console.error('❌ Multi-Agent System: Error processing query:', error);

      return {
        success: false,
        message: `Error processing query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          query,
          classification: {
            category: 'general',
            confidence: 0,
            keywords: [],
            reasoning: 'Processing error'
          },
          agent: null,
          agentResponse: null,
          processingTime: 0,
          routingPath: ['error']
        },
        metadata: {
          totalProcessingTime: processingTime,
          systemVersion: '1.0.0',
          agentCount: 4
        }
      };
    }
  }

  /**
   * Classify a query without full processing
   */
  public classifyQuery(query: string): QueryClassification {
    return this.intentClassifier.classifyQuery(query);
  }

  /**
   * Get system status and statistics
   */
  public getSystemStatus(): SystemStatus {
    const routingStats = this.queryRouter.getRoutingStats();

    return {
      isInitialized: this.isInitialized,
      totalAgents: routingStats.totalAgents,
      agents: routingStats.agents,
      systemHealth: 'healthy',
      version: '1.0.0',
      uptime: process.uptime()
    };
  }

  /**
   * Get information about all agents
   */
  public getAllAgents() {
    return this.queryRouter.getAllAgents();
  }

  /**
   * Get agent by category
   */
  public getAgentByCategory(category: AgentCategory) {
    return this.intentClassifier.getAgentByCategory(category);
  }

  /**
   * Process multiple queries in batch
   */
  public async processBatch(queries: string[], context?: any): Promise<MultiAgentResponse[]> {
    const results: MultiAgentResponse[] = [];

    for (const query of queries) {
      const result = await this.processQuery(query, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Test the system with sample queries
   */
  public async runDiagnostics(): Promise<DiagnosticResult> {
    const sampleQueries = [
      "Find client information for John Doe",
      "Generate a financial statement for client ABC",
      "Show me the communication history with XYZ Corp",
      "Upload the contract document to the files",
      "What is the weather like today?" // General query
    ];

    const results: DiagnosticResult['queryResults'] = [];

    for (const query of sampleQueries) {
      const classification = this.classifyQuery(query);
      const startTime = Date.now();
      const response = await this.processQuery(query);
      const processingTime = Date.now() - startTime;

      results.push({
        query,
        classification,
        response,
        processingTime
      });
    }

    return {
      totalQueries: sampleQueries.length,
      queryResults: results,
      systemStatus: this.getSystemStatus(),
      diagnosticTimestamp: new Date().toISOString()
    };
  }
}

/**
 * Multi-Agent Response interface
 */
export interface MultiAgentResponse {
  success: boolean;
  message: string;
  data: {
    query: string;
    classification: QueryClassification;
    agent: string | null;
    agentResponse: AgentResponse | null;
    processingTime: number;
    routingPath: string[];
  };
  metadata: {
    totalProcessingTime: number;
    systemVersion: string;
    agentCount: number;
  };
}

/**
 * System status interface
 */
export interface SystemStatus {
  isInitialized: boolean;
  totalAgents: number;
  agents: Array<{
    name: string;
    category: AgentCategory;
    toolCount: number;
  }>;
  systemHealth: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
}

/**
 * Diagnostic result interface
 */
export interface DiagnosticResult {
  totalQueries: number;
  queryResults: Array<{
    query: string;
    classification: QueryClassification;
    response: MultiAgentResponse;
    processingTime: number;
  }>;
  systemStatus: SystemStatus;
  diagnosticTimestamp: string;
}