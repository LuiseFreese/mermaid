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

**Frontend Unit Tests:**
```bash
# Run frontend unit tests (Vitest with TypeScript)
cd src/frontend && npm test

# Run specific test suite
npm test -- tests/unit/solution-setup/

# Run with coverage
npm test -- --coverage
```

**Note**: Frontend tests use Vitest and TypeScript (`.test.ts` files), while backend tests use Jest and JavaScript (`.test.js` files). This separation ensures optimal tooling and prevents configuration conflicts.

### 4. Authentication Testing

**Azure AD Authentication Testing:**

The application includes comprehensive authentication testing for JWT token validation and Azure AD integration:

```bash
# Run auth middleware tests specifically
npm test -- tests/unit/middleware/auth-middleware.test.js

# Test authentication with bypass mode (local development)
AUTH_ENABLED=false npm start

# Test with real Azure AD tokens (requires configuration)
# Set environment variables:
# AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AUTH_ENABLED=true
npm start
```

**Authentication Test Coverage:**
- **Token Validation**: JWT signature verification, expiration checking, malformed token handling
- **Bypass Mode**: Local development without authentication (`AUTH_ENABLED=false`)
- **Configuration**: Azure AD tenant/client ID validation and error handling
- **Authorization Headers**: Bearer token format validation and extraction
- **User Identity**: Email, preferred_username, upn field resolution
- **Optional Auth**: Graceful degradation when authentication fails
- **Error Scenarios**: Token expiration, invalid signatures, missing config
- **Role-Based Authorization (Future)**: Middleware tested and ready for when roles are needed

**Manual Authentication Testing:**
1. **Local Development**: Start server with `AUTH_ENABLED=false` to bypass auth
2. **Azure AD Integration**: Configure Azure AD app registration and test with real tokens
3. **Protected Endpoints**: Verify middleware blocks unauthenticated requests
4. **Token Expiration**: Wait for token expiry and verify proper error handling
5. **Frontend Integration**: Test MSAL browser authentication flow

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
# Set up complete infrastructure and authentication
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "dev"

# Deploy application code
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "dev"
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

The project uses **Jest** for backend testing and **Vitest** for frontend testing as separate, isolated testing frameworks:

```
tests/
├── unit/              # Backend component isolation tests (Jest)
│   ├── services/      # Business logic testing
│   ├── controllers/   # Request/response handling
│   ├── middleware/    # CORS, security, validation, authentication, logging
│   │   ├── auth-middleware.test.js           # Azure AD JWT authentication (43 tests)
│   │   ├── security-middleware.test.js       # Security headers (39 tests)
│   │   └── request-logger-middleware.test.js # Request/response logging (51 tests)
│   ├── clients/       # External API integration
│   └── parsers/       # ERD parsing logic
├── integration/       # API endpoint testing (Jest)
├── e2e/              # Full workflow testing (Jest + Puppeteer)
└── fixtures/         # Test data and mocks

src/frontend/tests/
├── unit/              # Frontend component tests (Vitest)
│   ├── solution-setup/  # Wizard step components and hooks
│   └── deployment/      # Deployment utility tests
├── accessibility/     # Accessibility tests (Vitest)
└── __tests__/         # General component tests
```

### Testing Framework Configuration

**Backend Tests (Jest)**:
- **Configuration**: `jest.config.json`
- **Test Pattern**: `**/tests/**/*.test.js` (JavaScript only)
- **Environment**: Node.js
- **Test Files**: 66 unit test files with 626 tests
- **Coverage**: Backend services, controllers, middleware (auth, security, logging), and utilities

**Frontend Tests (Vitest)**:
- **Configuration**: `src/frontend/vitest.config.ts`
- **Test Pattern**: `src/frontend/tests/**/*.test.ts` (TypeScript)
- **Environment**: jsdom (browser simulation)
- **Framework**: Vitest with React Testing Library
- **Run Command**: `cd src/frontend && npm test`

**Separation Strategy**:
- Jest handles all `.test.js` files in the `tests/` directory
- Vitest handles all `.test.ts` files in the `src/frontend/tests/` directory
- This separation prevents configuration conflicts and allows optimal tooling for each environment

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

The test suite includes comprehensive coverage across all application layers:

#### Unit Tests
- **Location**: `tests/unit/`
- **Framework**: Jest with Node.js environment
- **File Pattern**: `*.test.js` (JavaScript only)
- **Coverage**: Services, controllers, middleware (auth, security, logging), utilities
- **Mock Strategy**: Automated mocking of external dependencies
- **Test Count**: 626 tests across 66 test files


#### Integration Tests  
- **Location**: `tests/integration/`
- **Framework**: Jest + Supertest for HTTP testing
- **Coverage**: Complete API request-response cycles
- **Configuration**: Coverage disabled due to mock conflicts (tests run faster)
- **Setup**: Mocked Dataverse client and Azure services

#### End-to-End Tests
- **Location**: `tests/e2e/`
- **Framework**: Jest + Puppeteer + jest-environment-puppeteer  
- **Coverage**: Browser automation and full workflow testing
- **Configuration**: Separate Jest config (`jest.e2e.config.json`)
- **Setup**: Automatic server startup/shutdown with dynamic ports

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

### Accessibility Testing

**Comprehensive a11y coverage** using axe-core automated testing with **8 test cases** across **5 test suites**:

```bash
# Run all accessibility tests
npm run test:e2e tests/e2e/accessibility.test.js

# Run specific accessibility test categories
npm run test:e2e -- --testNamePattern="WCAG Compliance"
npm run test:e2e -- --testNamePattern="Keyboard Navigation"
npm run test:e2e -- --testNamePattern="Screen Reader Support"
```

#### Accessibility Test Suites

**1. WCAG Compliance Testing**
- **Automated violation detection** using `@axe-core/puppeteer`
- **Critical/serious violation prevention** (fails tests on high-impact issues)
- **Comprehensive rule coverage** across WCAG 2.1 AA standards
- **Detailed logging** of violations with impact levels and affected elements

**2. ARIA and Interactive Elements**
- **ARIA label validation** for all interactive components
- **Accessible name verification** for buttons, inputs, and controls
- **FluentUI component accessibility** compliance checking
- **Form control labeling** and association validation

**3. Keyboard Navigation Support**
- **Tab order testing** through the wizard interface
- **Focus management** across step progression
- **Keyboard-only operation** verification
- **Interactive element accessibility** via keyboard

**4. Visual Focus Indicators**
- **Focus ring visibility** validation
- **FluentUI focus styling** compliance
- **Custom focus indicator** detection (outline, box-shadow, border)
- **Focus state accessibility** across different UI states

**5. Screen Reader Compatibility**
- **Heading structure validation** (proper h1-h6 hierarchy)
- **Landmark region testing** (main, header, navigation)
- **FluentUI Title component** integration
- **Page title descriptiveness** for context understanding

**6. Form Accessibility Standards**
- **Input labeling** via `<label>` elements and `aria-label`
- **Form control identification** with proper ID/name attributes
- **Required field indication** accessibility
- **File input accessibility** for upload functionality

**7. Color and Contrast Compliance**
- **WCAG AA contrast ratio** automated testing
- **Color-contrast rule** specific validation
- **Visual accessibility** for users with color vision differences
- **Text readability** across different backgrounds

#### Accessibility Testing Framework

**Technical Implementation:**
- **Framework**: Jest + Puppeteer + @axe-core/puppeteer
- **Standards**: WCAG 2.1 AA compliance
- **Environment**: Browser automation with real DOM testing
- **Coverage**: Wizard interface, file upload, step navigation

**Test Data and Validation:**
- **Real user interaction** simulation
- **Multiple device viewport** testing capability
- **Cross-browser accessibility** validation
- **Progressive enhancement** verification

**Accessibility Standards Enforced:**
- WCAG 2.1 AA compliance checking
- Keyboard-only navigation support
- Screen reader compatibility (NVDA, JAWS, VoiceOver)
- Focus management and visual indicators
- Semantic HTML structure validation
- Color contrast ratio verification (4.5:1 for normal text)
- Alternative text for images and media
- Form labeling and error identification
