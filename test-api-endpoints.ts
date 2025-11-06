/**
 * Test script to try different update API endpoints
 */

import { getOpenPhoneClient } from './lib/openphone-client';
import { readFileSync } from 'fs';

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
  console.log(`📋 OpenPhone API Key: ${process.env.OPENPHONE_API_KEY ? 'Loaded' : 'Missing'}`);
} catch (error) {
  console.warn('⚠️ Could not load .env.local file:', (error as Error).message || 'Unknown error');
}

async function testApiEndpoints() {
  console.log('🔍 Testing different API endpoint formats...');
  
  const openPhoneClient = getOpenPhoneClient();
  
  try {
    // Get an existing contact first
    console.log('\n1. Fetching existing contact...');
    const result = await openPhoneClient.getContacts(1, 1);
    
    if (result.data.length === 0) {
      console.log('❌ No contacts found to test with');
      return;
    }
    
    const testContact = result.data[0] as any;
    console.log(`   📞 Found contact: ${testContact.defaultFields.firstName} (ID: ${testContact.id})`);
    
    // Test different endpoint formats
    console.log('\n2. Testing different API endpoints...');
    
    const updateData = {
      defaultFields: {
        firstName: testContact.defaultFields.firstName,
        phoneNumbers: testContact.defaultFields.phoneNumbers,
      },
      customFields: testContact.customFields || [],
      externalId: testContact.externalId || 'test-endpoint-' + Date.now(),
    };
    
    // Test 1: Current endpoint with PATCH
    console.log('\n   Test 1: Trying PATCH method...');
    try {
      const response = await fetch(`${openPhoneClient['baseUrl']}/v1/contacts/${testContact.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': openPhoneClient['apiKey'],
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (response.ok) {
        console.log('   ✅ PATCH method worked!');
        const data = await response.json();
        console.log('   📞 Updated contact:', (data.data || data).defaultFields?.firstName);
      } else {
        const error = await response.json().catch(() => ({}));
        console.log(`   ❌ PATCH failed: ${response.status} - ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log('   ❌ PATCH error:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Test 2: Try with different URL format
    console.log('\n   Test 2: Trying with different URL parameters...');
    try {
      const response = await fetch(`${openPhoneClient['baseUrl']}/v1/contacts/${testContact.id}?replace=true`, {
        method: 'PUT',
        headers: {
          'Authorization': openPhoneClient['apiKey'],
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (response.ok) {
        console.log('   ✅ PUT with replace parameter worked!');
        const data = await response.json();
        console.log('   📞 Updated contact:', (data.data || data).defaultFields?.firstName);
      } else {
        const error = await response.json().catch(() => ({}));
        console.log(`   ❌ PUT with replace failed: ${response.status} - ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log('   ❌ PUT with replace error:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    // Test 3: Try creating a new contact to see what happens
    console.log('\n   Test 3: Testing contact creation (for comparison)...');
    try {
      const newContactData = {
        defaultFields: {
          firstName: 'Test Contact ' + Date.now(),
          phoneNumbers: [
            {
              name: 'mobile',
              value: '+1555123456',
              id: 'temp-' + Date.now(),
            }
          ],
        },
        customFields: [],
        externalId: 'test-create-' + Date.now(),
      };
      
      const createdContact = await openPhoneClient.createContact(newContactData as any);
      console.log('   ✅ Contact creation worked!');
      console.log('   📞 Created contact:', (createdContact as any).defaultFields?.firstName);
      
      // Clean up - delete the test contact
      try {
        await openPhoneClient.deleteContact((createdContact as any).id);
        console.log('   🧹 Test contact cleaned up');
      } catch (cleanupError) {
        console.log('   ⚠️ Could not clean up test contact:', cleanupError instanceof Error ? cleanupError.message : 'Unknown error');
      }
      
    } catch (error) {
      console.log('   ❌ Contact creation failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log('\n🎯 API endpoint testing completed!');
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the test
testApiEndpoints().then(() => {
  console.log('\n🏁 Test completed!');
}).catch(error => {
  console.error('💥 Test failed:', error);
});