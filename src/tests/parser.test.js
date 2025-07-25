/**
 * Tests for Mermaid ERD Parser
 */

import { test, describe } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { MermaidERDParser } from '../parser.js';

describe('MermaidERDParser', () => {
  const parser = new MermaidERDParser();

  test('should parse simple entity with attributes', () => {
    const mermaidContent = `
erDiagram
    User {
        string id PK
        string name
        string email UK
        boolean active
    }
    `;

    const result = parser.parse(mermaidContent);
    
    strictEqual(result.entities.length, 1);
    strictEqual(result.entities[0].name, 'User');
    strictEqual(result.entities[0].attributes.length, 4);
    
    const idAttribute = result.entities[0].attributes[0];
    strictEqual(idAttribute.name, 'id');
    strictEqual(idAttribute.type, 'Edm.String');
    strictEqual(idAttribute.isPrimaryKey, true);
  });

  test('should parse relationships correctly', () => {
    const mermaidContent = `
erDiagram
    Customer {
        string id PK
        string name
    }
    
    Order {
        string id PK
        string customer_id FK
    }
    
    Customer ||--o{ Order : places
    `;

    const result = parser.parse(mermaidContent);
    
    strictEqual(result.entities.length, 2);
    strictEqual(result.relationships.length, 1);
    
    const relationship = result.relationships[0];
    strictEqual(relationship.fromEntity, 'Customer');
    strictEqual(relationship.toEntity, 'Order');
    strictEqual(relationship.cardinality.type, 'one-to-many');
  });

  test('should map data types correctly', () => {
    const testCases = [
      { input: 'string', expected: 'Edm.String' },
      { input: 'int', expected: 'Edm.Int32' },
      { input: 'decimal', expected: 'Edm.Decimal' },
      { input: 'boolean', expected: 'Edm.Boolean' },
      { input: 'datetime', expected: 'Edm.DateTimeOffset' },
      { input: 'guid', expected: 'Edm.Guid' }
    ];

    testCases.forEach(testCase => {
      const result = parser.mapMermaidTypeToDataverse(testCase.input);
      strictEqual(result, testCase.expected, `Failed for type: ${testCase.input}`);
    });
  });

  test('should parse cardinality correctly', () => {
    const testCases = [
      { input: '||--||', expected: 'one-to-one' },
      { input: '||--o{', expected: 'one-to-many' },
      { input: '}o--||', expected: 'many-to-one' },
      { input: '}o--o{', expected: 'many-to-many' }
    ];

    testCases.forEach(testCase => {
      const result = parser.parseCardinality(testCase.input);
      strictEqual(result.type, testCase.expected, `Failed for cardinality: ${testCase.input}`);
    });
  });

  test('should handle complex ERD with multiple entities and relationships', () => {
    const mermaidContent = `
erDiagram
    Customer {
        string customer_id PK
        string name
        string email UK
    }
    
    Order {
        string order_id PK
        string customer_id FK
        decimal total
    }
    
    Product {
        string product_id PK
        string name
        decimal price
    }
    
    OrderItem {
        string item_id PK
        string order_id FK
        string product_id FK
        int quantity
    }
    
    Customer ||--o{ Order : places
    Order ||--o{ OrderItem : contains
    Product ||--o{ OrderItem : includes
    `;

    const result = parser.parse(mermaidContent);
    
    strictEqual(result.entities.length, 4);
    strictEqual(result.relationships.length, 3);
    
    // Check entity names
    const entityNames = result.entities.map(e => e.name).sort();
    deepStrictEqual(entityNames, ['Customer', 'Order', 'OrderItem', 'Product']);
    
    // Check relationship types
    const relationshipTypes = result.relationships.map(r => r.cardinality.type);
    relationshipTypes.forEach(type => {
      strictEqual(type, 'one-to-many');
    });
  });

  test('should format display names correctly', () => {
    const testCases = [
      { input: 'customer_id', expected: 'Customer Id' },
      { input: 'first_name', expected: 'First Name' },
      { input: 'created_at', expected: 'Created At' },
      { input: 'user', expected: 'User' }
    ];

    testCases.forEach(testCase => {
      const result = parser.formatDisplayName(testCase.input);
      strictEqual(result, testCase.expected, `Failed for input: ${testCase.input}`);
    });
  });
});
