/**
 * Test script for the file storage fix
 * Tests the client validation functionality
 */

import { validateClientForFileStorage, extractClientNameFromQuery } from "@/lib/utils/client-validation";

async function testFileStorageFix() {
  console.log('🧪 Testing File Storage Fix...\n');

  try {
    // Test client name extraction from queries
    const testQueries = [
      "store this file for Jeremy",
      "store this for Jeremy",
      "upload document for client John Smith",
      "save file for \"Jane Doe\"",
      "store this for client ABC Corp",
      "upload for Mary Johnson",
      "attach this file for client XYZ"
    ];

    console.log('🔍 Testing client name extraction:');
    for (const query of testQueries) {
      const extractedName = extractClientNameFromQuery(query);
      console.log(`   "${query}" → "${extractedName || 'none'}"`);
    }

    console.log('\n✅ Client name extraction test completed');

    // Test client validation (this would need a real database connection)
    console.log('\n🔍 Testing client validation:');
    const testClientNames = [
      "Jeremy",
      "John Smith",
      "Jane Doe",
      "NonExistent Client",
      ""
    ];

    for (const clientName of testClientNames) {
      try {
        const validation = await validateClientForFileStorage(clientName);
        console.log(`   "${clientName}" → ${validation.isValid ? '✅ Valid' : '❌ Invalid'}${validation.error ? `: ${validation.error}` : ''}`);
      } catch (error) {
        console.log(`   "${clientName}" → ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log('\n🏆 File Storage Fix test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testFileStorageFix().catch(console.error);
}

export { testFileStorageFix };