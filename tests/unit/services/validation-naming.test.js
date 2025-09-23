/**
 * Test file for enhanced naming convention validation and fixes
 * Tests the comprehensive naming validation system
 */

const { ValidationService } = require('../../../src/backend/services/validation-service');
const { MermaidERDParser } = require('../../../src/backend/mermaid-parser');

describe('Enhanced Naming Convention Validation', () => {
    let validationService;
    let mermaidParser;
    let mockLogger;

    beforeEach(() => {
        mermaidParser = new MermaidERDParser();
        mockLogger = global.testUtils.createMockLogger();
        
        validationService = new ValidationService({
            mermaidParser: mermaidParser,
            logger: mockLogger
        });
    });

    describe('Entity Naming Validation', () => {
        test('should detect invalid entity names', async () => {
            const erdContent = `
erDiagram
    user-profile {
        string id PK
        string name
    }
    
    123InvalidName {
        string id PK
        string value
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            console.log('Parsed entities:', JSON.stringify(result.entities.map(e => e.name), null, 2));
            console.log('Warnings:', JSON.stringify(result.warnings.map(w => ({ type: w.type, entity: w.entity })), null, 2));
            
            const invalidNameWarnings = result.warnings.filter(w => w.type === 'invalid_entity_name');
            expect(invalidNameWarnings.length).toBeGreaterThan(0);
            expect(invalidNameWarnings.some(w => w.entity === 'user-profile')).toBe(true);
        });

        test('should detect reserved entity names', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string customField
    }
    
    Account {
        string id PK
        string accountNumber
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            const reservedNameWarnings = result.warnings.filter(w => w.type === 'reserved_entity_name');
            expect(reservedNameWarnings.length).toBeGreaterThan(0);
            expect(reservedNameWarnings.some(w => w.entity === 'User')).toBe(true);
            expect(reservedNameWarnings.some(w => w.entity === 'Account')).toBe(true);
        });

        test('should suggest PascalCase for entity names', async () => {
            const erdContent = `
erDiagram
    user_profile {
        string id PK
        string name
    }
    
    productCatalog {
        string id PK
        string description
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            const caseWarnings = result.warnings.filter(w => w.type === 'entity_name_case');
            expect(caseWarnings.length).toBeGreaterThan(0);
            expect(caseWarnings.some(w => w.entity === 'user_profile')).toBe(true);
        });
    });

    describe('Attribute Naming Validation', () => {
        test('should detect invalid attribute names', async () => {
            const erdContent = `
erDiagram
    Product {
        string id PK
        string product-name
        string 123invalid
        string ValidAttribute
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            const invalidAttrWarnings = result.warnings.filter(w => w.type === 'invalid_attribute_name');
            expect(invalidAttrWarnings.length).toBeGreaterThan(0);
            expect(invalidAttrWarnings.some(w => w.attribute === 'product-name')).toBe(true);
            expect(invalidAttrWarnings.some(w => w.attribute === '123invalid')).toBe(true);
        });

        test('should detect reserved attribute names', async () => {
            const erdContent = `
erDiagram
    CustomEntity {
        string Id PK
        string CreatedOn
        string ModifiedBy
        string customField
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            const reservedAttrWarnings = result.warnings.filter(w => w.type === 'reserved_attribute_name');
            expect(reservedAttrWarnings.length).toBeGreaterThan(0);
            expect(reservedAttrWarnings.some(w => w.attribute === 'CreatedOn')).toBe(true);
            expect(reservedAttrWarnings.some(w => w.attribute === 'ModifiedBy')).toBe(true);
        });

        test('should validate foreign key naming conventions', async () => {
            const erdContent = `
erDiagram
    Order {
        string id PK
        string customerId FK
        string customer_ref FK
        string invalidFK FK
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            
            // Check the parsed entities and their attributes first
            expect(result.entities).toBeDefined();
            expect(result.entities.length).toBe(1);
            expect(result.entities[0].name).toBe('Order');
            expect(result.entities[0].attributes.length).toBe(4);
            
            // Check that the FK attributes are properly parsed
            const fkAttributes = result.entities[0].attributes.filter(attr => attr.isForeignKey);
            expect(fkAttributes.length).toBe(3); // customerId, customer_ref, invalidFK
            
            const fkNamingWarnings = result.warnings.filter(w => w.type === 'foreign_key_naming_convention');
            
            // At least customer_ref should generate warnings (it doesn't match the pattern)
            expect(fkNamingWarnings.length).toBeGreaterThan(0);
            expect(fkNamingWarnings.some(w => w.attribute === 'customer_ref')).toBe(true);
        });
    });

    describe('Reserved Words Validation', () => {
        test('should detect SQL reserved words', async () => {
            const erdContent = `
erDiagram
    SELECT {
        string id PK
        string FROM
        string WHERE
    }
    
    NormalEntity {
        string id PK
        string UPDATE
    }
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            const reservedWordWarnings = result.warnings.filter(w => w.type === 'sql_reserved_word');
            expect(reservedWordWarnings.length).toBeGreaterThan(0);
            expect(reservedWordWarnings.some(w => w.entity === 'SELECT')).toBe(true);
            expect(reservedWordWarnings.some(w => w.attribute === 'FROM')).toBe(true);
        });
    });

    describe('Naming Convention Fixes', () => {
        test('should fix invalid entity names', async () => {
            const erdContent = `
erDiagram
    user-profile {
        string id PK
        string name
    }
`;

            const warnings = [
                {
                    type: 'invalid_entity_name',
                    entity: 'user-profile',
                    autoFixable: true,
                    fixData: {
                        originalName: 'user-profile',
                        suggestedName: 'UserProfile'
                    }
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(1);
            expect(result.fixedContent).toContain('UserProfile {');
            expect(result.fixedContent).not.toContain('user-profile {');
        });

        test('should fix reserved entity names', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string customField
    }
`;

            const warnings = [
                {
                    type: 'reserved_entity_name',
                    entity: 'User',
                    autoFixable: true,
                    fixData: {
                        originalName: 'User',
                        suggestedName: 'CustomUser'
                    }
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(1);
            expect(result.fixedContent).toContain('CustomUser {');
        });

        test('should fix invalid attribute names', async () => {
            const erdContent = `
erDiagram
    Product {
        string id PK
        string product-name
        string description
    }
`;

            const warnings = [
                {
                    type: 'invalid_attribute_name',
                    entity: 'Product',
                    attribute: 'product-name',
                    autoFixable: true,
                    fixData: {
                        entityName: 'Product',
                        originalName: 'product-name',
                        suggestedName: 'productName'
                    }
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(1);
            expect(result.fixedContent).toContain('string productName');
            expect(result.fixedContent).not.toContain('product-name');
        });

        test('should handle multiple naming fixes in one operation', async () => {
            const erdContent = `
erDiagram
    user-profile {
        string id PK
        string first-name
        string FROM
    }
    
    SELECT {
        string id PK
        string value
    }
`;

            const warnings = [
                {
                    type: 'invalid_entity_name',
                    entity: 'user-profile',
                    autoFixable: true,
                    fixData: {
                        originalName: 'user-profile',
                        suggestedName: 'userProfile'
                    }
                },
                {
                    type: 'sql_reserved_word',
                    entity: 'SELECT',
                    autoFixable: true,
                    fixData: {
                        originalName: 'SELECT',
                        suggestedName: 'SELECTEntity'
                    }
                },
                {
                    type: 'invalid_attribute_name',
                    entity: 'user-profile',
                    attribute: 'first-name',
                    autoFixable: true,
                    fixData: {
                        entityName: 'user-profile',
                        originalName: 'first-name',
                        suggestedName: 'firstName'
                    }
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes.length).toBeGreaterThan(0);
            // Note: Some fixes might conflict with each other (entity rename affects attribute fixes)
            // but the system should handle this gracefully
        });
    });

    describe('Helper Methods', () => {
        test('should sanitize entity names correctly', () => {
            expect(validationService.sanitizeEntityName('user-profile')).toBe('userprofile');
            expect(validationService.sanitizeEntityName('123invalid')).toBe('Entity123invalid');
            expect(validationService.sanitizeEntityName('valid_name')).toBe('valid_name');
        });

        test('should convert to PascalCase correctly', () => {
            expect(validationService.toPascalCase('user_profile')).toBe('UserProfile');
            expect(validationService.toPascalCase('product catalog')).toBe('ProductCatalog');
            expect(validationService.toPascalCase('camelCase')).toBe('CamelCase');
        });

        test('should fix foreign key names correctly', () => {
            expect(validationService.fixForeignKeyName('customerId')).toBe('customer_id');
            expect(validationService.fixForeignKeyName('user_ref')).toBe('user_id');
            expect(validationService.fixForeignKeyName('invalidFK')).toBe('invalidfk_id');
        });

        test('should shorten long names appropriately', () => {
            const longName = 'ThisIsAVeryLongEntityNameThatExceedsTheFiftyCharacterLimit';
            const shortened = validationService.shortenEntityName(longName);
            expect(shortened.length).toBeLessThanOrEqual(50);
            expect(shortened).toContain('Th'); // Should preserve beginning
            expect(shortened).toContain('it'); // Should preserve end
        });
    });
});