import { NextRequest, NextResponse } from 'next/server';
import { getCommunicationsSyncService } from '@/lib/openphone-communications-service';

function verifySignature(request: NextRequest): boolean {
  const expectedSecret = process.env.OPENPHONE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return true;
  }
  const signature = request.headers.get('x-openphone-signature') || request.headers.get('x-quo-signature');
  return signature === expectedSecret;
}

export async function POST(request: NextRequest) {
  if (!verifySignature(request)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const syncService = getCommunicationsSyncService();
    await syncService.handleWebhookEvent(payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OpenPhone webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
