/**
 * OAuth Setup Script
 * Run this script to get OAuth access tokens for your personal Google account
 *
 * Usage: npx tsx lib/google/oauth-setup.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { googleOAuth } from './auth-oauth';
import { readFileSync, writeFileSync } from 'fs';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });

async function setupOAuth() {
  console.log('🚀 Google OAuth Setup\n');

  try {
    // Check if OAuth credentials are configured
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('❌ OAuth credentials not found in .env.local');
      console.error('\nPlease add these variables to your .env.local file:');
      console.error('GOOGLE_OAUTH_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com');
      console.error('GOOGLE_OAUTH_CLIENT_SECRET=your-oauth-client-secret');
      console.error('GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback');
      console.error('\n📖 See lib/google/README-OAUTH.md for setup instructions');
      process.exit(1);
    }

    console.log('✅ OAuth credentials found');
    console.log('🔑 Client ID:', clientId.substring(0, 20) + '...');

    // Generate authorization URL
    console.log('\n🔗 Step 1: Generate Authorization URL');
    const authUrl = googleOAuth.getAuthUrl();
    console.log('\n🌐 Please visit this URL in your browser:');
    console.log('\n' + authUrl + '\n');

    // Instructions
    console.log('📋 Step 2: Authorization Instructions');
    console.log('1. Click the link above to open Google authorization page');
    console.log('2. Sign in with your personal Google account');
    console.log('3. Click "Allow" to grant permissions for:');
    console.log('   - Calendar access');
    console.log('   - Tasks access');
    console.log('4. Copy the authorization code from the redirect URL');
    console.log('5. Come back here and enter the code');
    console.log('');

    // Get authorization code from user
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const authorizationCode = await new Promise<string>((resolve) => {
      rl.question('🔑 Enter the authorization code: ', (code: string) => {
        rl.close();
        resolve(code.trim());
      });
    });

    if (!authorizationCode) {
      console.error('❌ No authorization code provided');
      process.exit(1);
    }

    console.log('\n🔄 Step 3: Exchanging code for tokens...');

    // Exchange code for tokens
    const tokens = await googleOAuth.exchangeCodeForTokens(authorizationCode);

    console.log('✅ Tokens obtained successfully!');

    // Display token information
    console.log('\n📋 Token Details:');
    console.log('Access Token:', tokens.access_token ? '✅ Present' : '❌ Missing');
    console.log('Refresh Token:', tokens.refresh_token ? '✅ Present' : '❌ Missing');
    console.log('Expires In:', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Not specified');

    // Create .env.local content with tokens
    const envContent = readFileSync('.env.local', 'utf8');

    const updatedEnvContent = envContent
      .split('\n')
      .filter(line => !line.startsWith('GOOGLE_OAUTH_ACCESS_TOKEN=') &&
                     !line.startsWith('GOOGLE_OAUTH_REFRESH_TOKEN='))
      .concat([
        `GOOGLE_OAUTH_ACCESS_TOKEN=${tokens.access_token}`,
        `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token || ''}`
      ])
      .join('\n');

    // Write updated .env.local file
    writeFileSync('.env.local', updatedEnvContent);
    console.log('\n💾 Updated .env.local with tokens');

    // Test the connection
    console.log('\n🧪 Step 4: Testing OAuth connection...');
    const isConnected = await googleOAuth.testConnection();

    if (isConnected) {
      console.log('✅ OAuth connection test successful!');
      console.log('\n🎉 OAuth setup complete! You can now:');
      console.log('   1. Run the integration test: npx tsx lib/google/test-integration.ts');
      console.log('   2. Use Google Calendar and Tasks tools in your AI agent');
      console.log('   3. Items will appear in your personal Google account');
    } else {
      console.log('⚠️ OAuth connection test failed, but tokens were saved');
      console.log('   You may need to refresh tokens later');
    }

  } catch (error) {
    console.error('\n❌ OAuth setup failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Verify OAuth credentials in Google Cloud Console');
    console.error('2. Check that redirect URI matches exactly');
    console.error('3. Ensure Calendar and Tasks APIs are enabled');
    console.error('4. Make sure you\'re authorizing with the correct Google account');
    process.exit(1);
  }
}

// Run setup if this file is executed directly
if (require.main === module) {
  setupOAuth();
}

export { setupOAuth };