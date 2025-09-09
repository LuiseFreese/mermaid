# Testing Guide

This document provides comprehensive testing strategies, tools, and workflows for the Mermaid to Dataverse Converter application.

## Testing Strategy

### 1. Integration Testing

**Test File**: `tests/test-schema-generation.js`

```bash
# Run integration tests
npm test

# Test with specific file
node tests/test-schema-generation.js examples/simple-sales.mmd

# Test with custom prefix
node tests/test-schema-generation.js examples/simple-sales.mmd myprefix
```

**What It Tests**:
- Mermaid file parsing
- Entity extraction and validation
- Relationship detection
- Dataverse naming conventions
- Primary key validation

### 2. API Testing

**Built-in Endpoints**:
```bash
# Health check
GET /health

# Solution status check (for deployment verification)
GET /api/solution-status?solution=YourSolutionName

# Publishers list
GET /api/publishers

# Global choices list  
GET /api/global-choices-list
```

### 3. Manual Testing Workflow

1. **React Frontend Testing**: Use the modern React interface with sample files
2. **Live Deployment**: Test actual Dataverse creation through the wizard
3. **Timeout Testing**: Test with complex files that trigger timeout polling
4. **Solution Verification**: Use `/api/solution-status` to verify deployment results
5. **Error Scenarios**: Test with invalid files, wrong credentials
6. **Browser Compatibility**: Test across different browsers (Chrome, Edge, Firefox)
7. **Responsive Design**: Test on desktop, tablet, and mobile viewports
8. **CDM Integration**: Test CDM entity detection and user choice functionality

## Testing and Debugging

### 1. Local Testing Workflow

```bash
# Test schema generation without deployment
node tests/test-schema-generation.js examples/simple-sales.mmd

# Test with custom publisher prefix
node tests/test-schema-generation.js examples/simple-sales.mmd myprefix

# Run full integration test suite
npm test
```

### 2. API Testing

```bash
# Health check
curl http://localhost:8080/health

# Detailed health check with component status
curl http://localhost:8080/api/health-detailed

# Test ERD validation endpoint
curl -X POST http://localhost:8080/api/validate-erd \
  -H "Content-Type: application/json" \
  -d '{"mermaidContent": "erDiagram\n    Customer { string name }"}'

# Test publishers endpoint
curl http://localhost:8080/api/publishers

# Test global choices list
curl http://localhost:8080/api/global-choices-list

# Test solution status
curl "http://localhost:8080/api/solution-status?solution=TestSolution"
```

### 3. Frontend Testing

**React Component Testing:**
- Use React Developer Tools browser extension
- Vite has built-in debugging support
- TypeScript provides compile-time error checking

**Browser Testing:**
- Access development server at http://localhost:3003 (frontend)
- Access full application at http://localhost:8080 (production mode)
- Use browser developer tools for debugging

### Deployment Testing

#### 1. Local Production Build Test

```bash
# Build everything for production
cd src/frontend && npm run build && cd ../..

# Start production server
npm start

# Test complete application
open http://localhost:8080
```

#### 2. Deploy to Azure (Development Environment)

```bash
# Create development infrastructure
.\scripts\setup-entra-app.ps1

# Deploy application code
.\scripts\deploy.ps1 -AppName "your-dev-app" -ResourceGroup "your-dev-rg" -KeyVaultName "your-dev-kv"
```

### Diagnostic Tools

#### 1. Application Health Monitoring

```bash
# Local health check
curl http://localhost:8080/health

# Azure health check
curl https://your-app-service.azurewebsites.net/health
```

## Comprehensive Testing Suite

This project includes a comprehensive testing suite to ensure code quality and prevent regressions. Run tests before making changes to verify everything works correctly.

### Test Structure

The project uses **Jest** as the primary testing framework with organized test suites:

```
tests/
├── unit/              # Component isolation tests
│   ├── services/      # Business logic testing
│   ├── controllers/   # Request/response handling
│   ├── middleware/    # CORS, security, validation
│   ├── clients/       # External API integration
│   └── parsers/       # ERD parsing logic
├── integration/       # API endpoint testing
├── e2e/              # Full workflow testing
└── fixtures/         # Test data and mocks
```

### Running Tests

**Quick test run:**
```bash
npm run test:quick        # Fast unit tests only
```

**Full test suite:**
```bash
npm test                  # All tests with coverage
npm run test:unit         # Unit tests with coverage
npm run test:integration  # API integration tests
npm run test:e2e         # End-to-end workflows
```

**Development workflow:**
```bash
npm run test:watch       # Auto-run tests on file changes
npm run test:coverage    # Generate coverage reports
```

### Test Coverage

The test suite includes 183 test cases covering:
- **Services**: ERD validation, Dataverse deployment, CDM detection
- **Controllers**: Request handling, error responses, parameter validation
- **Integration**: Complete API workflows using Supertest
- **E2E**: Full ERD-to-Dataverse deployment scenarios
- **Security**: Input validation, XSS protection, error recovery

### End-to-End (E2E) Testing

**New E2E test suite** provides browser automation testing using Jest + Puppeteer:

```bash
npm run test:e2e                              # Run all E2E tests
npm run test:e2e tests/e2e/basic-wizard.test.js  # Run specific test file
```

**E2E Test Coverage** (11 tests across 4 suites):
- **basic-connection.test.js**: Frontend server connectivity
- **basic-wizard.test.js**: Wizard navigation and accessibility
- **page-inspection.test.js**: UI structure and element detection  
- **wizard-workflow-simple.test.js**: Complete wizard workflow testing
  - File upload interface validation
  - Step navigation (steps 1-4)
  - UI component structure
  - Data-testid attributes for automation
  - FluentUI semantic structure

**E2E Infrastructure:**
- Cross-platform setup (Windows PowerShell compatible)
- Automatic backend/frontend server startup
- Dynamic port detection and management
- Screenshot capture for debugging
- Comprehensive cleanup and teardown

**Key Features Tested:**
- React wizard interface loading
- File upload functionality (`data-testid="upload-trigger"`)
- Step progression badges (`data-testid="step-1"` through `step-4`)
- Wizard container structure (`data-testid="wizard-container"`)
- FluentUI component rendering and accessibility

### Testing Tools

- **Jest**: Test framework and runner
- **Supertest**: HTTP API testing
- **Nock**: HTTP request mocking
- **Sinon**: Function stubbing and spying

### Writing Tests

When adding new features:
1. **Write unit tests** for new services or utilities
2. **Add integration tests** for new API endpoints
3. **Include error scenarios** and edge cases
4. **Use existing test fixtures** in `tests/fixtures/test-data.js`
5. **Follow naming convention**: `*.test.js`

Tests should be readable, focused, and test one behavior per test case. The existing test files provide good examples to follow.
