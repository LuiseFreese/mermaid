/**
 * Test file for bulk fix functionality
 * Tests the enhanced validation and bulk fix system
 */

const { ValidationService } = require('../../../src/backend/services/validation-service');
const { MermaidERDParser } = require('../../../src/backend/mermaid-parser');

describe('Enhanced Validation - Bulk Fix', () => {
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

    describe('bulkFixWarnings', () => {
        test('should fix missing primary keys in bulk', async () => {
            const erdContent = `
erDiagram
    User {
        string name
        string email
    }
    
    Profile {
        string bio
        string avatar_url
    }
`;

            const warnings = [
                {
                    type: 'missing_primary_key',
                    entity: 'User',
                    message: 'Entity User is missing a primary key',
                    autoFixable: true
                },
                {
                    type: 'missing_primary_key',
                    entity: 'Profile', 
                    message: 'Entity Profile is missing a primary key',
                    autoFixable: true
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(2);
            expect(result.fixedContent).toContain('string id PK "Primary identifier"');
            expect(result.summary.fixesApplied).toBe(2);
        });

        test('should fix missing foreign keys in bulk', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string name
    }
    
    Post {
        string id PK
        string title
        string content
    }
    
    User ||--o{ Post : "creates"
`;

            const warnings = [
                {
                    type: 'missing_foreign_key',
                    entity: 'Post',
                    relationship: 'User → Post',
                    message: 'Missing foreign key for relationship User → Post',
                    autoFixable: true,
                    fixData: {
                        entityName: 'Post',
                        columnName: 'user_id',
                        referencedEntity: 'User'
                    }
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'autoFixableOnly'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(1);
            expect(result.fixedContent).toContain('string user_id FK "Foreign key to User"');
            expect(result.summary.fixesApplied).toBe(1);
        });

        test('should handle mixed fixable and non-fixable warnings', async () => {
            const erdContent = `
erDiagram
    User {
        string name
        string email
    }
`;

            const warnings = [
                {
                    type: 'missing_primary_key',
                    entity: 'User',
                    message: 'Entity User is missing a primary key',
                    autoFixable: true
                },
                {
                    type: 'custom_warning',
                    entity: 'User',
                    message: 'Some custom warning that cannot be fixed',
                    autoFixable: false
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'autoFixableOnly'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(1);
            expect(result.failedFixes).toHaveLength(0); // Non-fixable warnings are filtered out
            expect(result.summary.fixesAttempted).toBe(1); // Only autoFixable ones are attempted
        });

        test('should handle empty warnings array', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string name
    }
`;

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: [],
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(0);
            expect(result.failedFixes).toHaveLength(0);
            expect(result.fixedContent).toBe(erdContent);
            expect(result.summary.fixesApplied).toBe(0);
        });

        test('should handle fix failures gracefully', async () => {
            const erdContent = `
erDiagram
    User {
        string name
    }
`;

            const warnings = [
                {
                    type: 'missing_primary_key',
                    entity: 'NonExistentEntity', // This will cause the fix to fail
                    message: 'Entity NonExistentEntity is missing a primary key',
                    autoFixable: true
                }
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: erdContent,
                warnings: warnings,
                fixTypes: 'all'
            });

            expect(result.success).toBe(true);
            expect(result.appliedFixes).toHaveLength(0);
            expect(result.failedFixes).toHaveLength(1);
            expect(result.failedFixes[0].error).toContain('Entity NonExistentEntity not found');
        });
    });

    describe('Enhanced relationship validation', () => {
        test('should detect missing foreign keys', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string name
    }
    
    Post {
        string id PK
        string title
    }
    
    User ||--o{ Post : "creates"
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            console.log('Debug - All warnings:', result.warnings.map(w => ({ type: w.type, entity: w.entity, message: w.message })));
            console.log('Debug - Parsed entities:', result.entities.map(e => e.name));
            console.log('Debug - Parsed relationships:', result.relationships.map(r => ({ from: r.fromEntity, to: r.toEntity, type: r.cardinality?.type })));
            const missingFKWarnings = result.warnings.filter(w => w.type === 'missing_foreign_key');
            expect(missingFKWarnings.length).toBeGreaterThan(0);
            // Find the warning that has the entity property
            const entitySpecificWarning = missingFKWarnings.find(w => w.entity === 'Post');
            expect(entitySpecificWarning).toBeDefined();
            expect(entitySpecificWarning.autoFixable).toBe(true);
        });

        test('should detect circular dependencies', async () => {
            const erdContent = `
erDiagram
    A {
        string id PK
    }
    
    B {
        string id PK  
    }
    
    C {
        string id PK
    }
    
    A ||--o{ B : "relates"
    B ||--o{ C : "relates"
    C ||--o{ A : "relates"
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            const circularWarnings = result.warnings.filter(w => w.type === 'circular_dependency');
            expect(circularWarnings.length).toBeGreaterThan(0);
        });

        test('should auto-correct many-to-many relationships to junction tables', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string name
    }
    
    Role {
        string id PK
        string name
    }
    
    User }o--o{ Role : "has"
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            
            // Should auto-correct many-to-many to junction table pattern
            const autoCorrectMessages = result.warnings.filter(w => w.type === 'many_to_many_auto_corrected');
            expect(autoCorrectMessages.length).toBeGreaterThan(0);
            expect(autoCorrectMessages[0].message).toContain('junction table pattern');
            
            // Should have created a junction table entity
            const junctionEntity = result.entities.find(e => e.name.includes('User_Role') || e.name.includes('UserRole'));
            expect(junctionEntity).toBeDefined();
        });
    });
});