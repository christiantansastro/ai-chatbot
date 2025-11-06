/**
 * Test script to verify contact update functionality
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

async function testContactUpdate() {
  console.log('🔧 Testing contact update functionality...');
  
  const openPhoneClient = getOpenPhoneClient();
  
  try {
    // First, get an existing contact
    console.log('\n1. Fetching an existing contact...');
    const result = await openPhoneClient.getContacts(1, 1);
    
    if (result.data.length === 0) {
      console.log('❌ No contacts found to test with');
      return;
    }
    
    const testContact = result.data[0] as any; // Use any to bypass type issues
    console.log(`   📞 Found contact: ${testContact.defaultFields.firstName} (ID: ${testContact.id})`);
    
    // Try to update the contact with minimal changes
    console.log('\n2. Attempting to update contact...');
    
    const updateData = {
      defaultFields: {
        firstName: testContact.defaultFields.firstName, // Keep the same name
        phoneNumbers: testContact.defaultFields.phoneNumbers, // Keep the same phones
      },
      customFields: testContact.customFields || [],
      externalId: testContact.externalId || 'test-update-' + Date.now(),
    };
    
    console.log('   📝 Update data:', JSON.stringify(updateData, null, 2));
    
    try {
      const updatedContact = await openPhoneClient.updateContact(testContact.id, updateData);
      console.log('   ✅ Contact updated successfully!');
      console.log('   📞 Updated contact:', (updatedContact as any).defaultFields.firstName);
    } catch (updateError) {
      console.log('   ❌ Update failed:', updateError instanceof Error ? updateError.message : 'Unknown error');
      
      // Let's try a different approach - maybe the endpoint is different
      console.log('\n3. Trying alternative update approach...');
      
      // Check what the exact error is
      if (updateError instanceof Error && 'status' in updateError) {
        const apiError = updateError as any;
        console.log('   📊 Error details:');
        console.log('      Status:', apiError.status);
        console.log('      Code:', apiError.code);
        console.log('      Message:', apiError.message);
        console.log('      Errors:', apiError.errors);
      }
    }
    
    console.log('\n🎯 Contact update test completed!');
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the test
testContactUpdate().then(() => {
  console.log('\n🏁 Test completed!');
}).catch(error => {
  console.error('💥 Test failed:', error);
});