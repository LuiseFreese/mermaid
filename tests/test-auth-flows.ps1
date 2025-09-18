# Test Authentication Flows
# Real integration tests for Mermaid Dataverse authentication
# 
# Configure your environment variables before running:
# - CLIENT_ID: Your app registration client ID
# - TENANT_ID: Your Azure tenant ID
# - RESOURCE_GROUP: Your Azure resource group name

Write-Host "🧪 Authentication Flow Integration Tests" -ForegroundColor Cyan
Write-Host "========================================"

# Check if we're running this in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Please run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Load configuration from environment variables
if (-not $env:CLIENT_ID) { $env:CLIENT_ID = "your-app-registration-client-id" }
if (-not $env:TENANT_ID) { $env:TENANT_ID = "your-tenant-id" }
if (-not $env:DATAVERSE_URL) { $env:DATAVERSE_URL = "https://your-dataverse.crm.dynamics.com" }
if (-not $env:RESOURCE_GROUP) { $env:RESOURCE_GROUP = "your-resource-group" }

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  App ID: $env:CLIENT_ID" 
Write-Host "  Tenant ID: $env:TENANT_ID"
Write-Host "  Dataverse URL: $env:DATAVERSE_URL"
Write-Host "  Resource Group: $env:RESOURCE_GROUP"
Write-Host ""

# Auto-test your Managed Identity + Federated Credentials setup
Write-Host "🏗️ 🎫 Testing Managed Identity with Federated Credentials..." -ForegroundColor Yellow
Write-Host "⚠️  Note: This will fail locally since you need an Azure-issued JWT token" -ForegroundColor Magenta
Write-Host "   But let's test the code path to see if it works!" -ForegroundColor Cyan

$env:USE_MANAGED_IDENTITY = "true"
$env:USE_FEDERATED_CREDENTIAL = "true"

# For testing purposes, use a dummy JWT token (will fail auth but test the code)
# In production, this would be provided by the Azure managed identity
$env:CLIENT_ASSERTION = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI3ZjA4YTI1ZC04ODRlLTQ2M2UtODQ3MC1lMGYxZGM2OTUyYjMiLCJpc3MiOiJodHRwczovL2xvZ2luLm1pY3Jvc29mdG9ubGluZS5jb20vYjQ2OWUzNzAtZDZhNi00NWI1LTkyOGUtODU2YWUwMzA3YTZkL3YyLjAiLCJhdWQiOiJhcGk6Ly9BenVyZUFEVG9rZW5FeGNoYW5nZSIsImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNjAwMDAwMDAwfQ.dummy-signature"

Write-Host "🔍 Testing with dummy JWT (will show authentication path but fail at Azure)" -ForegroundColor Yellow
node tests/integration/test-auth-flows.js

Write-Host ""
Write-Host "Test completed! Check the output above for results." -ForegroundColor Green