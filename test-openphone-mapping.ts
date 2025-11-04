/**
 * Simple test script to demonstrate OpenPhone contact mapping
 * This will show how client data gets converted to OpenPhone contacts
 */

import { databaseService } from './lib/db/database-factory';
import { getClientDatabaseService } from './lib/client-database-service';
import { mapClientToContacts, type MappedContact } from './lib/openphone-mapping';

async function testOpenPhoneMapping() {
  console.log('🧪 Testing OpenPhone Contact Mapping...\n');
  
  try {
    // Initialize database service
    console.log('🔄 Initializing database service...');
    await databaseService.initialize();
    
    // Initialize client database service
    const clientDbService = getClientDatabaseService();
    const { databaseFactory } = await import('./lib/db/database-factory');
    const adapter = databaseFactory.getAdapter();
    clientDbService.initialize(
      adapter.supabase,
      adapter.serviceSupabase
    );
    
    // Test connection
    console.log('✅ Testing database connection...');
    const dbTest = await clientDbService.testConnection();
    if (dbTest.isConnected) {
      console.log('✅ Database connected successfully\n');
    } else {
      throw new Error(`Database connection failed: ${dbTest.error}`);
    }
    
    // Get a few sample clients
    console.log('📋 Fetching sample clients...');
    const sampleClientsResult = await clientDbService.getAllClients({ limit: 3 });
    const sampleClients = sampleClientsResult.clients;
    
    if (sampleClients.length === 0) {
      console.log('❌ No clients found in database');
      return;
    }
    
    console.log(`✅ Found ${sampleClients.length} sample clients\n`);
    
    // Map each client to contacts and show the results
    console.log('🔄 Mapping clients to OpenPhone contacts...\n');
    
    for (let i = 0; i < sampleClients.length; i++) {
      const client = sampleClients[i];
      console.log(`=== CLIENT ${i + 1}: ${client.client_name} ===`);
      console.log(`ID: ${client.id}`);
      console.log(`Type: ${client.client_type}`);
      console.log(`Phone: ${client.phone}`);
      console.log(`Email: ${client.email || 'Not provided'}`);
      console.log(`Alternative Contacts:`);
      console.log(`  - Contact 1: ${client.contact_1 || 'None'} (${client.relationship_1 || 'No relationship'}) - ${client.contact_1_phone || 'No phone'}`);
      console.log(`  - Contact 2: ${client.contact_2 || 'None'} (${client.relationship_2 || 'No relationship'}) - ${client.contact_2_phone || 'No phone'}`);
      console.log('');
      
      // Map to OpenPhone contacts
      const mappedContacts = mapClientToContacts(client);
      console.log(`📞 MAPPED TO ${mappedContacts.length} OPENPHONE CONTACTS:`);
      
      for (const mappedContact of mappedContacts) {
        console.log(`\n--- ${mappedContact.contactType.toUpperCase()} CONTACT ---`);
        console.log(`Name: "${mappedContact.openPhoneContact.defaultFields.firstName}"`);
        console.log(`Company: "${mappedContact.openPhoneContact.defaultFields.company}"`);
        console.log(`Role: "${mappedContact.openPhoneContact.defaultFields.role}"`);
        console.log(`Phone: "${mappedContact.openPhoneContact.defaultFields.phoneNumbers?.[0]?.value}"`);
        console.log(`External ID: "${mappedContact.openPhoneContact.externalId}"`);
        
        // Show custom fields
        if (mappedContact.openPhoneContact.customFields) {
          console.log('Custom Fields:');
          for (const field of mappedContact.openPhoneContact.customFields) {
            console.log(`  - ${field.name}: ${field.value}`);
          }
        }
      }
      console.log('\n' + '='.repeat(50) + '\n');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testOpenPhoneMapping().catch(console.error);