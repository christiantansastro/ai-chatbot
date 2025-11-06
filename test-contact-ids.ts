/**
 * Test script to verify contact IDs exist in OpenPhone
 */

import { getOpenPhoneClient } from './lib/openphone-client';
import { getDuplicateDetectionService } from './lib/duplicate-detection-service';
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

async function testContactIds() {
  console.log('🔍 Testing contact ID validity...');
  
  const openPhoneClient = getOpenPhoneClient();
  
  try {
    // First, get all existing contacts to see what's actually in OpenPhone
    console.log('\n1. Fetching all existing contacts from OpenPhone...');
    let page = 1;
    let allContacts: any[] = [];
    
    while (page <= 3) { // Limit to first 3 pages to avoid too many API calls
      const result = await openPhoneClient.getContacts(page, 100);
      console.log(`   Page ${page}: Found ${result.data.length} contacts (Total: ${result.total})`);
      
      allContacts.push(...result.data);
      
      if (!result.hasMore) break;
      page++;
    }
    
    console.log(`\n📞 Total contacts found in OpenPhone: ${allContacts.length}`);
    
    if (allContacts.length > 0) {
      console.log('\n📋 Sample contacts:');
      allContacts.slice(0, 5).forEach((contact, i) => {
        console.log(`   ${i + 1}. ID: ${contact.id}, Name: ${contact.defaultFields?.firstName || 'N/A'}`);
      });
    }
    
    // Test specific contact IDs that might be causing issues
    const testIds = allContacts.map(c => c.id);
    
    if (testIds.length > 0) {
      console.log('\n2. Testing contact ID validation...');
      
      for (const contactId of testIds.slice(0, 5)) {
        try {
          console.log(`   Testing ID: ${contactId}...`);
          const contact = await openPhoneClient.getContact(contactId);
          console.log(`   ✅ Contact found: ${contact.defaultFields?.firstName || 'N/A'}`);
        } catch (error) {
          console.log(`   ❌ Failed to fetch contact ${contactId}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
    
    // Now test with a known invalid ID to see the error
    console.log('\n3. Testing with invalid contact ID...');
    try {
      await openPhoneClient.getContact('invalid-contact-id-12345');
    } catch (error) {
      console.log(`   Expected error for invalid ID:`, error instanceof Error ? error.message : 'Unknown error');
    }
    
    console.log('\n🎯 Contact ID testing completed!');
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the test
testContactIds().then(() => {
  console.log('\n🏁 Test completed!');
}).catch(error => {
  console.error('💥 Test failed:', error);
});