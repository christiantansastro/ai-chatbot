import type {
  SchemaDefinition,
  FieldDefinition,
  SchemaValidationResult,
  ChatData,
  MessageData,
  UserData,
  DocumentData,
  SuggestionData,
  VoteData
} from './adapters/types';

// Schema registry to manage different client schemas
export class SchemaRegistry {
  private schemas: Map<string, SchemaDefinition> = new Map();

  constructor() {
    this.initializeDefaultSchemas();
  }

  private initializeDefaultSchemas(): void {
    // Default Vercel AI Chatbot SDK schema
    this.registerSchema({
      clientId: 'default',
      version: '1.0.0',
      tables: {
        users: {
          fields: {
            id: { type: 'uuid', required: true },
            email: { type: 'text', required: true },
            password_hash: { type: 'text', required: false },
            user_metadata: { type: 'jsonb', required: false }
          }
        },
        chats: {
          fields: {
            id: { type: 'uuid', required: true },
            user_id: { type: 'uuid', required: true },
            title: { type: 'text', required: true },
            visibility: { type: 'text', required: true },
            metadata: { type: 'jsonb', required: false },
            created_at: { type: 'timestamptz', required: true },
            updated_at: { type: 'timestamptz', required: true }
          }
        },
        messages: {
          fields: {
            id: { type: 'uuid', required: true },
            chat_id: { type: 'uuid', required: true },
            role: { type: 'text', required: true },
            content: { type: 'jsonb', required: true },
            created_at: { type: 'timestamptz', required: true }
          }
        }
      }
    });

    // Client-specific schemas based on user's requirements
    this.registerSchema({
      clientId: 'client_1',
      version: '1.0.0',
      tables: {
        clients: {
          fields: {
            client_name: { type: 'text', required: true },
            date_intake: { type: 'date', required: true },
            date_of_birth: { type: 'date', required: true },
            address: { type: 'text', required: true },
            phone: { type: 'text', required: true },
            email: { type: 'text', required: true },
            contact_1: { type: 'text', required: false },
            relationship_1: { type: 'text', required: false },
            contact_2: { type: 'text', required: false },
            relationship_2: { type: 'text', required: false },
            notes: { type: 'text', required: false }
          }
        },
        financials: {
          fields: {
            client_name: { type: 'text', required: true },
            case_number: { type: 'text', required: true },
            quoted: { type: 'numeric', required: true },
            payment: { type: 'text', required: true },
            date: { type: 'date', required: true },
            balance: { type: 'numeric', required: true },
            service: { type: 'text', required: false },
            notes: { type: 'text', required: false },
            id: { type: 'integer', required: true },
            paid: { type: 'numeric', required: true }
          }
        },
        communications: {
          fields: {
            client_name: { type: 'text', required: true },
            date_intake: { type: 'date', required: true },
            communication_type: { type: 'text', required: true },
            notes: { type: 'text', required: true },
            court_date: { type: 'date', required: false }
          }
        }
      }
    });
  }

  registerSchema(schema: SchemaDefinition): void {
    const key = `${schema.clientId}:${schema.version}`;
    this.schemas.set(key, schema);
  }

  getSchema(clientId: string, version: string): SchemaDefinition | null {
    const key = `${clientId}:${version}`;
    return this.schemas.get(key) || null;
  }

  getLatestSchema(clientId: string): SchemaDefinition | null {
    const clientSchemas = Array.from(this.schemas.values())
      .filter(schema => schema.clientId === clientId)
      .sort((a, b) => this.compareVersions(b.version, a.version));

    return clientSchemas[0] || null;
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }

    return 0;
  }
}

// Schema adapter for transforming data between different schema versions
export class SchemaAdapter {
  private registry: SchemaRegistry;

  constructor(registry: SchemaRegistry) {
    this.registry = registry;
  }

  adaptChatData(chat: ChatData, targetSchema: SchemaDefinition): ChatData {
    // For now, return the chat data as-is since the default schema matches
    // In a real implementation, this would transform the data structure
    return chat;
  }

  adaptMessageData(message: MessageData, targetSchema: SchemaDefinition): MessageData {
    // Transform message data if needed
    return message;
  }

  adaptUserData(user: UserData, targetSchema: SchemaDefinition): UserData {
    // Transform user data if needed
    return user;
  }

  validateDataAgainstSchema(data: any, schema: SchemaDefinition, tableName: string): SchemaValidationResult {
    const tableSchema = schema.tables[tableName];
    if (!tableSchema) {
      return {
        isValid: false,
        errors: [`Table '${tableName}' not found in schema`],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    for (const [fieldName, fieldDef] of Object.entries(tableSchema.fields)) {
      if (fieldDef.required && (data[fieldName] === undefined || data[fieldName] === null)) {
        errors.push(`Required field '${fieldName}' is missing`);
      }
    }

    // Check field types (basic validation)
    for (const [fieldName, fieldDef] of Object.entries(tableSchema.fields)) {
      if (data[fieldName] !== undefined && data[fieldName] !== null) {
        const isValidType = this.validateFieldType(data[fieldName], fieldDef.type);
        if (!isValidType) {
          warnings.push(`Field '${fieldName}' has incorrect type. Expected ${fieldDef.type}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateFieldType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'text':
      case 'varchar':
        return typeof value === 'string';
      case 'integer':
      case 'bigint':
        return typeof value === 'number' && Number.isInteger(value);
      case 'numeric':
      case 'decimal':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || typeof value === 'string';
      case 'timestamptz':
        return value instanceof Date || typeof value === 'string';
      case 'uuid':
        return typeof value === 'string' && this.isValidUUID(value);
      case 'jsonb':
      case 'json':
        return typeof value === 'object' || typeof value === 'string';
      default:
        return true; // Unknown types pass validation
    }
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}

// Main schema manager class
export class SchemaManager {
  private registry: SchemaRegistry;
  private adapter: SchemaAdapter;

  constructor() {
    this.registry = new SchemaRegistry();
    this.adapter = new SchemaAdapter(this.registry);
  }

  // Get the current schema version for a client
  getCurrentVersion(clientId: string): string {
    const schema = this.registry.getLatestSchema(clientId);
    return schema?.version || '1.0.0';
  }

  // Adapt chat data for a specific client schema
  adaptChatData(chat: ChatData, clientId: string): ChatData {
    const schema = this.registry.getLatestSchema(clientId);
    if (!schema) {
      throw new Error(`No schema found for client ${clientId}`);
    }

    return this.adapter.adaptChatData(chat, schema);
  }

  // Adapt message data for a specific client schema
  adaptMessageData(message: MessageData, clientId: string): MessageData {
    const schema = this.registry.getLatestSchema(clientId);
    if (!schema) {
      throw new Error(`No schema found for client ${clientId}`);
    }

    return this.adapter.adaptMessageData(message, schema);
  }

  // Validate data against a client schema
  validateData(data: any, clientId: string, tableName: string): SchemaValidationResult {
    const schema = this.registry.getLatestSchema(clientId);
    if (!schema) {
      return {
        isValid: false,
        errors: [`No schema found for client ${clientId}`],
        warnings: []
      };
    }

    return this.adapter.validateDataAgainstSchema(data, schema, tableName);
  }

  // Register a new client schema
  registerClientSchema(clientId: string, schema: SchemaDefinition): void {
    this.registry.registerSchema(schema);
  }

  // Migrate schema to a new version
  async migrateSchema(clientId: string, targetVersion: string): Promise<void> {
    // This would implement actual schema migration logic
    console.log(`Migrating schema for client ${clientId} to version ${targetVersion}`);

    // In a real implementation, this would:
    // 1. Create migration scripts
    // 2. Apply them to the database
    // 3. Update schema version tracking
    // 4. Handle data transformations
  }

  // Get all available client schemas
  getAllSchemas(): SchemaDefinition[] {
    return Array.from(this.registry['schemas'].values());
  }

  // Get schema for a specific client and version
  getSchema(clientId: string, version: string): SchemaDefinition | null {
    return this.registry.getSchema(clientId, version);
  }
}