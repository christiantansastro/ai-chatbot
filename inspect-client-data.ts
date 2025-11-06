/**
 * Script to inspect client data and alternative contacts
 */

import { readFileSync } from 'fs';
import { getClientDatabaseService } from './lib/client-database-service';
import { databaseService, databaseFactory } from './lib/db/database-factory';

// Load environment variables from .env.local
try {
  const envFile = readFileSync('.env.local', 'utf8');
  const envLines = envFile.split('\n');
  
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      process.env[key.trim()] = value.trim();
    }
  }
  
  console.log('✅ Environment variables loaded from .env.local');
} catch (error) {
  console.warn('⚠️ Could not load .env.local file:', (error as Error).message || 'Unknown error');
}

async function inspectClientData() {
  console.log('🔍 Inspecting client data...');
  
  try {
    // Initialize database
    console.log('🔄 Initializing database...');
    await databaseService.initialize();
    const adapter = databaseFactory.getAdapter();
    
    const clientDbService = getClientDatabaseService();
    clientDbService.initialize(adapter.supabase, adapter.serviceSupabase || adapter.supabase);
    
    // Get all clients
    console.log('\n📋 Fetching all clients...');
    const result = await clientDbService.getAllClients({ limit: 50 });
    
    console.log(`\n📊 Found ${result.totalCount} total clients`);
    console.log(`📋 Showing first ${result.clients.length} clients:\n`);
    
    result.clients.forEach((client, index) => {
      console.log(`${index + 1}. ${client.client_name} (${client.client_type}) - id: ${client.id}`);
      console.log(`   Phone: ${client.phone || 'None'}`);
      
      // Check alternative contacts
      const hasAlt1 = client.contact_1 || client.contact_1_phone || client.relationship_1;
      const hasAlt2 = client.contact_2 || client.contact_2_phone || client.relationship_2;
      
      if (hasAlt1) {
        console.log(`   Alt Contact 1:`);
        console.log(`     Name: ${client.contact_1 || 'MISSING'}`);
        console.log(`     Phone: ${client.contact_1_phone || 'MISSING'}`);
        console.log(`     Relationship: ${client.relationship_1 || 'MISSING'}`);
      }
      
      if (hasAlt2) {
        console.log(`   Alt Contact 2:`);
        console.log(`     Name: ${client.contact_2 || 'MISSING'}`);
        console.log(`     Phone: ${client.contact_2_phone || 'MISSING'}`);
        console.log(`     Relationship: ${client.relationship_2 || 'MISSING'}`);
      }
      
      if (!hasAlt1 && !hasAlt2) {
        console.log(`   ❌ No alternative contacts`);
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('💥 Inspection failed:', error);
  }
}

// Run the inspection
inspectClientData().then(() => {
  console.log('\n🏁 Inspection completed!');
}).catch(error => {
  console.error('💥 Inspection failed:', error);
});
