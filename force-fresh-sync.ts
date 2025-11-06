/**
 * Force a fresh sync by clearing cache and forcing full sync mode
 */

import { readFileSync } from 'fs';
import { getSyncService } from './lib/openphone-sync-service';
import { getDuplicateDetectionService } from './lib/duplicate-detection-service';
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
  console.log(`📋 OpenPhone API Key: ${process.env.OPENPHONE_API_KEY ? 'Loaded' : 'Missing'}`);
} catch (error) {
  console.warn('⚠️ Could not load .env.local file:', (error as Error).message || 'Unknown error');
}

async function initializeDatabase() {
  try {
    console.log('🔄 Initializing database connection...');
    
    // Initialize the database service properly
    await databaseService.initialize();
    
    // Check health after initialization
    const healthCheck = await databaseService.healthCheck();
    console.log('Database health check:', healthCheck);
    
    if (healthCheck.status === 'healthy') {
      console.log('✅ Database connection initialized successfully');
      return true;
    } else {
      throw new Error(`Database health check failed: ${healthCheck.details.error}`);
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    return false;
  }
}

async function forceFreshSync() {
  console.log('🔄 Forcing fresh OpenPhone sync (full mode, cache cleared)...');
  
  try {
    // Initialize database first
    console.log('0. Initializing database...');
    const dbInitialized = await initializeDatabase();
    
    if (!dbInitialized) {
      throw new Error('Failed to initialize database connection');
    }
    
    // Clear all caches to force fresh duplicate detection
    console.log('1. Clearing duplicate detection cache...');
    const duplicateService = getDuplicateDetectionService();
    duplicateService.clearCache();
    console.log('✅ Cache cleared');
    
    // Force full sync mode
    console.log('2. Starting full sync (no duplicates, all new contacts)...');
    const syncService = getSyncService();
    
    const syncResult = await syncService.syncContacts({
      syncMode: 'full', // Force full mode instead of incremental
      continueOnError: true, // Continue even if some clients have validation errors
      dryRun: false, // Actually create contacts
    });
    
    console.log('🎯 Sync Results:');
    console.log(`  ✅ Success: ${syncResult.success}`);
    console.log(`  📊 Total Clients: ${syncResult.totalClientsProcessed}`);
    console.log(`  ➕ Contacts Created: ${syncResult.totalContactsCreated}`);
    console.log(`  🔄 Contacts Updated: ${syncResult.totalContactsUpdated}`);
    console.log(`  ⏭️ Contacts Skipped: ${syncResult.totalContactsSkipped}`);
    console.log(`  ❌ Errors: ${syncResult.totalErrors}`);
    console.log(`  ⏱️ Duration: ${syncResult.duration}ms`);
    
    if (syncResult.errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      syncResult.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.clientName}: ${error.error}`);
      });
    }
    
    if (syncResult.totalContactsCreated > 0) {
      console.log(`\n🎉 SUCCESS! Created ${syncResult.totalContactsCreated} new contacts in OpenPhone!`);
      console.log('📞 Check your OpenPhone contacts to see the new entries.');
    } else {
      console.log('\n⚠️ No contacts were created. This might be due to:');
      console.log('  • All clients have validation errors');
      console.log('  • Phone number format issues');
      console.log('  • Database connectivity problems');
    }
    
  } catch (error) {
    console.error('💥 Fresh sync failed:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Run the force fresh sync
forceFreshSync().then(() => {
  console.log('\n🎯 Fresh sync completed!');
}).catch(error => {
  console.error('💥 Fresh sync failed:', error);
});