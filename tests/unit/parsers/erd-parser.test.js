/**
 * Unit Tests for ERD Parser
 * Tests Mermaid ERD parsing, entity extraction, and relationship detection
 */

const ERDParser = require('../../../src/backend/parsers/erd-parser');
const testData = require('../../fixtures/test-data');

// Mock logger
jest.mock('../../../src/backend/utils/logger');

describe('ERDParser', () => {
  let parser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new ERDParser();
  });

  describe('Basic Parsing', () => {
    test('should parse simple ERD successfully', () => {
      const result = parser.parse(testData.simpleERD);
      
      expect(result.success).toBe(true);
      expect(result.entities).toHaveLength(2);
      expect(result.relationships).toHaveLength(1);
      
      // Check Customer entity
      const customer = result.entities.find(e => e.name === 'Customer');
      expect(customer).toBeDefined();
      expect(customer.attributes).toHaveLength(5);
      expect(customer.attributes.find(a => a.name === 'customer_id').isPrimaryKey).toBe(true);
      
      // Check Order entity
      const order = result.entities.find(e => e.name === 'Order');
      expect(order).toBeDefined();
      expect(order.attributes.find(a => a.name === 'customer_id').isForeignKey).toBe(true);
      
      // Check relationship
      expect(result.relationships[0]).toMatchObject({
        from: 'Customer',
        to: 'Order',
        type: 'one-to-many',
        label: 'places'
      });
    });

    test('should parse complex ERD with multiple entities', () => {
      const result = parser.parse(testData.complexERD);
      
      expect(result.success).toBe(true);
      expect(result.entities).toHaveLength(5);
      expect(result.relationships).toHaveLength(5);
      
      // Verify all entities are present
      const entityNames = result.entities.map(e => e.name);
      expect(entityNames).toContain('Account');
      expect(entityNames).toContain('Contact');
      expect(entityNames).toContain('Opportunity');
      expect(entityNames).toContain('OpportunityProduct');
      expect(entityNames).toContain('Product');
    });

    test('should handle empty ERD diagram', () => {
      const emptyERD = 'erDiagram';
      const result = parser.parse(emptyERD);
      
      expect(result.success).toBe(true);
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });
  });

  describe('Entity Parsing', () => {
    test('should extract entity attributes correctly', () => {
      const result = parser.parse(testData.simpleERD);
      const customer = result.entities.find(e => e.name === 'Customer');
      
      expect(customer.attributes).toEqual([
        {
          name: 'customer_id',
          type: 'string',
          isPrimaryKey: true,
          isForeignKey: false,
          description: 'Unique customer identifier'
        },
        {
          name: 'first_name',
          type: 'string',
          isPrimaryKey: false,
          isForeignKey: false,
          description: 'Customer first name'
        },
        {
          name: 'last_name',
          type: 'string',
          isPrimaryKey: false,
          isForeignKey: false,
          description: 'Customer last name'
        },
        {
          name: 'email',
          type: 'string',
          isPrimaryKey: false,
          isForeignKey: false,
          description: 'Email address'
        },
        {
          name: 'created_date',
          type: 'datetime',
          isPrimaryKey: false,
          isForeignKey: false,
          description: 'Date customer was created'
        }
      ]);
    });

    test('should detect primary keys correctly', () => {
      const erdWithMultiplePK = `erDiagram
        TestEntity {
          string id PK "Primary key"
          string secondary_id PK "Secondary primary key"
          string name "Name field"
        }`;
      
      const result = parser.parse(erdWithMultiplePK);
      const entity = result.entities[0];
      
      const primaryKeys = entity.attributes.filter(a => a.isPrimaryKey);
      expect(primaryKeys).toHaveLength(2);
      expect(primaryKeys.map(pk => pk.name)).toEqual(['id', 'secondary_id']);
    });

    test('should detect foreign keys correctly', () => {
      const result = parser.parse(testData.simpleERD);
      const order = result.entities.find(e => e.name === 'Order');
      
      const foreignKey = order.attributes.find(a => a.name === 'customer_id');
      expect(foreignKey.isForeignKey).toBe(true);
    });

    test('should handle different data types', () => {
      const erdWithTypes = `erDiagram
        TestEntity {
          string text_field
          int number_field
          decimal money_field
          datetime date_field
          boolean flag_field
          picklist choice_field
        }`;
      
      const result = parser.parse(erdWithTypes);
      const entity = result.entities[0];
      
      expect(entity.attributes.map(a => a.type)).toEqual([
        'string', 'int', 'decimal', 'datetime', 'boolean', 'picklist'
      ]);
    });
  });

  describe('Relationship Parsing', () => {
    test('should parse one-to-many relationships', () => {
      const result = parser.parse(testData.simpleERD);
      const relationship = result.relationships[0];
      
      expect(relationship).toEqual({
        from: 'Customer',
        to: 'Order',
        type: 'one-to-many',
        label: 'places',
        fromCardinality: '||',
        toCardinality: 'o{',
        connector: '--'
      });
    });

    test('should parse different relationship types', () => {
      const erdWithRelationships = `erDiagram
        Entity1 {
          string id PK
        }
        Entity2 {
          string id PK
        }
        Entity3 {
          string id PK
        }
        Entity4 {
          string id PK
        }
        
        Entity1 ||--|| Entity2 : "one-to-one"
        Entity1 ||--o{ Entity3 : "one-to-many"
        Entity1 }o--o{ Entity4 : "many-to-many"`;
      
      const result = parser.parse(erdWithRelationships);
      
      expect(result.relationships).toHaveLength(3);
      expect(result.relationships[0].type).toBe('one-to-one');
      expect(result.relationships[1].type).toBe('one-to-many');
      expect(result.relationships[2].type).toBe('many-to-many');
    });

    test('should handle relationships without labels', () => {
      const erdWithoutLabels = `erDiagram
        Entity1 {
          string id PK
        }
        Entity2 {
          string id PK
        }
        
        Entity1 ||--o{ Entity2`;
      
      const result = parser.parse(erdWithoutLabels);
      
      expect(result.relationships[0].label).toBe('');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid ERD syntax', () => {
      const result = parser.parse(testData.invalidSyntaxERD);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('syntax');
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });

    test('should handle missing erDiagram declaration', () => {
      const invalidERD = `Entity1 {
        string id PK
      }`;
      
      const result = parser.parse(invalidERD);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('erDiagram');
    });

    test('should handle malformed entity definitions', () => {
      const malformedERD = `erDiagram
        Entity1 {
          invalid line without type
          string valid_field
        }`;
      
      const result = parser.parse(malformedERD);
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('invalid line'))).toBe(true);
    });

    test('should handle null or undefined input', () => {
      expect(() => parser.parse(null)).toThrow('ERD content is required');
      expect(() => parser.parse(undefined)).toThrow('ERD content is required');
      expect(() => parser.parse('')).toThrow('ERD content cannot be empty');
    });
  });

  describe('CDM Detection', () => {
    test('should detect CDM entities', () => {
      const result = parser.parse(testData.cdmERD);
      
      expect(result.cdmDetection).toBeDefined();
      expect(result.cdmDetection.detectedCDM).toContain('Account');
      expect(result.cdmDetection.detectedCDM).toContain('Contact');
      expect(result.cdmDetection.customEntities).toContain('CustomEntity');
    });

    test('should identify standard CDM field patterns', () => {
      const erdWithCDMFields = `erDiagram
        Account {
          string accountid PK
          string name
          string accountnumber
          picklist statecode
          datetime createdon
        }`;
      
      const result = parser.parse(erdWithCDMFields);
      const account = result.entities.find(e => e.name === 'Account');
      
      expect(result.cdmDetection.detectedCDM).toContain('Account');
      expect(account.attributes.some(a => a.name === 'statecode')).toBe(true);
      expect(account.attributes.some(a => a.name === 'createdon')).toBe(true);
    });
  });

  describe('Validation Rules', () => {
    test('should identify missing primary keys', () => {
      const result = parser.parse(testData.missingPrimaryKeyERD);
      
      expect(result.warnings).toBeDefined();
      expect(result.warnings.some(w => 
        w.type === 'primary_key' && w.message.includes('missing primary key')
      )).toBe(true);
    });

    test('should identify naming convention issues', () => {
      const result = parser.parse(testData.invalidNamingERD);
      
      expect(result.warnings.some(w => 
        w.type === 'naming' && w.message.includes('naming convention')
      )).toBe(true);
    });

    test('should identify orphaned entities', () => {
      const erdWithOrphan = `erDiagram
        ConnectedEntity {
          string id PK
        }
        OrphanEntity {
          string id PK
        }
        AnotherConnected {
          string id PK
          string connected_id FK
        }
        
        ConnectedEntity ||--o{ AnotherConnected : "has"`;
      
      const result = parser.parse(erdWithOrphan);
      
      expect(result.warnings.some(w => 
        w.type === 'orphan' && w.entity === 'OrphanEntity'
      )).toBe(true);
    });
  });

  describe('Line-by-Line Parsing', () => {
    test('should track line numbers for errors', () => {
      const multiLineERD = `erDiagram
        Entity1 {
          string valid_field
          invalid syntax here
          string another_field
        }`;
      
      const result = parser.parse(multiLineERD);
      
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('line 4'))).toBe(true);
    });

    test('should handle comments and empty lines', () => {
      const erdWithComments = `erDiagram
        %% This is a comment
        
        Entity1 {
          string id PK  %% Primary key comment
          string name   %% Name field
        }
        
        %% Another comment`;
      
      const result = parser.parse(erdWithComments);
      
      expect(result.success).toBe(true);
      expect(result.entities).toHaveLength(1);
    });
  });

  describe('Performance and Memory', () => {
    test('should handle large ERD diagrams efficiently', () => {
      // Generate a large ERD with many entities
      let largeERD = 'erDiagram\n';
      for (let i = 1; i <= 100; i++) {
        largeERD += `Entity${i} {\n`;
        largeERD += `  string entity${i}_id PK\n`;
        largeERD += `  string name\n`;
        largeERD += `  datetime created_date\n`;
        largeERD += `}\n\n`;
      }
      
      const startTime = Date.now();
      const result = parser.parse(largeERD);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.entities).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should not consume excessive memory', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Parse multiple ERDs
      for (let i = 0; i < 50; i++) {
        parser.parse(testData.complexERD);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
