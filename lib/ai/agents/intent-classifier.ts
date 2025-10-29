import { AgentCategory, QueryClassification } from "./base-agent";
import { ClientsAgent } from "./clients-agent";
import { FinancialsAgent } from "./financials-agent";
import { CommunicationsAgent } from "./communications-agent";
import { FilesAgent } from "./files-agent";

/**
 * Intent Classification System
 * Analyzes user queries to determine the appropriate agent category and confidence level
 */
export class IntentClassifier {
  private clientsAgent: ClientsAgent;
  private financialsAgent: FinancialsAgent;
  private communicationsAgent: CommunicationsAgent;
  private filesAgent: FilesAgent;

  constructor() {
    this.clientsAgent = new ClientsAgent();
    this.financialsAgent = new FinancialsAgent();
    this.communicationsAgent = new CommunicationsAgent();
    this.filesAgent = new FilesAgent();
  }

  /**
   * Classify a query and determine the best agent to handle it
   */
  public classifyQuery(query: string): QueryClassification {
    const startTime = Date.now();

    try {
      const lowerQuery = query.toLowerCase();

      // Special handling for file storage queries
      // If query contains file operations AND "for [name]", prioritize FilesAgent
      const fileOperations = ['store', 'upload', 'save', 'attach'];
      const hasFileOperation = fileOperations.some(op => lowerQuery.includes(op));
      const hasForPattern = /\bfor\s+[a-zA-Z]/.test(query);

      if (hasFileOperation && hasForPattern) {
        // Check if FilesAgent can handle this
        if (this.filesAgent.canHandle(query)) {
          return {
            category: 'files',
            confidence: 0.95,
            keywords: this.extractKeywords(query, 'files'),
            reasoning: 'File operation with client specification - routing to FilesAgent'
          };
        }
      }

      // Get all agent capabilities
      const agentCapabilities = [
        {
          agent: this.clientsAgent,
          category: 'clients' as AgentCategory,
          canHandle: this.clientsAgent.canHandle(query),
          name: this.clientsAgent.name
        },
        {
          agent: this.financialsAgent,
          category: 'financials' as AgentCategory,
          canHandle: this.financialsAgent.canHandle(query),
          name: this.financialsAgent.name
        },
        {
          agent: this.communicationsAgent,
          category: 'communications' as AgentCategory,
          canHandle: this.communicationsAgent.canHandle(query),
          name: this.communicationsAgent.name
        },
        {
          agent: this.filesAgent,
          category: 'files' as AgentCategory,
          canHandle: this.filesAgent.canHandle(query),
          name: this.filesAgent.name
        }
      ];

      // Find agents that can handle this query
      const capableAgents = agentCapabilities.filter(agent => agent.canHandle);

      if (capableAgents.length === 0) {
        return {
          category: 'general',
          confidence: 0.1,
          keywords: [],
          reasoning: 'No specialized agent can handle this query'
        };
      }

      if (capableAgents.length === 1) {
        return {
          category: capableAgents[0].category,
          confidence: 0.9,
          keywords: this.extractKeywords(query, capableAgents[0].category),
          reasoning: `Single agent match: ${capableAgents[0].name}`
        };
      }

      // Multiple agents can handle - determine the best match
      const bestMatch = this.resolveMultipleMatches(query, capableAgents);

      return {
        category: bestMatch.category,
        confidence: bestMatch.confidence,
        keywords: this.extractKeywords(query, bestMatch.category),
        reasoning: `Best match from ${capableAgents.length} capable agents: ${bestMatch.agentName}`
      };

    } catch (error) {
      console.error('Error classifying query:', error);
      return {
        category: 'general',
        confidence: 0,
        keywords: [],
        reasoning: `Classification error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Resolve multiple agent matches to find the best one
   */
  private resolveMultipleMatches(query: string, capableAgents: any[]): { category: AgentCategory; confidence: number; agentName: string } {
    // Strategy 1: Keyword density analysis
    const keywordScores = capableAgents.map(agent => ({
      ...agent,
      keywordScore: this.calculateKeywordScore(query, agent.category)
    }));

    // Strategy 2: Context analysis
    const contextScores = keywordScores.map(agent => ({
      ...agent,
      contextScore: this.calculateContextScore(query, agent.category)
    }));

    // Strategy 3: Query length and specificity
    const specificityScores = contextScores.map(agent => ({
      ...agent,
      specificityScore: this.calculateSpecificityScore(query, agent.category)
    }));

    // Combine all scores
    const finalScores = specificityScores.map(agent => ({
      ...agent,
      finalScore: (agent.keywordScore * 0.4) + (agent.contextScore * 0.4) + (agent.specificityScore * 0.2)
    }));

    // Find the best match
    const bestMatch = finalScores.reduce((best, current) =>
      current.finalScore > best.finalScore ? current : best
    );

    return {
      category: bestMatch.category,
      confidence: Math.min(bestMatch.finalScore, 0.95),
      agentName: bestMatch.name
    };
  }

  /**
   * Calculate keyword score for a category
   */
  private calculateKeywordScore(query: string, category: AgentCategory): number {
    const keywordSets: Record<string, string[]> = {
      clients: [
        'client', 'clients', 'customer', 'customers', 'client name', 'find client',
        'client information', 'client details', 'client report', 'client profile',
        'arrested', 'incarcerated', 'probation', 'parole', 'case type', 'charges',
        'update client', 'change client', 'modify client', 'edit client',
        'client phone', 'client email', 'client address', 'client contact'
      ],
      financials: [
        'financial', 'finance', 'money', 'payment', 'payments', 'transaction',
        'statement', 'financial statement', 'balance', 'budget', 'invoice',
        'revenue', 'income', 'expense', 'cost', 'fee', 'billing', 'accounting',
        'outstanding', 'outstanding balance', 'owed', 'owing', 'due', 'overdue'
      ],
      communications: [
        'communication', 'message', 'email', 'call', 'meeting', 'appointment',
        'contact', 'speak', 'talk', 'discuss', 'schedule', 'notification',
        'correspondence', 'conversation', 'interaction', 'follow up'
      ],
      files: [
        'file', 'files', 'document', 'upload', 'download', 'storage', 'organize',
        'pdf', 'image', 'video', 'spreadsheet', 'archive', 'backup', 'share'
      ]
    };

    const keywords = keywordSets[category] || [];
    const lowerQuery = query.toLowerCase();

    let score = 0;
    for (const keyword of keywords) {
      if (lowerQuery.includes(keyword)) {
        score += 1;
      }
    }

    // Normalize score based on query length and keyword count
    const normalizationFactor = Math.max(1, query.split(' ').length / 10);
    return Math.min(score / normalizationFactor, 1);
  }

  /**
   * Calculate context score for a category
   */
  private calculateContextScore(query: string, category: AgentCategory): number {
    const contextPatterns: Record<string, RegExp[]> = {
      clients: [
        /\b(client|customer)\s+(name|information|details|report|profile|summary)\b/i,
        /\b(find|search|lookup|locate)\s+(client|customer)\b/i,
        /\b(client|customer)\s+(type|status|history|record)\b/i,
        /\b(arrested|incarcerated|probation|parole|charges|case)\b/i,
        /\b(update|change|modify|edit)\s+(client|customer)\b/i,
        /\b(client|customer).*\b(phone|email|address|contact)\b/i,
        /\b(phone|email|address|contact).*\b(client|customer)\b/i,
        /\b(update|change|modify|edit).*\b(number|email|address|contact)\s+(?:for|of)\s+\w+/i
      ],
      financials: [
        /\b(financial|payment|transaction|billing)\s+(statement|history|record|report)\b/i,
        /\b(account|balance|budget|invoice)\s+(information|details|status|summary)\b/i,
        /\b(financial|money|cost|fee|charge)\s+(analysis|review|overview|summary)\b/i,
        /\b(payment|transaction|billing)\s+(history|records|details)\b/i,
        /\b(outstanding|owed|owing|due|overdue)\s+balance\b/i,
        /\b(balance|amount)\s+(outstanding|owed|due|overdue)\b/i
      ],
      communications: [
        /\b(communication|message|email|call)\s+(history|log|record|summary)\b/i,
        /\b(schedule|set up|book|arrange)\s+(meeting|appointment|call)\b/i,
        /\b(send|make|place)\s+(call|email|message)\b/i,
        /\b(meeting|appointment|call)\s+(request|booking|scheduling)\b/i
      ],
      files: [
        /\b(file|document)\s+(upload|download|storage|management|organization)\b/i,
        /\b(upload|store|save)\s+(file|document|image|pdf)\b/i,
        /\b(download|get|retrieve)\s+(file|document|report)\b/i,
        /\b(file|document)\s+(search|find|locate|organize)\b/i
      ]
    };

    const patterns = contextPatterns[category] || [];

    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        score += 1;
      }
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate specificity score for a category
   */
  private calculateSpecificityScore(query: string, category: AgentCategory): number {
    // Longer, more specific queries tend to be more confident
    const queryLength = query.split(' ').length;

    // Very short queries are less specific
    if (queryLength <= 2) return 0.3;

    // Medium queries have medium specificity
    if (queryLength <= 5) return 0.6;

    // Long queries are more specific
    return 0.9;
  }

  /**
   * Extract relevant keywords from query for a category
   */
  private extractKeywords(query: string, category: AgentCategory): string[] {
    const keywordSets: Record<string, string[]> = {
      clients: [
        'client', 'clients', 'customer', 'customers', 'client name', 'find client',
        'client information', 'client details', 'client report', 'client profile',
        'arrested', 'incarcerated', 'probation', 'parole', 'case type', 'charges'
      ],
      financials: [
        'financial', 'finance', 'money', 'payment', 'payments', 'transaction',
        'statement', 'financial statement', 'balance', 'budget', 'invoice',
        'revenue', 'income', 'expense', 'cost', 'fee', 'billing', 'accounting',
        'outstanding', 'outstanding balance', 'owed', 'owing', 'due', 'overdue'
      ],
      communications: [
        'communication', 'message', 'email', 'call', 'meeting', 'appointment',
        'speak', 'talk', 'discuss', 'schedule', 'notification',
        'correspondence', 'conversation', 'interaction', 'follow up',
        'send email', 'make call', 'schedule meeting', 'set appointment'
      ],
      files: [
        'file', 'files', 'document', 'upload', 'download', 'storage', 'organize',
        'pdf', 'image', 'video', 'spreadsheet', 'archive', 'backup', 'share'
      ]
    };

    const keywords = category === 'general' ? [] : keywordSets[category] || [];
    const lowerQuery = query.toLowerCase();

    return keywords.filter((keyword: string) => lowerQuery.includes(keyword));
  }

  /**
   * Get all available agents
   */
  public getAllAgents() {
    return [
      this.clientsAgent,
      this.financialsAgent,
      this.communicationsAgent,
      this.filesAgent
    ];
  }

  /**
   * Get agent by category
   */
  public getAgentByCategory(category: AgentCategory) {
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
}