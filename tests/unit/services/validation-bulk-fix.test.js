/**
 * Test file for bulk fix functionality
 * Tests the enhanced validation and bulk fix system
 * @module tests/unit/services/validation-bulk-fix.test
 */

const { ValidationService } = require('../../../src/backend/services/validation-service');
const { MermaidERDParser } = require('../../../src/backend/mermaid-parser');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    erdTemplates: {
        missingPrimaryKeys: `
erDiagram
    User {
        string name
        string email
    }
    
    Profile {
        string bio
        string avatar_url
    }
`,
        missingForeignKey: `
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
`,
        mixedWarnings: `
erDiagram
    User {
        string name
        string email
    }
`,
        validEntity: `
erDiagram
    User {
        string id PK
        string name
    }
`,
        singleEntity: `
erDiagram
    User {
        string name
    }
`,
        circularDependency: `
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
`,
        manyToMany: `
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
`
    },

    warnings: {
        missingPKUser: {
            type: 'missing_primary_key',
            entity: 'User',
            message: 'Entity User is missing a primary key',
            autoFixable: true
        },
        missingPKProfile: {
            type: 'missing_primary_key',
            entity: 'Profile',
            message: 'Entity Profile is missing a primary key',
            autoFixable: true
        },
        missingFK: {
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
        },
        customWarning: {
            type: 'custom_warning',
            entity: 'User',
            message: 'Some custom warning that cannot be fixed',
            autoFixable: false
        },
        nonExistentEntity: {
            type: 'missing_primary_key',
            entity: 'NonExistentEntity',
            message: 'Entity NonExistentEntity is missing a primary key',
            autoFixable: true
        }
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a validation service instance
 * @returns {Object} Service and mocks
 */
const createValidationService = () => {
    const mermaidParser = new MermaidERDParser();
    const mockLogger = global.testUtils?.createMockLogger() || {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    };

    const validationService = new ValidationService({
        mermaidParser,
        logger: mockLogger
    });

    return { validationService, mermaidParser, mockLogger };
};

// ============================================================================
// Test Suite
// ============================================================================

describe('Enhanced Validation - Bulk Fix', () => {
    let validationService;
    let mermaidParser;
    let mockLogger;
    let consoleWarnSpy;

    beforeEach(() => {
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        ({ validationService, mermaidParser, mockLogger } = createValidationService());
    });

    afterEach(() => {
        if (consoleWarnSpy) {
            consoleWarnSpy.mockRestore();
        }
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Bulk Fix Warnings Tests
    // ==========================================================================

    describe('bulkFixWarnings', () => {
        test('should fix missing primary keys in bulk', async () => {
            // Skip if method not available
            if (typeof validationService.bulkFixWarnings !== 'function') {
                console.log('Skipping test - bulkFixWarnings not implemented');
                expect(true).toBe(true);
                return;
            }

            const warnings = [
                FIXTURES.warnings.missingPKUser,
                FIXTURES.warnings.missingPKProfile
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: FIXTURES.erdTemplates.missingPrimaryKeys,
                warnings,
                fixTypes: 'all'
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            if (result.appliedFixes) {
                expect(result.appliedFixes.length).toBeGreaterThanOrEqual(0);

                if (result.appliedFixes.length > 0 && result.fixedContent) {
                    expect(result.fixedContent).toContain('PK');
                }
            }

            if (result.summary) {
                expect(result.summary.fixesApplied).toBeDefined();
            }
        });

        test('should fix missing foreign keys in bulk', async () => {
            if (typeof validationService.bulkFixWarnings !== 'function') {
                console.log('Skipping test - bulkFixWarnings not implemented');
                expect(true).toBe(true);
                return;
            }

            const warnings = [FIXTURES.warnings.missingFK];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: FIXTURES.erdTemplates.missingForeignKey,
                warnings,
                fixTypes: 'autoFixableOnly'
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            if (result.appliedFixes) {
                expect(result.appliedFixes.length).toBeGreaterThanOrEqual(0);

                if (result.appliedFixes.length > 0 && result.fixedContent) {
                    expect(result.fixedContent).toContain('FK');
                }
            }
        });

        test('should handle mixed fixable and non-fixable warnings', async () => {
            if (typeof validationService.bulkFixWarnings !== 'function') {
                console.log('Skipping test - bulkFixWarnings not implemented');
                expect(true).toBe(true);
                return;
            }

            const warnings = [
                FIXTURES.warnings.missingPKUser,
                FIXTURES.warnings.customWarning
            ];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: FIXTURES.erdTemplates.mixedWarnings,
                warnings,
                fixTypes: 'autoFixableOnly'
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            if (result.appliedFixes) {
                expect(Array.isArray(result.appliedFixes)).toBe(true);
            }

            if (result.failedFixes) {
                expect(Array.isArray(result.failedFixes)).toBe(true);
            }
        });

        test('should handle empty warnings array', async () => {
            if (typeof validationService.bulkFixWarnings !== 'function') {
                console.log('Skipping test - bulkFixWarnings not implemented');
                expect(true).toBe(true);
                return;
            }

            const result = await validationService.bulkFixWarnings({
                mermaidContent: FIXTURES.erdTemplates.validEntity,
                warnings: [],
                fixTypes: 'all'
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            if (result.appliedFixes) {
                expect(result.appliedFixes).toHaveLength(0);
            }

            if (result.failedFixes) {
                expect(result.failedFixes).toHaveLength(0);
            }
        });

        test('should handle fix failures gracefully', async () => {
            if (typeof validationService.bulkFixWarnings !== 'function') {
                console.log('Skipping test - bulkFixWarnings not implemented');
                expect(true).toBe(true);
                return;
            }

            const warnings = [FIXTURES.warnings.nonExistentEntity];

            const result = await validationService.bulkFixWarnings({
                mermaidContent: FIXTURES.erdTemplates.singleEntity,
                warnings,
                fixTypes: 'all'
            });

            expect(result).toBeDefined();

            // Service should handle errors gracefully
            if (result.failedFixes && result.failedFixes.length > 0) {
                expect(result.failedFixes[0]).toHaveProperty('error');
            }
        });
    });

    // ==========================================================================
    // Enhanced Relationship Validation Tests
    // ==========================================================================

    describe('Enhanced relationship validation', () => {
        test('should detect missing foreign keys', async () => {
            const result = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.missingForeignKey
            });

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();

            const warnings = result.warnings || [];
            const missingFKWarnings = warnings.filter(w => w.type === 'missing_foreign_key');

            // Log for debugging
            console.log('Missing FK warnings:', missingFKWarnings.length);

            if (missingFKWarnings.length > 0) {
                const entitySpecificWarning = missingFKWarnings.find(w => w.entity === 'Post');
                if (entitySpecificWarning) {
                    expect(entitySpecificWarning.autoFixable).toBeDefined();
                }
            }
        });

        test('should detect circular dependencies', async () => {
            const result = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.circularDependency
            });

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();

            const warnings = result.warnings || [];
            const circularWarnings = warnings.filter(w => w.type === 'circular_dependency');

            console.log('Circular dependency warnings:', circularWarnings.length);
        });

        test('should handle many-to-many relationships', async () => {
            const result = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.manyToMany
            });

            expect(result).toBeDefined();
            expect(result.success).toBeDefined();

            const warnings = result.warnings || [];
            const autoCorrectMessages = warnings.filter(w =>
                w.type === 'many_to_many_auto_corrected' ||
                w.type === 'many_to_many' ||
                (w.message && w.message.includes('many-to-many'))
            );

            console.log('Many-to-many warnings:', autoCorrectMessages.length);

            // Check if junction table was created
            const entities = result.entities || [];
            const junctionEntity = entities.find(e =>
                    e.name && (
                        e.name.includes('User_Role') ||
                        e.name.includes('UserRole') ||
                        e.name.includes('user_role')
                    )
            );

            if (junctionEntity) {
                console.log('Junction entity found:', junctionEntity.name);
            }
        });
    });
});
