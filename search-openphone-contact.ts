/**
 * Quick helper to search OpenPhone contacts by name or phone.
 */

import { readFileSync } from 'fs';
import { getOpenPhoneClient } from './lib/openphone-client';

// Load env vars from .env.local
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
} catch (error) {
  console.warn('Could not load .env.local file:', (error as Error).message || 'Unknown error');
}

async function searchOpenPhone(query: string) {
  const client = getOpenPhoneClient();
  console.log(`Searching OpenPhone for "${query}"...`);

  if (query.startsWith('client_')) {
    const contact = await client.getContactByExternalId(query);
    if (!contact) {
      console.log('No contact found with that externalId.');
      return;
    }
    const phones = contact.defaultFields?.phoneNumbers?.map((p: any) => p.value).join(', ') || 'None';
    console.log(`Found contact: id=${(contact as any).id}, name=${contact.defaultFields?.firstName || 'N/A'}, phones=${phones}, externalId=${contact.externalId || 'None'}`);
    return;
  }

  const results = await client.searchContacts(query, 20);
  if (!results.length) {
    console.log('No contacts found.');
    return;
  }

  results.forEach((contact: any, idx: number) => {
    const firstName = contact.defaultFields?.firstName || 'N/A';
    const phones = contact.defaultFields?.phoneNumbers?.map((p: any) => p.value).join(', ') || 'None';
    console.log(`${idx + 1}. id=${contact.id}, name=${firstName}, phones=${phones}, externalId=${contact.externalId || 'None'}`);
  });
}

const query = process.argv[2];
if (!query) {
  console.error('Usage: pnpm tsx search-openphone-contact.ts "<query>"');
  process.exit(1);
}

searchOpenPhone(query).catch(error => {
  console.error('Search failed:', error instanceof Error ? error.message : error);
});
