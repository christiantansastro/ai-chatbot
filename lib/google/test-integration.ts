/**
 * Test script for Google Calendar and Tasks integration
 * Run this script to verify that the Google API integration is working correctly
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { googleOAuth } from './auth-oauth';
import { formatDateForGoogle, googleRateLimiter, withRetry, logGoogleOperation } from './utils';

async function testGoogleIntegration() {
  console.log('🧪 Google Calendar & Tasks Creation Test\n');

  let createdEventId: string | null = null;
  let createdTaskId: string | null = null;

  try {
    // Check OAuth tokens and initialize
    console.log('🔧 Checking OAuth Configuration...');

    const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

    if (!accessToken) {
      console.log('❌ OAuth Access Token not found');
      console.log('\n🔧 To test OAuth integration:');
      console.log('1. Complete OAuth setup in Google Cloud Console');
      console.log('2. Add OAuth variables to .env.local');
      console.log('3. Run OAuth flow to get tokens');
      console.log('4. Set GOOGLE_OAUTH_ACCESS_TOKEN=your-access-token');
      console.log('\n📖 See lib/google/README-OAUTH.md for details');
      process.exit(1);
    }

    await googleOAuth.initialize(accessToken, refreshToken);
    console.log('✅ Google OAuth Service initialized\n');

    // Test 1: Create Calendar Event
    console.log('📅 Creating Calendar Event...');
    const now = new Date();
    const startTime = new Date(now.getTime() + (10 * 60 * 1000)); // 10 minutes from now
    const endTime = new Date(startTime.getTime() + (60 * 60 * 1000)); // 1 hour duration

    await googleRateLimiter.waitForSlot();
    const calendar = googleOAuth.getCalendarClient();
    const calendarId = googleOAuth.getDefaultCalendarId();

    const createResponse = await withRetry(async () => {
      return await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: 'AI Integration Test Event',
          description: 'This event was created by the AI integration test',
          start: {
            dateTime: formatDateForGoogle(startTime),
            timeZone: 'UTC',
          },
          end: {
            dateTime: formatDateForGoogle(endTime),
            timeZone: 'UTC',
          },
          location: 'Test Location',
        },
      });
    });

    if (createResponse.data && createResponse.data.id) {
      createdEventId = createResponse.data.id;
      console.log('✅ Calendar Event Created Successfully!');
      console.log('   📋 Event Details:');
      console.log('      Title:', createResponse.data.summary);
      console.log('      Start:', createResponse.data.start?.dateTime);
      console.log('      End:', createResponse.data.end?.dateTime);
      console.log('      Location:', createResponse.data.location);
      console.log('      Event ID:', createdEventId);
    } else {
      throw new Error('❌ Calendar event creation failed');
    }

    // Test 2: Create Task
    console.log('\n📝 Creating Task...');
    await googleRateLimiter.waitForSlot();
    const tasks = googleOAuth.getTasksClient();

    // Get the first available task list
    const taskListsResponse = await tasks.tasklists.list();
    const taskLists = taskListsResponse.data.items || [];

    if (taskLists.length === 0) {
      throw new Error('❌ No task lists available');
    }

    const taskListId = taskLists[0].id;
    console.log('📋 Using task list:', taskLists[0].title);

    const taskResponse = await withRetry(async () => {
      return await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: {
          title: 'AI Integration Test Task',
          notes: 'This task was created by the AI integration test',
          due: formatDateForGoogle(endTime),
        },
      });
    });

    if (taskResponse.data && taskResponse.data.id) {
      createdTaskId = taskResponse.data.id;
      console.log('✅ Task Created Successfully!');
      console.log('   📋 Task Details:');
      console.log('      Title:', taskResponse.data.title);
      console.log('      Due:', taskResponse.data.due);
      console.log('      Status:', taskResponse.data.status);
      console.log('      Task ID:', createdTaskId);
    } else {
      throw new Error('❌ Task creation failed');
    }

    // Test 3: Verify creations by reading them back
    console.log('\n🔍 Verifying Creations...');

    // Read back the calendar event
    await googleRateLimiter.waitForSlot();
    const readEventResponse = await calendar.events.get({
      calendarId,
      eventId: createdEventId,
    });

    if (readEventResponse.data) {
      console.log('✅ Calendar Event Verified:');
      console.log('   Title:', readEventResponse.data.summary);
      console.log('   Description:', readEventResponse.data.description);
    }

    // Read back the task
    await googleRateLimiter.waitForSlot();
    const readTaskResponse = await tasks.tasks.get({
      tasklist: taskListId,
      task: createdTaskId,
    });

    if (readTaskResponse.data) {
      console.log('✅ Task Verified:');
      console.log('   Title:', readTaskResponse.data.title);
      console.log('   Notes:', readTaskResponse.data.notes);
    }

    console.log('\n🎉 Integration Test Results:');
    console.log('✅ Calendar Event: CREATED and VERIFIED');
    console.log('✅ Task: CREATED and VERIFIED');
    console.log('\n📋 Summary:');
    console.log(`   Calendar Event ID: ${createdEventId}`);
    console.log(`   Task ID: ${createdTaskId}`);
    console.log('\n💡 Items were successfully created in YOUR PERSONAL GOOGLE ACCOUNT!');
    console.log('   📅 Calendar Event ID:', createdEventId);
    console.log('   📝 Task ID:', createdTaskId);
    console.log('\n🔍 To verify the items were created:');
    console.log('   1. Open your Google Calendar');
    console.log('   2. Open your Google Tasks');
    console.log('   3. Look for "AI Integration Test Event" and "AI Integration Test Task"');
    console.log('\n💡 Note: OAuth creates items in your personal Google account!');
    console.log('   This is the expected behavior for personal account access.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\n🔧 If items were created but test failed, you may need to manually delete:');
    if (createdEventId) console.error(`   Calendar Event ID: ${createdEventId}`);
    if (createdTaskId) console.error(`   Task ID: ${createdTaskId}`);
    process.exit(1);
  }
}

// Environment variables validation before running tests
function validateTestEnvironment() {
  // Check for OAuth variables first
  const oauthVars = [
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_CALENDAR_ID',
    'GOOGLE_TASKS_LIST_ID'
  ];

  const missingOAuth = oauthVars.filter(varName => !process.env[varName]);

  if (missingOAuth.length === 0) {
    console.log('✅ OAuth environment variables found');
    return;
  }

  // If OAuth not available, check for service account as fallback
  const serviceAccountVars = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    'GOOGLE_CALENDAR_ID',
    'GOOGLE_TASKS_LIST_ID'
  ];

  const missingServiceAccount = serviceAccountVars.filter(varName => !process.env[varName]);

  if (missingServiceAccount.length === 0) {
    console.log('✅ Service account environment variables found');
    return;
  }

  console.error('❌ Missing required environment variables for testing:');
  console.error('\nFor OAuth (recommended):');
  missingOAuth.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nFor Service Account (alternative):');
  missingServiceAccount.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease set up your .env.local file with OAuth or service account credentials.');
  process.exit(1);
}

// Run tests if this file is executed directly
if (require.main === module) {
  // Debug: Check environment variables
  console.log('🔍 Debug - Environment Variables:');
  console.log('GOOGLE_OAUTH_CLIENT_ID:', process.env.GOOGLE_OAUTH_CLIENT_ID ? 'SET' : 'UNDEFINED');
  console.log('GOOGLE_OAUTH_CLIENT_SECRET:', process.env.GOOGLE_OAUTH_CLIENT_SECRET ? 'SET' : 'UNDEFINED');
  console.log('GOOGLE_OAUTH_ACCESS_TOKEN:', process.env.GOOGLE_OAUTH_ACCESS_TOKEN ? 'SET' : 'UNDEFINED');
  console.log('GOOGLE_CALENDAR_ID:', process.env.GOOGLE_CALENDAR_ID ? 'SET' : 'UNDEFINED');
  console.log('GOOGLE_TASKS_LIST_ID:', process.env.GOOGLE_TASKS_LIST_ID ? 'SET' : 'UNDEFINED');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'UNDEFINED');
  console.log('');

  validateTestEnvironment();
  testGoogleIntegration();
}

export { testGoogleIntegration };