// Direct test script to trigger OpenPhone sync without HTTP API
// This bypasses potential hostname issues and directly tests the sync service

const { getSyncService } = require('./lib/openphone-sync-service.ts');
const { getSyncScheduler } = require('./lib/openphone-scheduler.ts');

// Test configuration
const testOptions = {
  syncMode: 'incremental',
  batchSize: 10,
  dryRun: false,
  continueOnError: true
};

async function runDirectSync() {
  console.log('🚀 Starting direct OpenPhone sync test...\n');
  
  try {
    // Get the sync service
    const syncService = getSyncService();
    
    console.log('📊 Sync Status:');
    const status = syncService.getSyncStatus();
    console.log(JSON.stringify(status, null, 2));
    console.log('');
    
    // Test configuration first
    console.log('🔧 Testing configuration...');
    const configTest = await syncService.testConfiguration();
    console.log('Config Test Result:', configTest);
    console.log('');
    
    // Run the sync
    console.log('🔄 Running sync...');
    const result = await syncService.syncContacts(testOptions);
    
    console.log('\n✅ Sync completed successfully!');
    console.log('📊 Results:');
    console.log('   Total Clients Processed:', result.totalClientsProcessed);
    console.log('   Total Contacts Created:', result.totalContactsCreated);
    console.log('   Total Contacts Updated:', result.totalContactsUpdated);
    console.log('   Total Errors:', result.totalErrors);
    
    if (result.clientResults && result.clientResults.length > 0) {
      console.log('\n📋 Client Results:');
      result.clientResults.forEach((client, index) => {
        console.log('   ' + (index + 1) + '. ' + client.clientName);
        console.log('      Status:', client.status);
        if (client.contactsCreated > 0) {
          console.log('      Contacts Created:', client.contactsCreated);
        }
        if (client.contactsUpdated > 0) {
          console.log('      Contacts Updated:', client.contactsUpdated);
        }
        if (client.errors && client.errors.length > 0) {
          console.log('      Errors:', client.errors.length);
          client.errors.forEach(error => {
            console.log('        -', error);
          });
        }
      });
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Sync Errors:');
      result.errors.forEach(error => {
        console.log('   -', error);
      });
    }
    
    // Test scheduler status
    console.log('\n📅 Scheduler Status:');
    const scheduler = getSyncScheduler();
    console.log(JSON.stringify(scheduler.getStatus(), null, 2));
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
runDirectSync();