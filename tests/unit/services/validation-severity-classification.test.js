const { ValidationService } = require('../../../src/backend/services/validation-service');
const { MermaidERDParser } = require('../../../src/backend/mermaid-parser');

describe('Enhanced Validation - Severity Classification & Individual Fixes', () => {
    let validationService;

    beforeAll(() => {
        validationService = new ValidationService({
            mermaidParser: new MermaidERDParser(),
            logger: console
        });
    });

    describe('Severity Classification', () => {
        test('should classify deployment-breaking issues as errors', async () => {
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
    
    %% Circular dependency entities - should be ERROR when circular
    A {
        string id PK
        string b_id FK
    }
    
    B {
        string id PK
        string a_id FK
    }
    
    %% Create circular relationships - should be ERROR
    A ||--o{ B : "refs"
    B ||--o{ A : "refs"
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            
            // Check for errors (non-fixable deployment blockers)
            const errors = result.warnings.filter(w => w.severity === 'error');
            expect(errors.length).toBeGreaterThan(0);
            
            // Circular dependency should be an error
            const circularErrors = errors.filter(w => w.type === 'circular_dependency');
            expect(circularErrors.length).toBeGreaterThan(0);
            expect(circularErrors[0].autoFixable).toBe(false);
            
            // All errors should be non-auto-fixable
            errors.forEach(error => {
                expect(error.autoFixable).toBe(false);
                expect(error.id).toBeDefined(); // Should have unique ID
            });
        });

        test('should classify auto-fixable issues as warnings', async () => {
            const erdContent = `
erDiagram
    %% Invalid entity name - should be WARNING (auto-fixable)
    user-profile {
        string name
        string product-name
        string CreatedOn
    }
    
    %% Missing PK - should be WARNING (auto-fixable)
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
    
    %% Missing FK - should be WARNING (auto-fixable)
    Customer ||--o{ Order : "places"
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            
            // Check for warnings (auto-fixable issues)
            const warnings = result.warnings.filter(w => w.severity === 'warning');
            expect(warnings.length).toBeGreaterThan(0);
            
            // All warnings should be auto-fixable
            warnings.forEach(warning => {
                expect(warning.autoFixable).toBe(true);
                expect(warning.id).toBeDefined(); // Should have unique ID
            });
            
            // Check specific warning types
            const namingWarnings = warnings.filter(w => w.category === 'naming');
            expect(namingWarnings.length).toBeGreaterThan(0);
            
            const relationshipWarnings = warnings.filter(w => w.type === 'missing_foreign_key');
            expect(relationshipWarnings.length).toBeGreaterThan(0);
        });
    });

    describe('Individual Fix Functionality', () => {
        test('should fix individual warning by ID', async () => {
            const erdContent = `
erDiagram
    user-profile {
        string id PK
        string name
    }
`;

            // First validate to get warnings
            const validationResult = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(validationResult.success).toBe(true);
            expect(validationResult.warnings.length).toBeGreaterThan(0);
            
            // Find a naming warning to fix
            const namingWarning = validationResult.warnings.find(w => 
                w.type === 'invalid_entity_name' && w.autoFixable
            );
            expect(namingWarning).toBeDefined();
            expect(namingWarning.id).toBeDefined();

            // Fix the individual warning
            const fixResult = await validationService.fixIndividualWarning({
                mermaidContent: erdContent,
                warningId: namingWarning.id
            });

            expect(fixResult.success).toBe(true);
            expect(fixResult.fixedContent).toBeDefined();
            expect(fixResult.appliedFix).toBeDefined();
            expect(fixResult.appliedFix.warningId).toBe(namingWarning.id);
            expect(fixResult.appliedFix.warningType).toBe(namingWarning.type);
            
            // Verify the warning is resolved in the fixed content
            const revalidationResult = await validationService.validateERD({
                mermaidContent: fixResult.fixedContent
            });
            
            const remainingWarnings = revalidationResult.warnings.filter(w => 
                w.type === namingWarning.type && w.entity === namingWarning.entity
            );
            expect(remainingWarnings.length).toBeLessThan(validationResult.warnings.filter(w => 
                w.type === namingWarning.type
            ).length);
        });

        test('should return error for non-existent warning ID', async () => {
            const erdContent = `
erDiagram
    User {
        string id PK
        string name
    }
`;

            const fixResult = await validationService.fixIndividualWarning({
                mermaidContent: erdContent,
                warningId: 'non-existent-warning-id'
            });

            expect(fixResult.success).toBe(false);
            expect(fixResult.message).toContain('not found');
        });

        test('should return error for non-fixable warning', async () => {
            const erdContent = `
erDiagram
    INVALID_Entity_Name {
        string id PK
        string name
    }
`;

            // First validate to get warnings
            const validationResult = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(validationResult.warnings.length).toBeGreaterThan(0);
            
            // Get the first warning and temporarily modify it to be non-auto-fixable
            const warningToTest = validationResult.warnings[0];
            
            // Mock the warning to be non-auto-fixable by temporarily overriding the service
            const originalValidateERD = validationService.validateERD;
            const mockValidateERD = jest.fn().mockResolvedValue({
                success: true,
                warnings: [{
                    ...warningToTest,
                    autoFixable: false  // Make it non-auto-fixable
                }],
                errors: []
            });
            validationService.validateERD = mockValidateERD;
            
            const fixResult = await validationService.fixIndividualWarning({
                mermaidContent: erdContent,
                warningId: warningToTest.id
            });

            expect(fixResult.success).toBe(false);
            expect(fixResult.message).toContain('not auto-fixable');
            
            // Restore original service
            validationService.validateERD = originalValidateERD;
        });
    });

    describe('Warning ID Generation', () => {
        test('should generate unique IDs for all warnings', async () => {
            const erdContent = `
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
`;

            const result = await validationService.validateERD({
                mermaidContent: erdContent
            });

            expect(result.success).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            
            // Check that all warnings have unique IDs
            const warningIds = result.warnings.map(w => w.id);
            const uniqueIds = [...new Set(warningIds)];
            expect(uniqueIds.length).toBe(warningIds.length);
            
            // Check ID format
            warningIds.forEach(id => {
                expect(id).toMatch(/^warning_\d+$/);
            });
        });
    });
});