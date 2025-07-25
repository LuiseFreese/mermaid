/**
 * Tests for Dataverse Schema Generator
 */

import { test, describe } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { DataverseSchemaGenerator } from '../schema-generator.js';

describe('DataverseSchemaGenerator', () => {
  const generator = new DataverseSchemaGenerator();

  test('should generate entity schema correctly', () => {
    const erdData = {
      entities: [
        {
          name: 'Customer',
          displayName: 'Customer',
          attributes: [
            {
              name: 'customer_id',
              displayName: 'Customer ID',
              type: 'Edm.String',
              isPrimaryKey: true,
              isForeignKey: false,
              isUnique: false,
              isRequired: true
            },
            {
              name: 'name',
              displayName: 'Name',
              type: 'Edm.String',
              isPrimaryKey: false,
              isForeignKey: false,
              isUnique: false,
              isRequired: true
            }
          ]
        }
      ],
      relationships: []
    };

    const schema = generator.generateSchema(erdData);
    
    strictEqual(schema.entities.length, 1);
    
    const entity = schema.entities[0];
    strictEqual(entity.LogicalName, 'mmd_customer');
    strictEqual(entity.SchemaName, 'Customer');
    strictEqual(entity.DisplayName.LocalizedLabels[0].Label, 'Customer');
    strictEqual(entity.Attributes.length, 2);
  });

  test('should generate attributes with correct types', () => {
    const erdData = {
      entities: [
        {
          name: 'TestEntity',
          displayName: 'Test Entity',
          attributes: [
            { name: 'text_field', type: 'Edm.String', isPrimaryKey: false, isRequired: false },
            { name: 'number_field', type: 'Edm.Int32', isPrimaryKey: false, isRequired: false },
            { name: 'decimal_field', type: 'Edm.Decimal', isPrimaryKey: false, isRequired: false },
            { name: 'boolean_field', type: 'Edm.Boolean', isPrimaryKey: false, isRequired: false },
            { name: 'date_field', type: 'Edm.DateTimeOffset', isPrimaryKey: false, isRequired: false }
          ]
        }
      ],
      relationships: []
    };

    const schema = generator.generateSchema(erdData);
    const entity = schema.entities[0];
    
    strictEqual(entity.Attributes[0]['@odata.type'], 'Microsoft.Dynamics.CRM.StringAttributeMetadata');
    strictEqual(entity.Attributes[1]['@odata.type'], 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata');
    strictEqual(entity.Attributes[2]['@odata.type'], 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata');
    strictEqual(entity.Attributes[3]['@odata.type'], 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata');
    strictEqual(entity.Attributes[4]['@odata.type'], 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata');
  });

  test('should generate one-to-many relationships', () => {
    const erdData = {
      entities: [
        { name: 'Customer', attributes: [] },
        { name: 'Order', attributes: [] }
      ],
      relationships: [
        {
          fromEntity: 'Customer',
          toEntity: 'Order',
          cardinality: { type: 'one-to-many' },
          name: 'places'
        }
      ]
    };

    const schema = generator.generateSchema(erdData);
    
    strictEqual(schema.relationships.length, 1);
    
    const relationship = schema.relationships[0];
    strictEqual(relationship['@odata.type'], 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata');
    strictEqual(relationship.ReferencedEntity, 'mmd_customer');
    strictEqual(relationship.ReferencingEntity, 'mmd_order');
  });

  test('should generate many-to-many relationships', () => {
    const erdData = {
      entities: [
        { name: 'Student', attributes: [] },
        { name: 'Course', attributes: [] }
      ],
      relationships: [
        {
          fromEntity: 'Student',
          toEntity: 'Course',
          cardinality: { type: 'many-to-many' },
          name: 'enrolls'
        }
      ]
    };

    const schema = generator.generateSchema(erdData);
    
    strictEqual(schema.relationships.length, 1);
    
    const relationship = schema.relationships[0];
    strictEqual(relationship['@odata.type'], 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata');
    strictEqual(relationship.Entity1LogicalName, 'mmd_student');
    strictEqual(relationship.Entity2LogicalName, 'mmd_course');
  });

  test('should format schema names correctly', () => {
    const testCases = [
      { input: 'customer_order', expected: 'CustomerOrder' },
      { input: 'user_profile', expected: 'UserProfile' },
      { input: 'product', expected: 'Product' }
    ];

    testCases.forEach(testCase => {
      const result = generator.formatSchemaName(testCase.input);
      strictEqual(result, testCase.expected, `Failed for input: ${testCase.input}`);
    });
  });

  test('should include metadata in schema', () => {
    const erdData = { entities: [], relationships: [] };
    const schema = generator.generateSchema(erdData);
    
    ok(schema.metadata);
    strictEqual(schema.metadata.publisherPrefix, 'mmd');
    strictEqual(schema.metadata.source, 'mermaid-erd');
    ok(schema.metadata.generatedAt);
  });
});
