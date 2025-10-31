# Mermaid to Dataverse Converter - AI Agent Instructions

## Project Overview
A React 18 + Node.js application that converts Mermaid ERD diagrams into Microsoft Dataverse entities, deployed on Azure App Service with managed identity authentication. The frontend is built with Fluent UI v9 and Vite; backend uses a custom HTTP server with clean architecture (controllers → services → repositories).

## Architecture Essentials

### Tech Stack
- **Frontend**: React 18 + TypeScript + Fluent UI v9 + Vite (port 3003 in dev)
- **Backend**: Node.js 20 with custom HTTP server (port 8080)
- **Deployment**: Azure App Service with User-Assigned Managed Identity
- **Security**: Federated credentials (zero secrets), managed identity for Dataverse

### Core Service Layers
```
Controllers (HTTP) → Services (Business Logic) → Repositories (Data Access)
```

**Key Files:**
- `src/backend/server.js` - Dependency injection container, routes to controllers
- `src/backend/controllers/` - HTTP request/response handling
- `src/backend/services/` - Business logic (ValidationService, DeploymentService)
- `src/backend/repositories/` - Dataverse API abstraction
- `src/backend/mermaid-parser.js` - ERD parsing with CommonJS module pattern
- `src/backend/environment-manager.js` - Multi-environment routing from `data/environments.json`

### Frontend Modular Architecture
All wizard steps are fully modularized:
- `src/frontend/src/components/wizard/steps/file-upload/` - FileUploadStep with hooks/, components/, types/
- `src/frontend/src/context/WizardContext.tsx` - Global wizard state using React Context
- Modular pattern: Separate hooks, components, types, and utilities for each step

## Critical Development Workflows

### Two-Script Deployment Process

```
Step 1: Configure (before first setup)
  Edit data/environments.json
    └─ Add all Dataverse environments (dev/test/prod)
    └─ REQUIRED - setup script will fail without this file

Step 2: Setup (once per environment suffix)
  .\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended
    ├─ Validates data/environments.json exists
    ├─ Creates App Registration with FIC
    ├─ Creates Managed Identity
    ├─ Deploys Azure infrastructure
    └─ Creates Application Users in ALL environments

Step 3: Deploy (every code update)
  .\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
    ├─ Builds frontend (npm run build)
    ├─ Packages backend + data/environments.json
    └─ Deploys to Azure App Service
```

### Local Development (Zero Config)
```powershell
npm install          # Installs both root and src/frontend dependencies
npm run dev          # Starts both frontend (3003) and backend (8080)
```
- **Authentication disabled by default** (`AUTH_ENABLED=false` in dev)
- Frontend Vite dev server proxies `/api/*` → `http://localhost:8080`
- Backend uses `.env.local` first (overrides shell vars), then `.env`
- No Azure/Dataverse needed unless testing real API calls

### Testing Strategy
```powershell
npm test             # Runs all tests (unit + integration)
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests with coverage
npm run test:frontend     # Frontend tests (cd into src/frontend)
npm run test:coverage     # Full coverage report

# Dev Proxy Testing (API failure simulation)
npm run dev:proxy:errors      # Random API failures
npm run dev:proxy:mocks       # Offline development with mocks
npm run dev:proxy:rate-limit  # Rate limiting simulation

# Infrastructure Testing (post-deployment validation)
.\scripts\smoke-test.ps1                              # Run smoke tests (6 suites)
Invoke-Pester tests/infrastructure/*.tests.ps1       # Run Pester infrastructure tests
```
**Important**: Test files use Jest + Vitest. Frontend uses Vitest with React Testing Library.

### Deployment (Two-Step Process)
```powershell
# Step 1: Configure environments FIRST (required)
Copy-Item data/environments.example.json data/environments.json
# Edit data/environments.json with your Dataverse URLs and IDs

# Step 2: Infrastructure + identity setup + multi-environment app users
.\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended

# Step 3: Deploy application code (includes automatic smoke tests)
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"
```
- **Configuration required first**: `data/environments.json` must exist before running setup
- Setup creates: App Registration, Managed Identity, Dataverse Application User(s), Federated Credentials
- **Multi-environment**: Setup automatically reads `data/environments.json` and creates app users in ALL configured environments
- Deploy packages: Frontend build + backend files + `data/environments.json` (for multi-env routing)
- **Post-deployment validation**: Smoke tests run automatically after deployment
- Always run frontend build locally before deploy: `cd src/frontend && npm run build`

## Project-Specific Patterns

### 1. Multi-Environment Support
- **Config**: `data/environments.json` contains all environments (dev/test/prod)
- **User Flow**: Environment dropdown in Solution Setup step → backend routes to selected environment
- **Authentication**: Single managed identity with application users in each environment
- **Deployment History**: Environment-specific JSON files in `logs/deployments/<environment-id>/`
- **Key File**: `src/backend/environment-manager.js` loads and manages environments
- **Setup Process**: `setup-secretless.ps1` **automatically** creates application users in **all** environments listed in `data/environments.json`
  - Script detects `data/environments.json` and creates app users for every environment
  - No separate post-setup step needed
  - Script: `scripts/add-app-user-to-all-envs.ps1` exists only for manual fixes or adding new environments later

### 2. CDM (Common Data Model) Integration
- **Auto-detection**: ValidationService compares entity names against CDM registry
- **User Choice**: Frontend displays CDM matches, user chooses "CDM entities" or "Custom entities"
- **Impact**: CDM entities use standard names (e.g., `contact`, `account`), custom get prefix (e.g., `myprefix_customer`)
- **Key File**: `src/backend/cdm/cdm-entity-registry.js`

### 3. ERD Validation & Auto-Fix
- **Validation**: 40+ rules detect issues (missing PKs, invalid names, relationship problems)
- **Auto-Fix**: One-click corrections for most issues (see `docs/VALIDATION-AND-AUTOFIX.md`)
- **Flow**: Upload ERD → Validate → Show issues → Apply fixes → Re-validate
- **Key File**: `src/backend/services/validation-service.js` (2797 lines)

### 4. Dependency Injection Pattern
The backend uses manual DI in `server.js`:
```javascript
// Initialize layers: Repositories → Services → Controllers
const dataverseRepo = new DataverseRepository(...);
const validationService = new ValidationService({ mermaidParser, dataverseRepo });
const validationController = new ValidationController({ validationService });
```
**When modifying**: Always check constructor dependencies and update DI container.

### 5. Managed Identity Authentication
Three auth modes (priority order):
1. **Managed Identity** (Azure production) - `USE_MANAGED_IDENTITY=true` - **SECRETLESS!**
2. **Client Secret** (local dev only) - `USE_CLIENT_SECRET=true` with `.env.local`
3. **Environment variables** (fallback) - `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`

**Key File**: `src/backend/clients/dataverse-client.js` handles all auth modes

**Important**: The setup script creates a client secret for the backend App Registration, but this is **ONLY for local development**. In Azure production, the app uses Federated Identity Credentials (completely secretless). The secret is stored in `.env.local` (gitignored) and never deployed to Azure.

**Authentication Chain for Multi-Environment**:
```
Azure App Service (with Managed Identity)
    ↓ uses
User-Assigned Managed Identity (mi-mermaid-*)
    ↓ connected via Federated Identity Credential (FIC) - NO SECRETS!
App Registration (mermaid-dataverse-*)
    ↓ represented as Application Users in
Dataverse Environments (dev/test/prod - ALL configured environments)
```

The Federated Identity Credential is the bridge that allows the Managed Identity to authenticate as the App Registration, which then has Application Users in all Dataverse environments.

### 6. Deployment History & Rollback
- **Storage**: JSON files per environment in `logs/deployments/<env-id>/history.json`
- **Tracking**: Every deployment creates entry with solution ID, entities, relationships, timestamps
- **Rollback**: Modular deletion - user selects what to remove (relationships, entities, solution, publisher)
- **Key File**: `src/backend/services/deployment-history-service.js`

### 7. Frontend Context Pattern
Global state via React Context:
- **WizardContext**: Wizard step state, ERD content, validation results
- **DeploymentContext**: Deployment progress, history, rollback state
- **ThemeContext**: Dark/light/pink/neon themes

**Pattern**: `const { erdContent, setErdContent } = useWizardContext();`

## Common Pitfalls & Solutions

### Environment Variables
- **Issue**: Shell environment variables override `.env` files
- **Solution**: Code uses `override: true` in dotenv config to prioritize `.env.local`
- **Check**: Look for `.env.local` first, then `.env` in `src/backend/server.js`

### Vite Proxy in Development
- **Issue**: API calls fail in frontend dev mode
- **Solution**: Vite config proxies `/api/*` and `/upload` to backend (port 8080)
- **Config**: `src/frontend/vite.config.ts`

### CommonJS vs ES Modules
- **Backend**: Uses CommonJS (`require`, `module.exports`)
- **Frontend**: Uses ES Modules (`import`, `export`)
- **Mermaid Parser**: CommonJS module compatible with Node.js server

### Windows-Specific Commands
- **Always use PowerShell** (not bash) - see `.github/instructions/generall.instructions.md`
- **Scripts**: All deployment scripts are `.ps1` (PowerShell)
- **Dev Proxy**: Uses `pwsh` command in npm scripts

### Test Coverage
- **Frontend**: 100% coverage target for modular components and hooks
- **Backend**: Unit tests for services, integration tests for API endpoints
- **Pattern**: Separate `tests/unit/` and `tests/integration/` directories

### 8. Infrastructure Testing & Monitoring
- **Smoke Tests**: Post-deployment validation with 6 test suites in `scripts/smoke-test.ps1`
  - Health endpoint, Environments API, Publishers, Solutions, Global Choices, Frontend
  - Auto-detects Azure deployments, uses public monitoring endpoints
  - Integrated into `deploy-secretless.ps1` (runs automatically after deployment)
- **Health Service**: Runtime monitoring in `src/backend/services/health-check-service.js`
  - Methods: `checkHealth()`, `checkDependencies(environmentId)`, `checkAllEnvironments()`
  - Monitors: Environment config, Dataverse connectivity, managed identity, latency
- **Pester Tests**: Infrastructure validation in `tests/infrastructure/validate-deployment.tests.ps1`
  - Azure resource validation, performance benchmarks (<5s health, <10s APIs)
- **Easy Auth v2**: Monitoring endpoints (/health, /api/environments) configured as public
  - Application endpoints remain protected
  - Upgrade: `az webapp auth config-version upgrade`
  - Configure: `az webapp auth update --excluded-paths "/health /api/environments"`

## Key Documentation
- `docs/DEVELOPER_ARCHITECTURE.md` - Complete architecture diagrams and layer details
- `docs/LOCAL-DEVELOPMENT.md` - Zero-config dev setup
- `docs/AZURE-MULTI-ENVIRONMENT.md` - Multi-environment deployment guide
- `docs/VALIDATION-AND-AUTOFIX.md` - All 40+ validation rules and auto-fixes
- `docs/TESTING.md` - Testing strategy and Dev Proxy integration
- `docs/DEV-PROXY-TESTING.md` - API failure simulation setup
- `docs/INFRASTRUCTURE-TESTING.md` - Post-deployment validation and health monitoring

## Quick Reference

### Adding a New Entity Validation Rule
1. Add rule to `ValidationService.validateERD()` in `src/backend/services/validation-service.js`
2. Add auto-fix logic to `ValidationService.generateAutoFixes()`
3. Update `docs/VALIDATION-AND-AUTOFIX.md` with new rule
4. Add test case to `tests/integration/` or `tests/unit/`

### Adding a New Wizard Step
1. Create modular directory: `src/frontend/src/components/wizard/steps/new-step/`
2. Structure: `hooks/`, `components/`, `types/`, `index.tsx`
3. Add step to wizard flow in `App.tsx`
4. Update `WizardContext` with new step state

### Multi-Environment Setup
1. Configure environments in `data/environments.json` **before running setup**
   ```json
   {
     "version": "1.0.0",
     "defaultEnvironmentId": "dev-guid",
     "environments": [
       {
         "id": "dev-guid",
         "name": "dev-princess",
         "url": "https://orgdev.crm4.dynamics.com",
         "powerPlatformEnvironmentId": "dev-guid",
         "color": "blue"
       }
     ]
   }
   ```
2. Run `.\scripts\setup-secretless.ps1 -EnvironmentSuffix "prod" -Unattended` - automatically detects and configures all environments
3. Deploy with `.\scripts\deploy-secretless.ps1 -EnvironmentSuffix "prod"`
4. Users select environment from dropdown in UI

**Important**: The setup script **automatically** reads `data/environments.json` and creates application users in **all** configured environments during the infrastructure setup. No separate step needed!

**Adding environments later**: If you add environments to `data/environments.json` after initial setup, run `.\scripts\add-app-user-to-all-envs.ps1 -AppRegistrationClientId <id>` to add app users to new environments.

### Dev Proxy for API Testing
```powershell
# Install once
winget install Microsoft.DevProxy

# Run with error simulation
npm run dev:proxy:errors

# Stop Dev Proxy
npm run proxy:stop
```

## Build Commands
```powershell
# Frontend build (required before deploy)
cd src/frontend && npm run build

# Full deployment package
npm run build  # Alias for build:frontend

# Install all dependencies
npm run install:all  # Root + frontend
```
