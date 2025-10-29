import { AgentCategory, AgentResponse, QueryClassification } from "./base-agent";
import { IntentClassifier } from "./intent-classifier";
import { ClientsAgent } from "./clients-agent";
import { FinancialsAgent } from "./financials-agent";
import { CommunicationsAgent } from "./communications-agent";
import { FilesAgent } from "./files-agent";

/**
 * Query Router
 * Routes user queries to the appropriate specialized agent based on intent classification
 */
export class QueryRouter {
  private intentClassifier: IntentClassifier;
  private clientsAgent: ClientsAgent;
  private financialsAgent: FinancialsAgent;
  private communicationsAgent: CommunicationsAgent;
  private filesAgent: FilesAgent;

  constructor() {
    this.intentClassifier = new IntentClassifier();
    this.clientsAgent = new ClientsAgent();
    this.financialsAgent = new FinancialsAgent();
    this.communicationsAgent = new CommunicationsAgent();
    this.filesAgent = new FilesAgent();
  }

  /**
   * Route a query to the appropriate agent
   */
  public async routeQuery(query: string, context?: any): Promise<RoutingResult> {
    const startTime = Date.now();

    try {
      // Pre-process query to detect client field updates
      const clientUpdatePattern = /\b(update|change|modify|edit)\s+.*\b(number|email|address|contact)\s+(?:for|of)\s+(\w+)/i;
      const clientUpdateMatch = query.match(clientUpdatePattern);

      if (clientUpdateMatch) {
        // This is a client field update query
        const clientName = clientUpdateMatch[3];
        console.log('🔄 QUERY ROUTER: Detected client field update for:', clientName);
        
        return {
          success: true,
          message: "Routing to clients agent for field update",
          classification: {
            category: 'clients',
            confidence: 0.95,
            keywords: ['update', 'client', clientUpdateMatch[2]],
            reasoning: 'Direct client field update detected'
          },
          agent: this.clientsAgent.name,
          response: await this.clientsAgent.processQuery(query, context),
          processingTime: Date.now() - startTime,
          routingPath: ['client_field_update_detection', 'clients_agent']
        };
      }

      // Step 1: Classify the query intent
      const classification = this.intentClassifier.classifyQuery(query);

      // Step 2: Get the appropriate agent
      const agent = this.getAgentByCategory(classification.category);

      if (!agent) {
        // Handle general queries or queries that don't match any agent
        return {
          success: false,
          message: "No specialized agent available for this query type",
          classification,
          agent: null,
          response: null,
          processingTime: Date.now() - startTime,
          routingPath: ['classification', 'no_agent_found']
        };
      }

      // Step 3: Process the query with the selected agent
      const response = await agent.processQuery(query, context);

      const processingTime = Date.now() - startTime;

      return {
        success: response.success,
        message: response.message,
        classification,
        agent: agent.name,
        response,
        processingTime,
        routingPath: ['classification', 'agent_selection', 'query_processing']
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        message: `Error routing query: ${error instanceof Error ? error.message : 'Unknown error'}`,
        classification: {
          category: 'general',
          confidence: 0,
          keywords: [],
          reasoning: 'Routing error'
        },
        agent: null,
        response: null,
        processingTime,
        routingPath: ['classification', 'error']
      };
    }
  }

  /**
   * Route multiple queries (batch processing)
   */
  public async routeQueries(queries: string[], context?: any): Promise<RoutingResult[]> {
    const results: RoutingResult[] = [];

    for (const query of queries) {
      const result = await this.routeQuery(query, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Get agent by category
   */
  private getAgentByCategory(category: AgentCategory) {
    switch (category) {
      case 'clients':
        return this.clientsAgent;
      case 'financials':
        return this.financialsAgent;
      case 'communications':
        return this.communicationsAgent;
      case 'files':
        return this.filesAgent;
      default:
        return null;
    }
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): RoutingStats {
    return {
      totalAgents: 4,
      agents: [
        {
          name: this.clientsAgent.name,
          category: this.clientsAgent.category,
          toolCount: this.clientsAgent.getTools().size
        },
        {
          name: this.financialsAgent.name,
          category: this.financialsAgent.category,
          toolCount: this.financialsAgent.getTools().size
        },
        {
          name: this.communicationsAgent.name,
          category: this.communicationsAgent.category,
          toolCount: this.communicationsAgent.getTools().size
        },
        {
          name: this.filesAgent.name,
          category: this.filesAgent.category,
          toolCount: this.filesAgent.getTools().size
        }
      ]
    };
  }

  /**
   * Test query classification without full processing
   */
  public classifyQuery(query: string): QueryClassification {
    return this.intentClassifier.classifyQuery(query);
  }

  /**
   * Get all available agents
   */
  public getAllAgents() {
    return this.intentClassifier.getAllAgents();
  }
}

/**
 * Routing result interface
 */
export interface RoutingResult {
  success: boolean;
  message: string;
  classification: QueryClassification;
  agent: string | null;
  response: AgentResponse | null;
  processingTime: number;
  routingPath: string[];
}

/**
 * Routing statistics interface
 */
export interface RoutingStats {
  totalAgents: number;
  agents: Array<{
    name: string;
    category: AgentCategory;
    toolCount: number;
  }>;
}