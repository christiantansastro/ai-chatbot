/**
 * Simple test to verify OpenPhone API connection and contact creation
 */

import { readFileSync } from 'fs';
import { getOpenPhoneClient } from './lib/openphone-client';

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

async function testOpenPhoneAPI() {
  console.log('🔍 Testing OpenPhone API connection...');
  console.log(`📋 OpenPhone API Key: ${process.env.OPENPHONE_API_KEY ? 'Loaded' : 'Missing'}`);
  
  const client = getOpenPhoneClient();
  
  try {
    // Test 1: Validate connection
    console.log('1. Testing API connection...');
    const isConnected = await client.validateConnection();
    console.log(`✅ API Connection: ${isConnected ? 'SUCCESS' : 'FAILED'}`);
    
    if (!isConnected) {
      console.error('❌ Cannot connect to OpenPhone API. Please check your API key.');
      return;
    }
    
    // Test 2: Try to get contacts to see if API works
    console.log('\n2. Fetching existing contacts...');
    const contactsResult = await client.getContacts(1, 5);
    console.log(`📞 Found ${contactsResult.data.length} contacts (showing first 5)`);
    
    if (contactsResult.data.length > 0) {
      console.log('Existing contacts:');
      contactsResult.data.forEach((contact, i) => {
        console.log(`  ${i + 1}. ${contact.defaultFields.firstName || 'Unknown'} (ID: ${(contact as any).id})`);
      });
    }
    
    // Test 3: Try to create a simple test contact
    console.log('\n3. Creating test contact...');
    const testContact = {
      defaultFields: {
        firstName: 'Test User',
        phoneNumbers: [
          {
            name: 'mobile',
            value: '+1234567890',
            id: 'test-phone-id'
          }
        ],
        email: 'test@example.com'
      },
      customFields: [],
      externalId: 'test-contact-' + Date.now(),
    };
    
    try {
      const createdContact = await client.createContact(testContact);
      console.log('✅ Test contact created successfully!');
      console.log(`   Contact ID: ${(createdContact as any).id}`);
      console.log(`   Name: ${createdContact.defaultFields.firstName}`);
      
      // Test 4: Try to update the contact
      console.log('\n4. Updating test contact...');
      const updatedContact = await client.updateContact((createdContact as any).id, {
        defaultFields: {
          firstName: 'Test User Updated'
        },
        customFields: [],
        externalId: testContact.externalId,
      });
      console.log('✅ Test contact updated successfully!');
      console.log(`   Updated Name: ${updatedContact.defaultFields.firstName}`);
      
      // Test 5: Clean up - delete test contact
      console.log('\n5. Deleting test contact...');
      await client.deleteContact((createdContact as any).id);
      console.log('✅ Test contact deleted successfully!');
      
    } catch (createError) {
      console.error('❌ Failed to create test contact:', createError);
      console.error('   This might be due to invalid phone number format or API permissions.');
      
      // Try with a different format
      console.log('\n6. Trying with different phone format...');
      const testContact2 = {
        defaultFields: {
          firstName: 'Test User 2',
          phoneNumbers: [
            {
              name: 'mobile',
              value: '234567890',
              id: 'test-phone-id-2'
            }
          ],
          email: 'test2@example.com'
        },
        customFields: [],
        externalId: 'test-contact-2-' + Date.now(),
      };
      
      try {
        const createdContact2 = await client.createContact(testContact2);
        console.log('✅ Test contact 2 created successfully!');
        console.log(`   Contact ID: ${(createdContact2 as any).id}`);
        
        // Clean up
        await client.deleteContact((createdContact2 as any).id);
        console.log('✅ Test contact 2 deleted successfully!');
        
      } catch (createError2) {
        console.error('❌ Failed to create test contact 2 as well:', createError2);
      }
    }
    
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
}

testOpenPhoneAPI().then(() => {
  console.log('\n🎯 OpenPhone API test completed!');
}).catch(error => {
  console.error('💥 Test failed:', error);
});