/**
 * Simple test script for the Multi-Agent System
 * This can be run to verify that the system is working correctly
 */

import { MultiAgentSystem } from "./multi-agent-system";

async function testMultiAgentSystem() {
  console.log('🧪 Testing Multi-Agent System...\n');

  try {
    // Create and initialize the system
    const system = new MultiAgentSystem();
    await system.initialize();

    console.log('✅ System initialized successfully\n');

    // Test queries for different agent categories
    const testQueries = [
      {
        query: "Find client information for John Smith",
        expectedCategory: "clients"
      },
      {
        query: "Generate a financial statement for ABC Corporation",
        expectedCategory: "financials"
      },
      {
        query: "Show me the communication history with XYZ Corp",
        expectedCategory: "communications"
      },
      {
        query: "Upload the contract document to the files",
        expectedCategory: "files"
      },
      {
        query: "store this file for Jeremy",
        expectedCategory: "files"
      },
      {
        query: "What is the weather like today?",
        expectedCategory: "general"
      }
    ];

    for (const testCase of testQueries) {
      console.log(`🔍 Testing: "${testCase.query}"`);

      // Test classification
      const classification = system.classifyQuery(testCase.query);
      console.log(`   Expected: ${testCase.expectedCategory}`);
      console.log(`   Got: ${classification.category} (confidence: ${classification.confidence.toFixed(2)})`);
      console.log(`   Keywords: ${classification.keywords.join(', ') || 'none'}`);
      console.log(`   Reasoning: ${classification.reasoning}`);

      // Test full processing
      const response = await system.processQuery(testCase.query);

      console.log(`   Success: ${response.success}`);
      console.log(`   Agent: ${response.data.agent || 'none'}`);
      console.log(`   Processing time: ${response.metadata.totalProcessingTime}ms`);
      console.log(`   Message: ${response.message}\n`);
    }

    // Get system status
    const status = system.getSystemStatus();
    console.log('📊 System Status:');
    console.log(`   Initialized: ${status.isInitialized}`);
    console.log(`   Total Agents: ${status.totalAgents}`);
    console.log(`   System Health: ${status.systemHealth}`);
    console.log(`   Version: ${status.version}`);
    console.log(`   Uptime: ${Math.floor(status.uptime)}s`);

    console.log('\n🏆 Multi-Agent System test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testMultiAgentSystem().catch(console.error);
}

export { testMultiAgentSystem };