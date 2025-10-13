# Google Calendar & Tasks Integration - OAuth Setup Guide

This guide explains how to set up **OAuth 2.0 authentication** for personal Google account access instead of service account authentication.

## 🎯 OAuth vs Service Account

| Feature | OAuth (Personal) | Service Account |
|---------|------------------|-----------------|
| **Access** | Your personal calendar/tasks | Service account's calendar/tasks |
| **Setup** | More complex (OAuth flow) | Simpler (credentials only) |
| **Use Case** | Personal AI assistant | System integration |
| **Visibility** | Items appear in your calendar | Items in service account context |

## 📋 Prerequisites

1. **Google Cloud Project** with Calendar API and Tasks API enabled
2. **OAuth 2.0 credentials** (not service account)
3. **Next.js application** for OAuth redirect handling

## 🔧 OAuth Setup Instructions

### Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **"APIs & Services" > "Credentials"**
3. Click **"Create Credentials" > "OAuth 2.0 Client IDs"**
4. Configure OAuth consent screen if prompted
5. Select **"Web application"** as application type
6. Add authorized redirect URIs:
   - For development: `http://localhost:3000/auth/google/callback`
   - For production: `https://yourdomain.com/auth/google/callback`
7. **Save and download** the credentials

### Step 2: Enable Required APIs

1. Go to **"APIs & Services" > "Library"**
2. Enable these APIs:
   - **Google Calendar API**
   - **Google Tasks API**

### Step 3: Configure Environment Variables

Add OAuth credentials to your `.env.local` file:

```env
# OAuth Authentication (Personal Account Access)
GOOGLE_OAUTH_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Calendar and Tasks Configuration
GOOGLE_CALENDAR_ID=primary
GOOGLE_TASKS_LIST_ID=@default
```

### Step 4: Implement OAuth Flow in Next.js

Create API routes for OAuth flow:

**`app/api/auth/google/route.ts`:**
```typescript
import { googleOAuth } from '@/lib/google/auth-oauth';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const authUrl = googleOAuth.getAuthUrl();
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('OAuth URL generation failed:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}
```

**`app/api/auth/google/callback/route.ts`:**
```typescript
import { googleOAuth } from '@/lib/google/auth-oauth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    const tokens = await googleOAuth.exchangeCodeForTokens(code);

    // Store tokens securely (e.g., in database or secure cookie)
    // For now, we'll use them immediately
    await googleOAuth.initialize(tokens.access_token, tokens.refresh_token);

    return NextResponse.redirect(new URL('/?oauth=success', url.origin));
  } catch (error) {
    console.error('OAuth callback failed:', error);
    return NextResponse.redirect(new URL('/?oauth=error', url.origin));
  }
}
```

### Step 5: Create OAuth Login Component

**`components/google-oauth-login.tsx`:**
```typescript
'use client';

import { useState } from 'react';

export function GoogleOAuthLogin() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      window.location.href = '/api/auth/google';
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={isLoading}
      className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {isLoading ? 'Connecting...' : 'Connect Google Account'}
    </button>
  );
}
```

## 🚀 Usage with OAuth

### 1. Authentication Flow

```typescript
// Step 1: Get OAuth URL
const authUrl = googleOAuth.getAuthUrl();

// Step 2: User authorizes in browser
// User is redirected to Google, authorizes, then back to callback

// Step 3: Exchange code for tokens
const tokens = await googleOAuth.exchangeCodeForTokens(authorizationCode);

// Step 4: Initialize with tokens
await googleOAuth.initialize(tokens.access_token, tokens.refresh_token);

// Step 5: Use API (tokens are automatically refreshed)
const events = await readCalendarEvents({ maxResults: 10 });
```

### 2. Token Management

```typescript
// Check if token needs refresh
const isConnected = await googleOAuth.testConnection();

// Get current tokens
const accessToken = googleOAuth.getAccessToken();
const refreshToken = googleOAuth.getRefreshToken();

// Manual token refresh
const newAccessToken = await googleOAuth.refreshAccessToken();
```

## 🔒 Security Considerations

### OAuth Security Best Practices

1. **Store Tokens Securely**:
   ```typescript
   // Store in database with encryption
   const encryptedTokens = encrypt(tokens);
   await saveUserTokens(userId, encryptedTokens);

   // Or use secure HTTP-only cookies
   cookies().set('access_token', tokens.access_token, {
     httpOnly: true,
     secure: true,
     sameSite: 'strict'
   });
   ```

2. **Token Refresh Handling**:
   ```typescript
   // Automatically refresh expired tokens
   try {
     await googleOAuth.testConnection();
   } catch (error) {
     if (error.code === 401) {
       const newToken = await googleOAuth.refreshAccessToken();
       if (newToken) {
         // Retry the original operation
         return await originalOperation();
       }
     }
   }
   ```

## 🧪 Testing OAuth Integration

### 1. Start OAuth Flow
```bash
# Start your Next.js development server
pnpm dev
```

### 2. Test OAuth Flow
1. Navigate to `http://localhost:3000`
2. Click "Connect Google Account"
3. Authorize the application in Google
4. You'll be redirected back to your app

### 3. Verify Integration
```typescript
// Test the integration after OAuth setup
import { googleOAuth } from '@/lib/google/auth-oauth';

// Initialize with stored tokens
await googleOAuth.initialize(accessToken, refreshToken);

// Test calendar access
const events = await readCalendarEvents({ maxResults: 5 });
console.log('Calendar events:', events);

// Test task access
const tasks = await readTasks({ maxResults: 5 });
console.log('Tasks:', tasks);
```

## 📊 OAuth Scopes

The integration requests these permissions:

```typescript
const scopes = [
  'https://www.googleapis.com/auth/calendar',           // Full calendar access
  'https://www.googleapis.com/auth/calendar.events',    // Calendar events
  'https://www.googleapis.com/auth/tasks',              // Full tasks access
  'https://www.googleapis.com/auth/tasks.readonly'      // Read-only tasks (fallback)
];
```

## 🚨 OAuth Troubleshooting

### Common OAuth Issues

1. **Invalid Redirect URI**
   - Ensure redirect URIs match exactly in Google Cloud Console
   - Include protocol (http/https) and port numbers

2. **Token Refresh Issues**
   - Store refresh tokens securely
   - Handle token expiration gracefully
   - Implement automatic retry logic

3. **CORS Issues**
   - Configure CORS properly in Next.js
   - Ensure redirect URIs are whitelisted

### Debug OAuth Flow

```typescript
// Enable detailed OAuth logging
console.log('Auth URL:', googleOAuth.getAuthUrl());
console.log('Access Token:', googleOAuth.getAccessToken());
console.log('Refresh Token:', googleOAuth.getRefreshToken());
```

## 🎯 OAuth vs Service Account Decision

| Factor | OAuth (Personal) | Service Account |
|--------|------------------|-----------------|
| **Personal Access** | ✅ Items in your calendar | ❌ Items in service account |
| **Setup Complexity** | 🔴 More complex | 🟢 Simpler |
| **Security** | 🟡 User-dependent | 🟢 System-isolated |
| **Maintenance** | 🔴 Token management | 🟢 Credential-only |
| **Use Case** | Personal AI assistant | Business integration |

## 📞 OAuth Support

For OAuth-specific issues:
1. Check Google Cloud Console OAuth 2.0 configuration
2. Verify redirect URIs exactly match
3. Ensure proper token storage and refresh logic
4. Check browser network tab for OAuth errors

---

**Choose OAuth** if you want calendar events and tasks to appear in your personal Google account. **Choose Service Account** for system-level integrations where you don't need personal account visibility.