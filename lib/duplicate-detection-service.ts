/**
 * Duplicate Detection Service for OpenPhone Contacts
 * 
 * This service handles detecting and managing duplicate contacts when syncing
 * from Supabase to OpenPhone. It uses multiple strategies for duplicate detection.
 */

import type { OpenPhoneContact, OpenPhoneContactResponse } from './openphone-mapping';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingContactId?: string;
  confidence: number; // 0-1, where 1 is certain duplicate
  matchReason: 'external_id' | 'phone_number' | 'name_similarity' | 'combined_match';
  metadata?: {
    matchedBy: string[];
    score: number;
  };
}

export interface DuplicateDetectionConfig {
  similarityThreshold: number; // Minimum similarity score for name-based matching
  enableExternalIdCheck: boolean;
  enablePhoneMatching: boolean;
  enableNameMatching: boolean;
  requireAllFields: boolean; // If true, requires all fields to match for duplicate
}

export interface PhoneMatch {
  contactId: string;
  phone: string;
  normalizedPhone: string;
  matchType: 'exact' | 'normalized' | 'partial';
}

export interface NameMatch {
  contactId: string;
  name: string;
  similarity: number;
  matchFields: string[];
}

// Default configuration
const DEFAULT_DUPLICATE_CONFIG: DuplicateDetectionConfig = {
  similarityThreshold: 0.85,
  enableExternalIdCheck: true,
  enablePhoneMatching: true,
  enableNameMatching: true,
  requireAllFields: false,
};

export class DuplicateDetectionService {
  private config: DuplicateDetectionConfig;
  private cache: Map<string, any> = new Map(); // Using any to handle OpenPhone API response format
  private phoneIndex: Map<string, PhoneMatch[]> = new Map();
  private nameIndex: Map<string, NameMatch[]> = new Map();

  constructor(config: Partial<DuplicateDetectionConfig> = {}) {
    this.config = { ...DEFAULT_DUPLICATE_CONFIG, ...config };
  }

  /**
   * Find contact by external ID
   */
  private async findByExternalId(
    externalId: string,
    openPhoneClient: any
  ): Promise<any | null> {
    const cacheKey = `external_${externalId}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const contact = await openPhoneClient.getContactByExternalId(externalId);
      if (contact) {
        this.cache.set(cacheKey, contact);
        return contact;
      }
    } catch (error) {
      console.warn('Error finding contact by external ID:', error);
    }

    return null;
  }

  /**
   * Check if a contact would create a duplicate
   */
  async checkForDuplicates(
    contactData: OpenPhoneContact,
    openPhoneClient: any
  ): Promise<DuplicateCheckResult> {
    try {
      // Strategy 1: Check by external ID (most reliable)
      if (this.config.enableExternalIdCheck && contactData.externalId) {
        const externalIdMatch = await this.findByExternalId(
          contactData.externalId,
          openPhoneClient
        );
        if (externalIdMatch) {
          return {
            isDuplicate: true,
            existingContactId: (externalIdMatch as any).id,
            confidence: 1.0,
            matchReason: 'external_id',
            metadata: {
              matchedBy: ['external_id'],
              score: 1.0,
            },
          };
        }
      }

      // Strategy 2: Check by phone number
      if (this.config.enablePhoneMatching && contactData.defaultFields.phoneNumbers) {
        const phoneMatch = await this.findByPhoneNumber(
          contactData.defaultFields.phoneNumbers,
          openPhoneClient
        );
        if (phoneMatch) {
          return {
            isDuplicate: true,
            existingContactId: phoneMatch.contactId,
            confidence: 0.9,
            matchReason: 'phone_number',
            metadata: {
              matchedBy: ['phone_number'],
              score: 0.9,
            },
          };
        }
      }

      // Strategy 3: Check by name similarity
      if (this.config.enableNameMatching && contactData.defaultFields.firstName) {
        const nameMatch = await this.findByNameSimilarity(
          contactData.defaultFields.firstName,
          contactData.defaultFields.phoneNumbers?.[0]?.value,
          openPhoneClient
        );
        if (nameMatch && nameMatch.similarity >= this.config.similarityThreshold) {
          return {
            isDuplicate: true,
            existingContactId: nameMatch.contactId,
            confidence: nameMatch.similarity,
            matchReason: 'name_similarity',
            metadata: {
              matchedBy: nameMatch.matchFields,
              score: nameMatch.similarity,
            },
          };
        }
      }

      // No duplicates found
      return {
        isDuplicate: false,
        confidence: 0.0,
        matchReason: 'combined_match',
        metadata: {
          matchedBy: [],
          score: 0.0,
        },
      };
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      // In case of error, assume no duplicate to avoid blocking the sync
      return {
        isDuplicate: false,
        confidence: 0.0,
        matchReason: 'combined_match',
        metadata: {
          matchedBy: [],
          score: 0.0,
        },
      };
    }
  }

  /**
   * Find contact by phone number
   */
  private async findByPhoneNumber(
    phoneNumbers: Array<{ name: string; value: string; id: string }>,
    openPhoneClient: any
  ): Promise<PhoneMatch | null> {
    for (const phone of phoneNumbers) {
      const normalizedPhone = this.normalizePhoneNumber(phone.value);
      
      // Check direct phone number
      const directMatch = await this.findByExactPhone(phone.value, openPhoneClient);
      if (directMatch) {
        return directMatch;
      }

      // Check normalized phone number
      const normalizedMatch = await this.findByNormalizedPhone(normalizedPhone, openPhoneClient);
      if (normalizedMatch) {
        return normalizedMatch;
      }

      // Check partial matches (last 7 digits)
      const partialPhone = normalizedPhone.slice(-7);
      const partialMatch = await this.findByPartialPhone(partialPhone, openPhoneClient);
      if (partialMatch) {
        return partialMatch;
      }
    }

    return null;
  }

  /**
   * Find contact by exact phone number
   */
  private async findByExactPhone(
    phone: string,
    openPhoneClient: any
  ): Promise<PhoneMatch | null> {
    try {
      // Search using OpenPhone's search functionality
      const contacts = await openPhoneClient.searchContacts(phone, 20);
      
      for (const contact of contacts) {
        if (contact.defaultFields.phoneNumbers) {
          for (const contactPhone of contact.defaultFields.phoneNumbers) {
            if (contactPhone.value === phone) {
              return {
                contactId: contact.id,
                phone,
                normalizedPhone: this.normalizePhoneNumber(phone),
                matchType: 'exact',
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error finding contact by exact phone:', error);
    }

    return null;
  }

  /**
   * Find contact by normalized phone number
   */
  private async findByNormalizedPhone(
    normalizedPhone: string,
    openPhoneClient: any
  ): Promise<PhoneMatch | null> {
    try {
      // Search using normalized phone number
      const contacts = await openPhoneClient.searchContacts(normalizedPhone, 20);
      
      for (const contact of contacts) {
        if (contact.defaultFields.phoneNumbers) {
          for (const contactPhone of contact.defaultFields.phoneNumbers) {
            if (this.normalizePhoneNumber(contactPhone.value) === normalizedPhone) {
              return {
                contactId: contact.id,
                phone: contactPhone.value,
                normalizedPhone,
                matchType: 'normalized',
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error finding contact by normalized phone:', error);
    }

    return null;
  }

  /**
   * Find contact by partial phone number (last 7 digits)
   */
  private async findByPartialPhone(
    partialPhone: string,
    openPhoneClient: any
  ): Promise<PhoneMatch | null> {
    try {
      // Get all contacts and check for partial matches
      // This is less efficient but catches edge cases
      let page = 1;
      const maxPages = 5; // Limit to avoid excessive API calls
      
      while (page <= maxPages) {
        const result = await openPhoneClient.getContacts(page, 100);
        
        for (const contact of result.data) {
          if (contact.defaultFields.phoneNumbers) {
            for (const contactPhone of contact.defaultFields.phoneNumbers) {
              const normalizedPhone = this.normalizePhoneNumber(contactPhone.value);
              if (normalizedPhone.endsWith(partialPhone)) {
                return {
                  contactId: contact.id,
                  phone: contactPhone.value,
                  normalizedPhone,
                  matchType: 'partial',
                };
              }
            }
          }
        }
        
        if (!result.hasMore) break;
        page++;
      }
    } catch (error) {
      console.warn('Error finding contact by partial phone:', error);
    }

    return null;
  }

  /**
   * Find contact by name similarity
   */
  private async findByNameSimilarity(
    name: string,
    phone?: string,
    openPhoneClient?: any
  ): Promise<NameMatch | null> {
    try {
      // Search by name first
      const contacts = await openPhoneClient.searchContacts(name, 20);
      
      let bestMatch: NameMatch | null = null;
      let bestSimilarity = 0;

      for (const contact of contacts) {
        const contactName = contact.defaultFields.firstName || '';
        const similarity = this.calculateStringSimilarity(name.toLowerCase(), contactName.toLowerCase());
        
        if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
          const matchFields = ['name'];
          
          // If phone is also provided and matches, increase confidence
          if (phone && contact.defaultFields.phoneNumbers) {
            const phoneMatches = contact.defaultFields.phoneNumbers.some((cp: any) =>
              cp.value === phone || this.normalizePhoneNumber(cp.value) === this.normalizePhoneNumber(phone)
            );
            if (phoneMatches) {
              matchFields.push('phone');
            }
          }

          bestMatch = {
            contactId: (contact as any).id,
            name: contactName,
            similarity,
            matchFields,
          };
          bestSimilarity = similarity;
        }
      }

      return bestMatch;
    } catch (error) {
      console.warn('Error finding contact by name similarity:', error);
    }

    return null;
  }

  /**
   * Normalize phone number for comparison
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // Handle international formatting
    if (normalized.startsWith('+1') && normalized.length === 12) {
      // US number with country code, remove country code for comparison
      normalized = normalized.substring(2);
    } else if (normalized.startsWith('1') && normalized.length === 11) {
      // US number starting with 1, remove leading 1
      normalized = normalized.substring(1);
    }
    
    return normalized;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Update cache with newly synced contacts
   */
  updateCache(contacts: OpenPhoneContact[]): void {
    for (const contact of contacts) {
      if (contact.externalId) {
        this.cache.set(`external_${contact.externalId}`, contact);
      }
      
      if (contact.defaultFields.phoneNumbers) {
        for (const phone of contact.defaultFields.phoneNumbers) {
          const normalizedPhone = this.normalizePhoneNumber(phone.value);
          if (!this.phoneIndex.has(normalizedPhone)) {
            this.phoneIndex.set(normalizedPhone, []);
          }
          this.phoneIndex.get(normalizedPhone)!.push({
            contactId: (contact as any).id,
            phone: phone.value,
            normalizedPhone,
            matchType: 'exact',
          });
        }
      }
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.phoneIndex.clear();
    this.nameIndex.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedContacts: number;
    phoneIndexSize: number;
    nameIndexSize: number;
  } {
    return {
      cachedContacts: this.cache.size,
      phoneIndexSize: this.phoneIndex.size,
      nameIndexSize: this.nameIndex.size,
    };
  }
}

// Export a singleton instance
let duplicateService: DuplicateDetectionService | null = null;

export function getDuplicateDetectionService(config?: Partial<DuplicateDetectionConfig>): DuplicateDetectionService {
  if (!duplicateService) {
    duplicateService = new DuplicateDetectionService(config);
  }
  return duplicateService;
}