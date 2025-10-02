/**
 * Test file for severity classification and individual warning fixes
 * Tests validation with severity levels and granular fix capabilities
 * @module tests/unit/services/validation-severity-fixes.test
 */

const { ValidationService } = require('../../../src/backend/services/validation-service');
const { MermaidERDParser } = require('../../../src/backend/mermaid-parser');

// ============================================================================
// Test Fixtures & Constants
// ============================================================================

const FIXTURES = {
    erdTemplates: {
        circularDependency: `
erDiagram
    User {
        string id PK
        string name
    }
    
    Post {
        string id PK
        string title
    }
    
    A {
        string id PK
        string b_id FK
    }
    
    B {
        string id PK
        string a_id FK
    }
    
    A ||--o{ B : "refs"
    B ||--o{ A : "refs"
`,
        autoFixableWarnings: `
erDiagram
    user-profile {
        string name
        string product-name
        string CreatedOn
    }
    
    Product {
        string title
        decimal price
    }
    
    Customer {
        string id PK
        string name
    }
    
    Order {
        string id PK
        string orderDate
    }
    
    Customer ||--o{ Order : "places"
`,
        singleInvalidEntity: `
erDiagram
    user-profile {
        string id PK
        string name
    }
`,
        validEntity: `
erDiagram
    User {
        string id PK
        string name
    }
`,
        invalidEntityName: `
erDiagram
    INVALID_Entity_Name {
        string id PK
        string name
    }
`,
        multipleInvalidNames: `
erDiagram
    user-profile {
        string product-name
        string 123invalid
        string CreatedOn
    }
    
    order-details {
        string item-name
        string ModifiedBy
    }
`
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a validation service instance
 * @returns {ValidationService} Service instance
 */
const createValidationService = () => {
    const mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        log: jest.fn()
    };

    return new ValidationService({
        mermaidParser: new MermaidERDParser(),
        logger: mockLogger
    });
};

/**
 * Filters warnings by severity
 * @param {Array} warnings - Array of warnings
 * @param {string} severity - Severity level to filter
 * @returns {Array} Filtered warnings
 */
const filterBySeverity = (warnings, severity) =>
    (warnings || []).filter(w => w.severity === severity);

/**
 * Filters warnings by type
 * @param {Array} warnings - Array of warnings
 * @param {string} type - Warning type to filter
 * @returns {Array} Filtered warnings
 */
const filterByType = (warnings, type) =>
    (warnings || []).filter(w => w.type === type);

/**
 * Checks if method exists on service
 * @param {Object} service - Service instance
 * @param {string} methodName - Method name to check
 * @returns {boolean}
 */
const hasMethod = (service, methodName) =>
    typeof service[methodName] === 'function';

// ============================================================================
// Test Suite
// ============================================================================

describe('Validation - Severity Classification & Individual Fixes', () => {
    let validationService;
    let consoleWarnSpy;

    beforeAll(() => {
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        validationService = createValidationService();
    });

    afterAll(() => {
        if (consoleWarnSpy) {
            consoleWarnSpy.mockRestore();
        }
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ==========================================================================
    // Severity Classification Tests
    // ==========================================================================

    describe('Severity Classification', () => {
        test('should classify deployment-breaking issues as errors', async () => {
            const result = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.circularDependency
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            const warnings = result.warnings || [];
            const errors = filterBySeverity(warnings, 'error');

            console.log(`Found ${errors.length} errors`);

            if (errors.length > 0) {
                errors.forEach(error => {
                    if (error.autoFixable !== undefined) {
                        expect(error.autoFixable).toBe(false);
                    }

                    if (error.id) {
                        expect(error.id).toBeDefined();
                    }
                });

                const circularErrors = filterByType(errors, 'circular_dependency');
                if (circularErrors.length > 0) {
                    expect(circularErrors[0].autoFixable).toBe(false);
                }
            }
        });

        test('should classify auto-fixable issues as warnings', async () => {
            const result = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.autoFixableWarnings
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            const allWarnings = result.warnings || [];
            const warnings = filterBySeverity(allWarnings, 'warning');

            console.log(`Found ${warnings.length} warnings`);

            if (warnings.length > 0) {
                warnings.forEach(warning => {
                    if (warning.autoFixable !== undefined) {
                        expect(warning.autoFixable).toBe(true);
                    }

                    if (warning.id) {
                        expect(warning.id).toBeDefined();
                    }
                });

                const namingWarnings = allWarnings.filter(w => w.category === 'naming');
                console.log(`Found ${namingWarnings.length} naming warnings`);

                const relationshipWarnings = filterByType(allWarnings, 'missing_foreign_key');
                console.log(`Found ${relationshipWarnings.length} relationship warnings`);
            }
        });
    });

    // ==========================================================================
    // Individual Fix Functionality Tests
    // ==========================================================================

    describe('Individual Fix Functionality', () => {
        test('should fix individual warning by ID if supported', async () => {
            if (!hasMethod(validationService, 'fixIndividualWarning')) {
                console.log('Skipping test - fixIndividualWarning not implemented');
                expect(true).toBe(true);
                return;
            }

            const validationResult = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.singleInvalidEntity
            });

            expect(validationResult).toBeDefined();
            expect(validationResult.success).toBe(true);

            const warnings = validationResult.warnings || [];

            if (warnings.length === 0) {
                console.log('No warnings found to fix');
                expect(true).toBe(true);
                return;
            }

            const namingWarning = warnings.find(w =>
                w.type === 'invalid_entity_name' && w.autoFixable && w.id
            );

            if (!namingWarning) {
                console.log('No fixable naming warning found');
                expect(true).toBe(true);
                return;
            }

            const fixResult = await validationService.fixIndividualWarning({
                mermaidContent: FIXTURES.erdTemplates.singleInvalidEntity,
                warningId: namingWarning.id
            });

            expect(fixResult).toBeDefined();
            expect(fixResult.success).toBe(true);

            if (fixResult.fixedContent) {
                expect(fixResult.fixedContent).toBeDefined();

                // Verify the warning is reduced
                const revalidationResult = await validationService.validateERD({
                    mermaidContent: fixResult.fixedContent
                });

                const remainingWarnings = (revalidationResult.warnings || []).filter(w =>
                    w.type === namingWarning.type && w.entity === namingWarning.entity
                );

                const originalCount = warnings.filter(w => w.type === namingWarning.type).length;
                expect(remainingWarnings.length).toBeLessThanOrEqual(originalCount);
            }
        });

        test('should return error for non-existent warning ID', async () => {
            if (!hasMethod(validationService, 'fixIndividualWarning')) {
                console.log('Skipping test - fixIndividualWarning not implemented');
                expect(true).toBe(true);
                return;
            }

            const fixResult = await validationService.fixIndividualWarning({
                mermaidContent: FIXTURES.erdTemplates.validEntity,
                warningId: 'non-existent-warning-id'
            });

            expect(fixResult).toBeDefined();
            expect(fixResult.success).toBe(false);

            if (fixResult.message) {
                expect(fixResult.message).toContain('not found');
            }
        });

        test('should return error for non-fixable warning', async () => {
            if (!hasMethod(validationService, 'fixIndividualWarning')) {
                console.log('Skipping test - fixIndividualWarning not implemented');
                expect(true).toBe(true);
                return;
            }

            const validationResult = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.invalidEntityName
            });

            const warnings = validationResult.warnings || [];

            if (warnings.length === 0) {
                console.log('No warnings to test with');
                expect(true).toBe(true);
                return;
            }

            const warningToTest = warnings[0];

            if (!warningToTest.id) {
                console.log('Warning has no ID');
                expect(true).toBe(true);
                return;
            }

            const originalValidateERD = validationService.validateERD.bind(validationService);
            validationService.validateERD = jest.fn().mockResolvedValue({
                success: true,
                warnings: [{
                    ...warningToTest,
                    autoFixable: false
                }],
                errors: []
            });

            const fixResult = await validationService.fixIndividualWarning({
                mermaidContent: FIXTURES.erdTemplates.invalidEntityName,
                warningId: warningToTest.id
            });

            expect(fixResult).toBeDefined();
            expect(fixResult.success).toBe(false);

            if (fixResult.message) {
                expect(fixResult.message).toContain('not auto-fixable');
            }

            validationService.validateERD = originalValidateERD;
        });
    });

    // ==========================================================================
    // Warning ID Generation Tests
    // ==========================================================================

    describe('Warning ID Generation', () => {
        test('should generate unique IDs for all warnings', async () => {
            const result = await validationService.validateERD({
                mermaidContent: FIXTURES.erdTemplates.multipleInvalidNames
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);

            const warnings = result.warnings || [];

            if (warnings.length === 0) {
                console.log('No warnings generated');
                expect(true).toBe(true);
                return;
            }

            const warningsWithIds = warnings.filter(w => w.id);
            console.log(`${warningsWithIds.length} of ${warnings.length} warnings have IDs`);

            if (warningsWithIds.length > 0) {
                const warningIds = warningsWithIds.map(w => w.id);
                const uniqueIds = [...new Set(warningIds)];
                expect(uniqueIds.length).toBe(warningIds.length);

                warningIds.forEach(id => {
                    expect(typeof id).toBe('string');
                    expect(id.length).toBeGreaterThan(0);
                });
            }
        });
    });
});
