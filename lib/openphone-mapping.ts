/**
 * Data Mapping for OpenPhone Contact Sync
 * 
 * This module handles the mapping between client data in Supabase and 
 * OpenPhone contact format. It implements the naming convention:
 * - Main Client: "James" (just client name)
 * - Alternative Contact: "James - Brother" (client name + relationship)
 */

import type { Client } from './db/schema';

// OpenPhone API Types (based on documentation)
export interface OpenPhoneContact {
  id?: string;
  externalId?: string;
  defaultFields: {
    firstName?: string;
    lastName?: string;
    company?: string;
    emails?: Array<{
      name: string;
      value: string;
      id: string;
    }>;
    phoneNumbers?: Array<{
      name: string;
      value: string;
      id: string;
    }>;
    role?: string;
  };
  customFields?: Array<{
    name: string;
    key: string;
    type: 'multi-select' | 'text' | 'date' | 'number';
    value: string | string[] | null;
  }>;
  source?: string;
}

export interface OpenPhoneContactResponse {
  data: OpenPhoneContact;
}

export interface ContactCreationRequest {
  defaultFields: OpenPhoneContact['defaultFields'];
  customFields?: OpenPhoneContact['customFields'];
  externalId?: string;
  source?: string;
}

export interface ContactUpdateRequest {
  defaultFields?: OpenPhoneContact['defaultFields'];
  customFields?: OpenPhoneContact['customFields'];
  externalId?: string;
}

export interface MappedContact {
  openPhoneContact: ContactCreationRequest;
  clientId: string;
  clientName: string;
  contactType: 'main' | 'alternative_1' | 'alternative_2';
  isExisting?: boolean;
  existingContactId?: string;
}

// OpenPhone custom field keys can vary by workspace. Expose environment-based overrides
const CUSTOM_FIELD_KEYS = {
  clientType: process.env.OPENPHONE_CF_CLIENT_TYPE_KEY,
  dateOfBirth: process.env.OPENPHONE_CF_DATE_OF_BIRTH_KEY,
  county: process.env.OPENPHONE_CF_COUNTY_KEY,
  intakeDate: process.env.OPENPHONE_CF_INTAKE_DATE_KEY,
  caseType: process.env.OPENPHONE_CF_CASE_TYPE_KEY,
  arrested: process.env.OPENPHONE_CF_ARRESTED_KEY,
  currentlyIncarcerated: process.env.OPENPHONE_CF_CURRENTLY_INCARCERATED_KEY,
  primaryClientName: process.env.OPENPHONE_CF_PRIMARY_CLIENT_NAME_KEY,
  relationship: process.env.OPENPHONE_CF_RELATIONSHIP_KEY,
  contactPersonName: process.env.OPENPHONE_CF_CONTACT_PERSON_NAME_KEY,
  alternativeContactNumber: process.env.OPENPHONE_CF_ALT_CONTACT_NUMBER_KEY,
};

// Utility function to generate unique IDs for phone numbers and emails
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Utility function to validate phone numbers
function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  
  // Pre-filter: Check for clearly invalid values first
  const trimmedPhone = phone.trim().toUpperCase();
  
  // Filter out clearly invalid values
  const invalidValues = ['N/A', 'NA', 'X', 'NONE', 'NULL', '', 'TBD', 'TBA'];
  if (invalidValues.includes(trimmedPhone)) {
    return false;
  }
  
  // Remove all non-digit characters for validation
  const digits = phone.replace(/\D/g, '');
  
  // Check for valid length (10-15 digits for most countries)
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }
  
  // Check for valid format patterns (allow +, digits, spaces, dashes, parentheses, dots)
  const phonePattern = /^[+]?[\d\s\-().]+$/;
  if (!phonePattern.test(phone)) {
    return false;
  }
  
  // Check for at least one digit
  if (!/\d/.test(phone)) {
    return false;
  }
  
  // Additional validation: ensure we have at least some non-digit separators or proper formatting
  // This helps catch edge cases like "1234567890abc"
  const hasValidFormat = /^[+]?[0-9\s\-().]*$/.test(phone);
  if (!hasValidFormat) {
    return false;
  }
  
  return true;
}

// Utility function to standardize phone numbers for OpenPhone format
function standardizePhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return '';
  }
  
  // Pre-filter: Check for clearly invalid values and return empty string
  const trimmedPhone = phone.trim().toUpperCase();
  
  // Filter out clearly invalid values
  const invalidValues = ['N/A', 'NA', 'X', 'NONE', 'NULL', '', 'TBD', 'TBA'];
  if (invalidValues.includes(trimmedPhone)) {
    return '';
  }
  
  // Remove all non-digit characters except +
  let sanitized = phone.replace(/[^\d+]/g, '');
  
  // Handle international format
  if (sanitized.startsWith('+')) {
    // Ensure proper formatting for international numbers
    return sanitized.replace(/\+/, '+').replace(/\+/g, '+');
  }
  
  // Handle 00 prefix (international without +)
  if (sanitized.startsWith('00')) {
    return '+' + sanitized.substring(2);
  }
  
  // Handle US/Canada numbers (10 digits)
  if (sanitized.length === 10) {
    // Check if it looks like a valid US format (starts with 2-9 for area code)
    const areaCode = sanitized.substring(0, 3);
    if (parseInt(areaCode.charAt(0)) >= 2) {
      return '+1' + sanitized;
    }
  }
  // Handle US numbers with country code (11 digits starting with 1)
  else if (sanitized.length === 11 && sanitized.startsWith('1')) {
    return '+' + sanitized;
  }
  // Handle other numbers without country code (assume international if 11+ digits)
  else if (sanitized.length >= 11) {
    // For international numbers without country code, we'll assume they're already complete
    return sanitized;
  }
  // Handle extension numbers or partial numbers (reject)
  else if (sanitized.length < 7) {
    return ''; // Too short, likely extension or invalid
  }
  
  return sanitized;
}

// Legacy function for backward compatibility
function sanitizePhoneNumber(phone: string): string {
  return standardizePhoneNumber(phone);
}

// Main mapping function to convert client to OpenPhone contacts
export function mapClientToContacts(client: Client): MappedContact[] {
  const contacts: MappedContact[] = [];
  
  // MANDATORY VALIDATION RULE: Create main client contact ONLY if valid phone number exists
  const mainContact = mapMainClient(client);
  if (mainContact) {
    // Main client has valid phone number, add to contacts
    contacts.push(mainContact);
    
    // Now process alternative contacts (only if main client contact was created)
    // Alternative contact 1 - only if valid phone number exists
    if (client.contact_1 && client.contact_1_phone && client.relationship_1) {
      const altContact1 = mapAlternativeContact(client, 1);
      if (altContact1) {
        contacts.push(altContact1);
      }
    }
    
    // Alternative contact 2 - only if valid phone number exists
    if (client.contact_2 && client.contact_2_phone && client.relationship_2) {
      const altContact2 = mapAlternativeContact(client, 2);
      if (altContact2) {
        contacts.push(altContact2);
      }
    }
  } else {
    // Main client has no valid phone number - skip ALL contacts including alternatives
    console.log(`Skipping client ${client.client_name} and all alternative contacts due to missing/invalid main phone number`);
  }
  
  return contacts;
}

// Map main client contact
function mapMainClient(client: Client): MappedContact | null {
  // MANDATORY: Main client contact requires valid phone number
  if (!client.client_name) {
    console.log(`Main client missing client name`);
    return null;
  }
  
  // Check for valid phone number - this is the gatekeeper
  if (!client.phone || !isValidPhoneNumber(client.phone)) {
    const phoneInfo = client.phone || 'N/A';
    const stdPhoneForLog = standardizePhoneNumber(client.phone || '');
    console.log(`Main client ${client.client_name} - Raw: "${phoneInfo}", Standardized: "${stdPhoneForLog}" - INVALID`);
    return null;
  }
  
  // Validate that phone number can be properly standardized for API
  const mainPhoneStandardized = standardizePhoneNumber(client.phone);
  if (!mainPhoneStandardized) {
    console.log(`Main client ${client.client_name} phone number cannot be standardized: "${client.phone}"`);
    return null;
  }
  
  const customFields: NonNullable<ContactCreationRequest['customFields']> = [];

  if (CUSTOM_FIELD_KEYS.clientType && client.client_type) {
    customFields.push({
      name: 'Client Type',
      key: CUSTOM_FIELD_KEYS.clientType,
      type: 'text',
      value: client.client_type,
    });
  }

  if (CUSTOM_FIELD_KEYS.dateOfBirth && client.date_of_birth) {
    customFields.push({
      name: 'Date of Birth',
      key: CUSTOM_FIELD_KEYS.dateOfBirth,
      type: 'date',
      value: client.date_of_birth,
    });
  }

  if (CUSTOM_FIELD_KEYS.county && client.county) {
    customFields.push({
      name: 'County',
      key: CUSTOM_FIELD_KEYS.county,
      type: 'text',
      value: client.county,
    });
  }

  if (CUSTOM_FIELD_KEYS.intakeDate && client.date_intake) {
    customFields.push({
      name: 'Intake Date',
      key: CUSTOM_FIELD_KEYS.intakeDate,
      type: 'date',
      value: client.date_intake,
    });
  }

  if (client.client_type === 'civil' && CUSTOM_FIELD_KEYS.caseType && client.case_type) {
    customFields.push({
      name: 'Case Type',
      key: CUSTOM_FIELD_KEYS.caseType,
      type: 'text',
      value: client.case_type,
    });
  }

  if (client.client_type === 'criminal') {
    if (CUSTOM_FIELD_KEYS.arrested && client.arrested) {
      customFields.push({
        name: 'Arrested',
        key: CUSTOM_FIELD_KEYS.arrested,
        type: 'text',
        value: 'Yes',
      });
    }
    if (CUSTOM_FIELD_KEYS.currentlyIncarcerated && client.currently_incarcerated) {
      customFields.push({
        name: 'Incarcerated',
        key: CUSTOM_FIELD_KEYS.currentlyIncarcerated,
        type: 'text',
        value: 'Yes',
      });
    }
  }

  const contact: MappedContact = {
    openPhoneContact: {
      defaultFields: {
        firstName: client.client_name,
        company: 'Legal Client',
        role: client.client_type === 'criminal' ? 'Criminal Client' : 'Civil Client',
      },
      externalId: `client_${client.id}`,
      source: 'legal-practitioner-app',
    },
    clientId: client.id,
    clientName: client.client_name,
    contactType: 'main',
  };

  if (customFields.length > 0) {
    contact.openPhoneContact.customFields = customFields;
  }
  
  // Add valid phone number (validated and standardized above)
  contact.openPhoneContact.defaultFields.phoneNumbers = [{
    name: 'Main Phone',
    value: mainPhoneStandardized,
    id: generateId(),
  }];
  
  // Add email if available
  if (client.email) {
    contact.openPhoneContact.defaultFields.emails = [{
      name: 'Email',
      value: client.email,
      id: generateId(),
    }];
  }
  
  return contact;
}

// Map alternative contact (contact_1 or contact_2)
function mapAlternativeContact(client: Client, contactNumber: 1 | 2): MappedContact | null {
  const contactName = contactNumber === 1 ? client.contact_1 : client.contact_2;
  const contactPhone = contactNumber === 1 ? client.contact_1_phone : client.contact_2_phone;
  const relationship = contactNumber === 1 ? client.relationship_1 : client.relationship_2;
  
  // MANDATORY: Alternative contacts are optional but require ALL fields AND valid phone number
  if (!contactName || !contactPhone || !relationship) {
    console.log(`Alternative contact ${contactNumber} for ${client.client_name} missing required data: name="${contactName}", phone="${contactPhone}", relationship="${relationship}"`);
    return null;
  }
  
  // MANDATORY: Phone number validation - must be valid to create alternative contact
  if (!isValidPhoneNumber(contactPhone)) {
    const altPhoneForLog = standardizePhoneNumber(contactPhone);
    console.log(`Alternative contact ${contactNumber} for ${client.client_name} - Raw: "${contactPhone}", Standardized: "${altPhoneForLog}" - INVALID`);
    return null;
  }
  
  // Validate that phone number can be properly standardized for API
  const altPhoneStandardized = standardizePhoneNumber(contactPhone);
  if (!altPhoneStandardized) {
    console.log(`Alternative contact ${contactNumber} for ${client.client_name} phone number cannot be standardized: "${contactPhone}"`);
    return null;
  }
  
  // Generate contact name using the naming convention: "ClientName - Relationship"
  const openPhoneContactName = `${client.client_name} - ${relationship}`;
  
  const customFields: NonNullable<ContactCreationRequest['customFields']> = [];

  if (CUSTOM_FIELD_KEYS.primaryClientName) {
    customFields.push({
      name: 'Client Name',
      key: CUSTOM_FIELD_KEYS.primaryClientName,
      type: 'text',
      value: client.client_name,
    });
  }

  if (CUSTOM_FIELD_KEYS.relationship) {
    customFields.push({
      name: 'Relationship to Client',
      key: CUSTOM_FIELD_KEYS.relationship,
      type: 'text',
      value: relationship,
    });
  }

  if (CUSTOM_FIELD_KEYS.contactPersonName) {
    customFields.push({
      name: 'Contact Person Name',
      key: CUSTOM_FIELD_KEYS.contactPersonName,
      type: 'text',
      value: contactName,
    });
  }

  if (CUSTOM_FIELD_KEYS.clientType && client.client_type) {
    customFields.push({
      name: 'Client Type',
      key: CUSTOM_FIELD_KEYS.clientType,
      type: 'text',
      value: client.client_type,
    });
  }

  if (CUSTOM_FIELD_KEYS.alternativeContactNumber) {
    customFields.push({
      name: 'Alternative Contact Number',
      key: CUSTOM_FIELD_KEYS.alternativeContactNumber,
      type: 'text',
      value: contactNumber.toString(),
    });
  }

  const contact: MappedContact = {
    openPhoneContact: {
      defaultFields: {
        firstName: openPhoneContactName,
        company: 'Legal Client Contact',
        role: `Alternative Contact (${relationship})`,
      },
      externalId: `client_${client.id}_alt_${contactNumber}`,
      source: 'legal-practitioner-app',
    },
    clientId: client.id,
    clientName: client.client_name,
    contactType: contactNumber === 1 ? 'alternative_1' : 'alternative_2',
  };

  if (customFields.length > 0) {
    contact.openPhoneContact.customFields = customFields;
  }
  
  // Add valid phone number (validated and standardized above)
  contact.openPhoneContact.defaultFields.phoneNumbers = [{
    name: `${relationship} Phone`,
    value: altPhoneStandardized,
    id: generateId(),
  }];
  
  return contact;
}

// Test function to demonstrate phone number processing capabilities
export function testPhoneNumberProcessing(): void {
  console.log('\n=== Phone Number Processing Test ===');
  
  const testCases = [
    // Valid US phone numbers
    '706-877-4587',
    '7064037343',
    '(706) 877-4587',
    '706.877.4587',
    '+1-706-877-4587',
    '+17068774587',
    
    // Invalid/edge cases
    'N/A',
    'x',
    'X',
    'None',
    'TBD',
    '',
    'abc',
    '123',
    '706',
    '706-87',
    
    // International formats
    '+44 20 7123 4567',
    '00441234567890',
    '442071234567',
    
    // Edge cases
    '1-800-555-0123',
    '8005550123',
    '+18005550123',
  ];
  
  console.log('Testing phone number validation and standardization...\n');
  
  testCases.forEach((phone, index) => {
    const isValid = isValidPhoneNumber(phone);
    const standardized = standardizePhoneNumber(phone);
    
    console.log(`${index + 1}. Raw: "${phone}"`);
    console.log(`   Valid: ${isValid ? '✅' : '❌'}`);
    console.log(`   Standardized: "${standardized}"`);
    console.log(`   API Ready: ${standardized ? '✅' : '❌'}`);
    console.log('');
  });
  
  console.log('=== Test Complete ===\n');
}

// Validation function for mapped contacts
export function validateMappedContact(contact: MappedContact): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check required fields
  if (!contact.openPhoneContact.defaultFields.firstName) {
    errors.push('Contact name is required');
  }
  
  // Phone numbers are now optional - only validate if present
  if (contact.openPhoneContact.defaultFields.phoneNumbers &&
      contact.openPhoneContact.defaultFields.phoneNumbers.length > 0) {
    for (const phone of contact.openPhoneContact.defaultFields.phoneNumbers) {
      if (phone.value && !isValidPhoneNumber(phone.value)) {
        errors.push(`Invalid phone number: ${phone.value}`);
      }
    }
  }
  
  // Validate custom fields
  if (contact.openPhoneContact.customFields) {
    for (const field of contact.openPhoneContact.customFields) {
      if (!field.name || !field.key) {
        errors.push('Custom field name and key are required');
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Utility function to check if contact data has changed (for incremental sync)
export function hasContactDataChanged(oldContact: OpenPhoneContact, newContact: MappedContact): boolean {
  // Simple comparison - in a real implementation, you'd want more sophisticated diffing
  const oldFirstName = oldContact.defaultFields.firstName;
  const newFirstName = newContact.openPhoneContact.defaultFields.firstName;
  
  if (oldFirstName !== newFirstName) return true;
  
  // Compare phone numbers
  const oldPhones = oldContact.defaultFields.phoneNumbers?.map(p => p.value) || [];
  const newPhones = newContact.openPhoneContact.defaultFields.phoneNumbers?.map(p => p.value) || [];
  
  if (oldPhones.length !== newPhones.length) return true;
  
  for (const phone of oldPhones) {
    if (!newPhones.includes(phone)) return true;
  }
  
  return false;
}
