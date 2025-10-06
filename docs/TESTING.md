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

### 4. API Resilience Testing with Dev Proxy

**Microsoft Dev Proxy** is a command-line tool that simulates API failures, rate limiting, and slow responses to help you build more robust applications.

**Why Use Dev Proxy?**
- Test how your app handles Dataverse API failures without breaking production
- Simulate rate limiting scenarios (Dataverse has strict API limits)
- Test slow network conditions and timeout handling
- Mock Dataverse responses for offline development
- No code changes needed - intercepts network requests

**Installation**:
```powershell
# Install Dev Proxy using winget
winget install Microsoft.DevProxy

# Or download from GitHub
# https://github.com/microsoft/dev-proxy/releases
```

#### Quick Start Options

**Option 1: Automated npm Scripts (Recommended)**

The easiest way to use Dev Proxy - just run npm commands:

```powershell
# Option A: Run app with error simulation (50% failure rate)
npm run dev:proxy

# Option B: Run app with mock Dataverse (offline development)
npm run dev:mock

# Option C: Run app with rate limiting simulation
npm run dev:proxy:ratelimit

# Option D: Run app with slow API simulation
npm run dev:proxy:latency
```

These commands automatically:
- Start Dev Proxy with the right configuration
- Start yor dev server
- Clean up on exit (Ctrl+C stops both)

**Option 2: PowerShell Wrapper Script**

For more control and testing scenarios:

```powershell
# Interactive menu with 6 testing scenarios
.\devproxy\start-with-devproxy.ps1

# Or use directly with parameters:
.\devproxy\start-with-devproxy.ps1 -Mode errors -FailureRate 50
.\devproxy\start-with-devproxy.ps1 -Mode mocks
.\devproxy\start-with-devproxy.ps1 -Mode ratelimit
.\devproxy\start-with-devproxy.ps1 -Mode latency -Latency 5000
```

**Option 3: VS Code Tasks (One-Click Testing)**

Press `Ctrl+Shift+P` → "Tasks: Run Task" → Select:
- **Dev Proxy: Error Simulation** - Test API failures
- **Dev Proxy: Rate Limiting** - Test 429 responses
- **Dev Proxy: Mock Mode** - Offline development
- **Dev Proxy: Slow API** - Test latency handling

**Option 4: Manual (Advanced)**

Start Dev Proxy and your app separately:

```powershell
# Terminal 1: Start Dev Proxy
devproxy --config-file devproxy/devproxyrc.json

# Terminal 2: Start your app
npm run dev
```

#### Configuration Files

All Dev Proxy configs are in the `devproxy/` folder:

- **`devproxyrc.json`** - Main config with error simulation (default)
- **`devproxyrc-mocks.json`** - Mock mode for offline development
- **`devproxyrc-ratelimit.json`** - Rate limiting simulation
- **`devproxyrc-latency.json`** - Slow API responses
- **`dataverse-errors.json`** - Define error responses (503, 429, 500)
- **`dataverse-mocks.json`** - Mock Dataverse API responses
- **`README.md`** - Detailed usage guide

#### Common Testing Scenarios

**1. Test Deployment Failure Recovery**:
```powershell
# Using npm script (50% failure rate)
npm run dev:proxy

# Using PowerShell wrapper
.\devproxy\start-with-devproxy.ps1 -Mode errors -FailureRate 75

# Deploy a large ERD and verify:
# - Error messages are clear
# - Retry logic works
# - User data isn't lost
# - Progress is resumable
```

**2. Test Rate Limiting**:
```powershell
# Using npm script
npm run dev:proxy:ratelimit

# Deploy ERD with 50+ entities
# Verify app handles 429 responses gracefully
```

**3. Test Slow API Responses**:
```powershell
# Using npm script (5 second delay)
npm run dev:proxy:latency

# Verify:
# - Loading indicators stay visible
# - Timeout handling works
# - Users see progress indicators
```

**4. Test Authentication Token Expiration**:
```powershell
# Edit devproxy/dataverse-errors.json to add 401 responses
# Then run with errors mode
npm run dev:proxy
```

**5. Offline Development with Mocks**:
```powershell
# Using npm script
npm run dev:mock

# Using VS Code task
# Press Ctrl+Shift+P → "Dev Proxy: Mock Mode"


#### Integration with CI/CD

```yaml
# Add to GitHub Actions workflow
- name: Install Dev Proxy
  run: winget install Microsoft.DevProxy

- name: Test with API Error Simulation
  run: npm run dev:proxy &
  
- name: Run Tests
  run: npm test

- name: Cleanup
  run: taskkill /F /IM devproxy.exe /T
```

#### VS Code Integration

The project includes pre-configured VS Code tasks in `.vscode/tasks.json`:

**Available Tasks:**
1. **Dev Proxy: Error Simulation** - Random API failures
2. **Dev Proxy: Rate Limiting** - 429 Too Many Requests
3. **Dev Proxy: Mock Mode** - Offline development
4. **Dev Proxy: Slow API** - Network latency simulation

**Usage:**
- Press `Ctrl+Shift+B` to see all tasks
- Select a task to start Dev Proxy automatically
- Press `Ctrl+C` in terminal to stop

#### Expected Improvements

- **Robustness**: App handles API failures gracefully  
- **User Experience**: Better error messages and retry logic  
- **Development Speed**: Mock Dataverse for faster iteration  
- **Testing Coverage**: Test scenarios hard to reproduce manually  
- **Production Confidence**: Know your app works in edge cases  

#### Learn More

- [Dev Proxy Documentation](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/overview)
- [Testing with Random Errors](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/test-my-app-with-random-errors)
- [Simulating Rate Limits](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/simulate-rate-limit-api-responses)
- See `devproxy/README.md` for detailed configuration and advanced usage

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

#### Backend Authentication Testing

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

**Backend Authentication Test Coverage:**
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

#### Frontend MSAL Authentication UI Testing

The frontend includes comprehensive UI testing for Microsoft Authentication Library (MSAL) integration:

```bash
# Run all frontend auth tests
cd src/frontend && npm test -- tests/unit/auth/

# Run specific auth test suites
npm test -- tests/unit/auth/UserMenu.test.tsx
npm test -- tests/unit/auth/AuthProvider.test.tsx
npm test -- tests/unit/auth/authConfig.test.ts

# Run with coverage
npm test -- tests/unit/auth/ --coverage
```

**Test Organization:**
- `tests/unit/auth/UserMenu.test.tsx` - User menu UI component (23 tests)
- `tests/unit/auth/AuthProvider.test.tsx` - MSAL provider integration (23 tests)
- `tests/unit/auth/authConfig.test.ts` - Configuration validation (17 tests)
- `tests/utils/msalTestUtils.ts` - Shared test fixtures and helpers

**Frontend Authentication Test Coverage:**

**UserMenu Component (23 tests):**
- Avatar display with user initials
- Tooltip behavior on hover
- Menu dropdown interaction
- Sign out functionality
- Menu icon rendering
- Accessibility (ARIA labels, keyboard navigation)
- Edge cases (long names, special characters, account changes)

**AuthProvider Integration (23 tests):**
- MSAL provider initialization
- Authentication flow (authenticated/unauthenticated states)
- Account management (single, multiple, no accounts)
- Event handling (login success/failure)
- Component composition and nesting
- State management and transitions
- Custom loading/login components
- Error boundary integration

**authConfig Module (17 tests):**
- Configuration structure validation
- MSAL options (cache, cookies, navigation)
- Authority URL construction
- API scope configuration with client ID
- Logger configuration and PII filtering
- Configuration summary export

**Test Utilities (`msalTestUtils.ts`):**
- **Fixtures**: Pre-configured account objects (standard, no name, long name, admin)
- **Token Fixtures**: Valid, expired, and admin tokens
- **In-Progress States**: All MSAL interaction states
- **Helper Functions**:
  - `createMockMsalInstance()` - Complete MSAL instance mock
  - `createMsalContext()` - useMsal context with configurable state
  - `simulateLoginSuccess()` - Simulate authentication flow
  - `getInitials()` - Name-to-initials conversion

**Mock Strategy:**
- Inline mock instance definitions to avoid hoisting issues
- Behavior-focused testing (rendered output vs implementation details)
- Centralized fixtures for consistency across test suites
- Fluent UI integration with clean test output (benign warnings suppressed)

**Test Patterns:**
```typescript
// Using fixtures for consistent test data
mockUseMsal.mockReturnValue({
  instance: mockInstance,
  accounts: [FIXTURES.ACCOUNTS.STANDARD],
  inProgress: FIXTURES.IN_PROGRESS_STATES.none,
});

// Testing observable behavior
expect(screen.getByTestId('protected-content')).toBeInTheDocument();

// Using test utilities
const { useMsal } = await import('@azure/msal-react');
const context = createMsalContext([FIXTURES.ACCOUNTS.ADMIN], 'none');
```

**Test Environment Setup:**
Environment variables are configured in `src/test/setup.ts` for consistent test execution:
```typescript
process.env.VITE_AZURE_AD_CLIENT_ID = 'test-client-id';
process.env.VITE_AZURE_AD_TENANT_ID = 'test-tenant-id';
process.env.VITE_AZURE_AD_REDIRECT_URI = 'http://localhost:3000';
```

**Current Test Status:**
- UserMenu: 23/23 tests passing (100%)
- AuthProvider: 23/23 tests passing (100%)
- authConfig: 17/17 tests passing (100%)
- **Overall: 63/63 tests passing (100% pass rate)** ✅

**Note:** AuthGuard functionality is tested through AuthProvider tests since AuthGuard is an internal component. Direct AuthGuard tests are not needed as all its behavior is covered by the AuthProvider test suite.
5. **Frontend Integration**: Test MSAL browser authentication flow

### 5. Frontend MSAL Authentication UI Testing

**Frontend Authentication Testing:**

The application includes comprehensive frontend MSAL (Microsoft Authentication Library) UI testing for Azure AD integration:

```bash
# Run frontend MSAL tests
cd src/frontend && npm test -- tests/unit/auth

# Run all frontend tests including authentication
cd src/frontend && npm test
```

**MSAL Test Coverage (47 UI tests across 2 test suites):**

**Test Organization:**
```
src/frontend/tests/
├── utils/
│   └── msalTestUtils.ts           # Reusable fixtures and test helpers
└── unit/
    └── auth/
        ├── UserMenu.test.tsx      # User menu component UI (23 tests)
        └── AuthProvider.test.tsx  # Auth provider integration (24 tests)
```

**Test Utilities and Fixtures** (`tests/utils/msalTestUtils.ts`):
- **Mock Account Fixtures**: Standard user, no-name user, long-name user, admin accounts
- **Token Fixtures**: Valid tokens, expired tokens, admin tokens with roles
- **MSAL Context Factory**: `createMsalContext()` for consistent test setups
- **Helper Functions**: `setupMsalMock()`, `simulateLoginSuccess()`, `simulateLoginFailure()`
- **Authentication States**: none, startup, login, logout, ssoSilent, acquireToken, handleRedirect
- **Shared Utilities**: `getInitials()`, `waitForAuthRedirect()`

**UserMenu Component Tests** (23 tests):
- **Avatar Display** (5 tests):
  - Renders avatar with correct initials for standard users
  - Uses username when name is unavailable
  - Truncates long names to 2-character initials
  - Renders avatar with consistent sizing
  - Does not render when no account exists
  
- **Tooltip Behavior** (2 tests):
  - Displays tooltip with full display name on hover
  - Tooltip disappears on mouse leave
  
- **Menu Interaction** (4 tests):
  - Opens dropdown menu on button click
  - Displays user name as disabled menu item
  - Displays username as disabled menu item
  - Closes menu when clicking outside
  
- **Sign Out Functionality** (3 tests):
  - Calls `logoutRedirect` with correct parameters
  - Includes proper `postLogoutRedirectUri`
  - Renders Sign Out icon correctly
  
- **Menu Icons** (2 tests):
  - Displays `PersonCircleRegular` icon for display name
  - Displays `PersonRegular` icon for username
  
- **Accessibility** (3 tests):
  - Has proper ARIA label for avatar button
  - Menu is keyboard navigable
  - Menu items have proper disabled states
  
- **Edge Cases** (4 tests):
  - Handles admin accounts with roles
  - Handles single character names
  - Handles special characters in display names
  - Re-renders when account changes

**AuthProvider Component Tests** (24 tests):
- **Provider Initialization** (3 tests):
  - Wraps children with MsalProvider
  - Passes MSAL instance to provider
  - Renders children when `requireAuth=false`
  
- **Authentication Flow** (5 tests):
  - Renders children when authenticated with `requireAuth=true`
  - Triggers login redirect when unauthenticated
  - Shows loading state during authentication
  - Uses custom loading component when provided
  - Uses custom login component when provided
  
- **Account Management** (3 tests):
  - Sets active account when multiple accounts exist
  - Handles single account correctly
  - Does not set active account when no accounts exist
  
- **Event Handling** (4 tests):
  - Registers MSAL event callback on initialization
  - Sets active account on `LOGIN_SUCCESS` event
  - Handles `LOGIN_SUCCESS` event with admin accounts
  - Ignores events without payload
  
- **Composition and Nesting** (2 tests):
  - Renders deeply nested children
  - Preserves React context through provider
  
- **State Management** (2 tests):
  - Maintains component state across auth state changes
  - Handles transition from unauthenticated to authenticated
  
- **Edge Cases** (3 tests):
  - Handles rapid `requireAuth` prop changes
  - Handles empty children gracefully
  - Handles null children gracefully
  
- **Error Boundaries** (2 tests):
  - Handles initialization errors gracefully
  - Handles login redirect failures

**Testing Approach:**
- **Fixtures-Based**: Centralized mock accounts, tokens, and authentication states
- **Helper Functions**: Reusable setup utilities reduce test duplication
- **Modular Organization**: Clear describe blocks for each functional area
- **Comprehensive Mocking**: Full MSAL instance and context mocking
- **UI Focus**: Tests verify rendered UI elements, user interactions, and accessibility
- **Integration Testing**: AuthProvider tests verify full authentication flow with MSAL events

**Key Testing Patterns:**
- Centralized fixture management in `msalTestUtils.ts`
- Helper functions for common test setup (DRY principle)
- Comprehensive assertions on UI elements and interactions
- Accessibility validation (ARIA labels, keyboard navigation)
- Edge case coverage (special characters, null states, rapid changes)
- Event handling verification (MSAL callbacks)
- State transition testing (unauthenticated → authenticated)

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

**E2E test suite** provides browser automation testing using Jest + Puppeteer:

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

Comprehensive a11y coverage using axe-core automated testing

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
