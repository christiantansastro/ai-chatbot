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