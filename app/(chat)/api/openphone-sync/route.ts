/**
 * OpenPhone Sync API Routes
 * 
 * These API routes provide endpoints for:
 * - Triggering manual sync operations
 * - Monitoring sync status and progress
 * - Managing sync configuration
 * - Viewing sync history and metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSyncService } from '../../../../lib/openphone-sync-service';
import { getSyncScheduler } from '../../../../lib/openphone-scheduler';
import { getClientDatabaseService } from '../../../../lib/client-database-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'status';

    if (action === 'status') {
      // Get current sync status
      const syncService = getSyncService();
      const scheduler = getSyncScheduler();
      
      const status = {
        syncService: syncService.getSyncStatus(),
        scheduler: scheduler.getStatus(),
        schedulerMetrics: scheduler.getMetrics(),
        lastRun: scheduler.getHistory(1)[0] || null,
      };

      return NextResponse.json(status);
    }

    if (action === 'metrics') {
      // Get detailed sync metrics
      const scheduler = getSyncScheduler();
      
      return NextResponse.json({
        metrics: scheduler.getMetrics(),
        history: scheduler.getHistory(20),
      });
    }

    if (action === 'config') {
      // Get current sync configuration
      const scheduler = getSyncScheduler();
      
      return NextResponse.json({
        config: scheduler.getConfig(),
      });
    }

    if (action === 'test') {
      // Test configuration without running sync
      const syncService = getSyncService();
      const testResult = await syncService.testConfiguration();
      
      return NextResponse.json(testResult);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in GET /api/openphone-sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, options } = body;

    if (action === 'sync') {
      // Trigger manual sync
      const syncService = getSyncService();
      
      const syncOptions = {
        syncMode: options?.syncMode || 'incremental',
        batchSize: options?.batchSize || 50,
        clientType: options?.clientType,
        dryRun: options?.dryRun || false,
        continueOnError: options?.continueOnError !== false,
        updatedSince: options?.updatedSince ? new Date(options.updatedSince) : undefined,
      };

      const result = await syncService.syncContacts(syncOptions);
      
      return NextResponse.json({
        success: true,
        result,
        message: `Sync completed successfully. Processed ${result.totalClientsProcessed} clients, created ${result.totalContactsCreated} contacts, updated ${result.totalContactsUpdated} contacts.`,
      });
    }

    if (action === 'start-scheduler') {
      // Start the scheduled sync
      const scheduler = getSyncScheduler();
      await scheduler.start();
      
      return NextResponse.json({
        success: true,
        message: 'Sync scheduler started successfully',
        status: scheduler.getStatus(),
      });
    }

    if (action === 'stop-scheduler') {
      // Stop the scheduled sync
      const scheduler = getSyncScheduler();
      scheduler.stop();
      
      return NextResponse.json({
        success: true,
        message: 'Sync scheduler stopped successfully',
        status: scheduler.getStatus(),
      });
    }

    if (action === 'run-now') {
      // Run sync immediately (same as manual sync but returns scheduler info)
      const scheduler = getSyncScheduler();
      const result = await scheduler.runSync();
      
      return NextResponse.json({
        success: true,
        result,
        schedulerStatus: scheduler.getStatus(),
        message: 'Manual sync executed successfully',
      });
    }

    if (action === 'update-config') {
      // Update scheduler configuration
      const scheduler = getSyncScheduler();
      scheduler.updateConfig(options || {});
      
      return NextResponse.json({
        success: true,
        config: scheduler.getConfig(),
        message: 'Configuration updated successfully',
      });
    }

    if (action === 'clear-caches') {
      // Clear all caches
      const syncService = getSyncService();
      syncService.clearCaches();
      
      return NextResponse.json({
        success: true,
        message: 'Caches cleared successfully',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in POST /api/openphone-sync:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Sync operation failed'
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;

    if (action === 'update-scheduler-config') {
      // Update scheduler configuration
      const scheduler = getSyncScheduler();
      scheduler.updateConfig(config);
      
      return NextResponse.json({
        success: true,
        config: scheduler.getConfig(),
        message: 'Scheduler configuration updated successfully',
      });
    }

    if (action === 'test-config') {
      // Test new configuration
      const scheduler = getSyncScheduler();
      const testResult = await scheduler.testConfiguration();
      
      return NextResponse.json(testResult);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error in PUT /api/openphone-sync:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}