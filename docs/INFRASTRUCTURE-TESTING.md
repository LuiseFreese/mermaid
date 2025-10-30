---
sidebar_position: 8
title: Infrastructure Testing
description: Post-deployment validation, health monitoring, and infrastructure resilience testing for Azure deployments
---

# Infrastructure Testing Guide

This guide covers the infrastructure resilience testing strategy implemented after the Azure Front Door DNS outage on January 14, 2025.

## Overview

Infrastructure testing ensures that the application and its dependencies are correctly configured, running, and healthy after deployment to Azure.

## Testing Layers

### 1. Smoke Tests (Post-Deployment Validation)

**Purpose**: Quick validation that critical application endpoints are functional after deployment.

**Script**: `scripts/smoke-test.ps1`

**Prerequisites**: Azure App Service must have Easy Auth v2 configured with excluded paths for monitoring endpoints:
```powershell
# Upgrade to Easy Auth v2 (if needed)
az webapp auth config-version upgrade --name app-mermaid-prod --resource-group rg-mermaid-prod

# Configure monitoring endpoints as public
az webapp auth update --name app-mermaid-prod --resource-group rg-mermaid-prod `
    --unauthenticated-client-action AllowAnonymous `
    --excluded-paths "/health /api/environments"
```

**Usage**:
```powershell
# Test deployed application (auto-attempts authentication, falls back to public endpoints)
.\scripts\smoke-test.ps1 -AppUrl "https://app-mermaid-prod.azurewebsites.net"

# Test local development (runs all tests without authentication)
.\scripts\smoke-test.ps1 -AppUrl "http://localhost:8080"

# With custom timeout
.\scripts\smoke-test.ps1 -AppUrl "http://localhost:8080" -TimeoutSeconds 60
```

**Security Note**: Monitoring endpoints (`/health`, `/api/environments`) are configured as publicly accessible following industry best practices for infrastructure health checks. All application functionality endpoints remain protected by Easy Auth.

**Test Coverage**:
- Health endpoint (`/health`) - Public for monitoring
- Environments API (`/api/environments`) - Public for monitoring
- Dataverse integration: - **Requires authentication** (uses public environment list)
  - Publishers API (`/api/publishers`)
  - Solutions API (`/api/solutions`)
  - Global Choices API (`/api/global-choices-list`)
- Frontend asset serving (`/`)
- Frontend asset serving (`/`)

**Exit Codes**:
- `0` = All tests passed
- `1` = One or more tests failed

**Integration**: Automatically runs after deployment via `deploy-secretless.ps1`

---

### 2. Infrastructure Validation Tests (Pester)

**Purpose**: Comprehensive validation of Azure infrastructure configuration and health.

**Script**: `tests/infrastructure/validate-deployment.tests.ps1`

**Prerequisites**:
```powershell
# Install Pester module
Install-Module -Name Pester -Force -SkipPublisherCheck
```

**Usage**:
```powershell
# Run with auto-detected environment
Invoke-Pester -Path .\tests\infrastructure\validate-deployment.tests.ps1

# Run with custom parameters
$env:APP_NAME = "app-mermaid-prod"
$env:RESOURCE_GROUP = "rg-mermaid-prod"
$env:LOCATION = "westeurope"
Invoke-Pester -Path .\tests\infrastructure\validate-deployment.tests.ps1
```

**Test Coverage**:

#### Azure Infrastructure
- Resource group existence and state
- Resource group location
- App Service existence and state
- App Service runtime (Linux, Node 20)
- HTTPS-only configuration

#### Identity & Security
- User-Assigned Managed Identity assignment
- Managed Identity client ID configuration
- Required environment variables
- `USE_MANAGED_IDENTITY=true` validation

#### Application Health
- Health endpoint availability (200 OK)
- Health status response
- Version information presence

#### Multi-Environment Support
- Environments API accessibility
- At least one environment configured
- Default environment set

#### Performance
- Health endpoint response time (&lt;5 seconds)
- Environments API response time (&lt;10 seconds)

**Integration**: Automatically runs after deployment if Pester is installed

---

### 3. Health Dependencies Monitoring

**Purpose**: Runtime monitoring of application dependencies with detailed health status.

**Service**: `src/backend/services/health-check-service.js`

**Methods**:

#### `checkHealth()`
Returns overall application health:
```javascript
{
  status: "healthy" | "unhealthy",
  timestamp: "2025-01-14T12:00:00.000Z",
  uptime: 3600,  // seconds
  version: "2.0.0"
}
```

#### `checkDependencies(environmentId)`
Returns detailed dependency status for specific environment:
```javascript
{
  status: "healthy" | "unhealthy",
  checks: {
    environmentConfiguration: {
      status: "healthy" | "unhealthy",
      message: "Environment configuration loaded successfully",
      latency: 5  // milliseconds
    },
    dataverseConnectivity: {
      status: "healthy" | "unhealthy",
      message: "Successfully connected to Dataverse",
      latency: 250,  // milliseconds
      error: null  // or error details
    },
    managedIdentity: {
      status: "healthy" | "unhealthy",
      message: "Managed identity authenticated successfully",
      latency: 150
    }
  }
}
```

#### `checkAllEnvironments()`
Returns health status across all configured environments.

**API Endpoint** (planned):
```
GET /api/health/dependencies?environmentId=<environment-id>
```

**Error Suggestions**: The service provides actionable suggestions for common failure scenarios:
- Missing environment configuration
- Invalid environment ID
- Token acquisition failures
- Dataverse connection issues
- Managed identity configuration problems

---

## Automated Testing Workflow

### Local Development
```powershell
# Start app
npm run dev

# Wait for startup
Start-Sleep -Seconds 5

# Run smoke tests
.\scripts\smoke-test.ps1 -AppUrl "http://localhost:8080"
```

### CI/CD Pipeline (Recommended)
```yaml
# Example GitHub Actions workflow
- name: Deploy to Azure
  run: .\scripts\deploy-secretless.ps1 -EnvironmentSuffix prod

# Smoke tests and infrastructure tests run automatically
# Check exit code for success/failure
```

### Manual Validation
```powershell
# Deploy
.\scripts\deploy-secretless.ps1 -EnvironmentSuffix prod

# Deployment script automatically runs:
# 1. Smoke tests (exit code 0/1)
# 2. Infrastructure tests (if Pester installed)

# Manual retest if needed
.\scripts\smoke-test.ps1 -AppUrl "https://app-mermaid-prod.azurewebsites.net"
Invoke-Pester -Path .\tests\infrastructure\validate-deployment.tests.ps1
```

---

## Test Results Interpretation

### Smoke Tests Output
```
============================================================================
Running Smoke Tests
============================================================================
App URL: https://app-mermaid-prod.azurewebsites.net
Timeout: 30 seconds

[✓] Health Endpoint: OK (200 OK in 123ms)
[✓] Environments API: OK (200 OK in 456ms)
[✓] Publishers API: OK (200 OK in 789ms)
[✓] Solutions API: OK (200 OK in 321ms)
[✓] Global Choices API: OK (200 OK in 654ms)
[✓] Frontend Assets: OK (200 OK in 234ms)

============================================================================
Test Results: 6 passed, 0 failed
============================================================================
```

### Pester Tests Output
```
Describing Azure Infrastructure Validation
  Context Resource Group
    [+] Resource group should exist 89ms (5ms|85ms)
    [+] Resource group should be in correct location 12ms (2ms|10ms)
  Context App Service
    [+] App Service should exist 234ms (10ms|224ms)
    [+] App Service should be running 156ms (8ms|148ms)
    [+] App Service should use Linux 12ms (2ms|10ms)
    [+] App Service should use Node 20 15ms (3ms|12ms)
    [+] App Service should have HTTPS only enabled 11ms (2ms|9ms)
  ...

Tests completed in 15.2s
Tests Passed: 18, Failed: 0, Skipped: 0 NotRun: 0
```

---

## Troubleshooting

### Smoke Test Failures

**Problem**: Health endpoint returns 503
**Solution**: App may still be starting - wait 30-60 seconds and retry

**Problem**: Timeout errors
**Solution**: Increase timeout with `-TimeoutSeconds 60` parameter

**Problem**: Dataverse API failures (publishers/solutions)
**Solution**: 
1. Check managed identity is correctly assigned
2. Verify application user exists in Dataverse
3. Check `USE_MANAGED_IDENTITY=true` in app settings

### Infrastructure Test Failures

**Problem**: "Managed Identity should be assigned" fails
**Solution**: Run `setup-secretless.ps1` to create managed identity

**Problem**: "Required environment variables should be set" fails
**Solution**: Check deployment script completed successfully

**Problem**: Performance tests fail (response time too slow)
**Solution**: 
1. Check App Service plan SKU (B1 minimum recommended)
2. Verify no ongoing Azure service issues
3. Test from different network location

---

## Best Practices

1. **Always run smoke tests after deployment**: Catch issues immediately
2. **Install Pester for comprehensive validation**: Validates infrastructure + application
3. **Monitor health dependencies in production**: Use `/api/health/dependencies` endpoint
4. **Set up alerting**: Monitor health endpoint with Azure Monitor or Application Insights
5. **Test locally before deploying**: Catch issues early with local smoke tests
6. **Document test failures**: Track patterns for continuous improvement

---

## Related Documentation
- [TESTING.md](TESTING.md) - Overall testing strategy
- [DEV-PROXY-TESTING.md](DEV-PROXY-TESTING.md) - API failure simulation
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [AZURE-MULTI-ENVIRONMENT.md](AZURE-MULTI-ENVIRONMENT.md) - Multi-environment setup
