# Smoke Test Script
# Post-deployment validation to ensure the application is working correctly
# Usage: .\scripts\smoke-test.ps1 -AppUrl "https://app-mermaid-prod.azurewebsites.net"
# For authenticated Azure deployments, script will automatically obtain access token

param(
    [Parameter(Mandatory=$false)]
    [string]$AppUrl = "http://localhost:8080",
    
    [Parameter(Mandatory=$false)]
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

Write-Host "`n🧪 Running Post-Deployment Smoke Tests" -ForegroundColor Cyan
Write-Host "Target: $AppUrl" -ForegroundColor Gray

# Auto-detect if this is an Azure deployment (may require auth)
$isAzure = $AppUrl -match "azurewebsites\.net"
$authToken = $null

if ($isAzure) {
    Write-Host "`n🔐 Azure deployment detected - obtaining access token..." -ForegroundColor Yellow
    try {
        # Extract app name from URL
        $appName = ($AppUrl -replace "https://", "" -replace "\.azurewebsites\.net.*", "")
        $resourceGroup = "rg-" + ($appName -replace "app-", "")
        
        Write-Host "   App: $appName" -ForegroundColor Gray
        Write-Host "   Resource Group: $resourceGroup" -ForegroundColor Gray
        
        # Get the client ID configured for Easy Auth
        $authConfig = az webapp auth-classic show --name $appName --resource-group $resourceGroup --query "clientId" -o tsv 2>$null
        
        if ($authConfig) {
            Write-Host "   Client ID: $authConfig" -ForegroundColor Gray
            
            # Get token for this specific app
            $tokenResponse = az account get-access-token --resource $authConfig --query "accessToken" -o tsv 2>$null
            
            if (-not $tokenResponse -or $tokenResponse.Length -lt 100) {
                # Try with the app's URL as resource
                $tokenResponse = az account get-access-token --resource $AppUrl --query "accessToken" -o tsv 2>$null
            }
            
            if ($tokenResponse -and $tokenResponse.Length -gt 100) {
                $authToken = $tokenResponse
                Write-Host "   ✅ Access token obtained" -ForegroundColor Green
            } else {
                Write-Host "   ⚠️  Could not obtain access token for app" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   ⚠️  Could not retrieve auth configuration" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  Error obtaining token: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   Continuing with unauthenticated requests..." -ForegroundColor Gray
    }
}

Write-Host ("=" * 60) -ForegroundColor Gray

$testsPassed = 0
$testsFailed = 0
$startTime = Get-Date

# Helper function for API calls with timeout and optional authentication
function Invoke-SmokeTest {
    param(
        [string]$TestName,
        [string]$Url,
        [scriptblock]$Validation
    )
    
    Write-Host "`n🔍 Test: $TestName" -ForegroundColor Yellow
    Write-Host "   URL: $Url" -ForegroundColor Gray
    
    try {
        $headers = @{}
        if ($script:authToken) {
            $headers["Authorization"] = "Bearer $script:authToken"
            $headers["X-ZUMO-AUTH"] = $script:authToken
        }
        
        if ($headers.Count -gt 0) {
            $response = Invoke-RestMethod -Uri $Url -Headers $headers -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        } else {
            $response = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        }
        
        # Run validation
        $result = & $Validation $response
        
        if ($result) {
            Write-Host "   ✅ PASSED" -ForegroundColor Green
            return $true
        } else {
            Write-Host "   ❌ FAILED: Validation returned false" -ForegroundColor Red
            return $false
        }
    }
    catch {
        $errorMessage = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $errorMessage += " | Details: $($_.ErrorDetails.Message)"
        }
        Write-Host "   ❌ FAILED: $errorMessage" -ForegroundColor Red
        return $false
    }
}

# Test 1: Health Endpoint
Write-Host "`n📋 Test Suite 1: Core Health" -ForegroundColor Magenta
$passed = Invoke-SmokeTest -TestName "Health Endpoint" -Url "$AppUrl/health" -Validation {
    param($response)
    if ($response -and $response.PSObject.Properties['status'] -and $response.status -eq "healthy") {
        Write-Host "   Status: $($response.status)" -ForegroundColor Gray
        if ($response.PSObject.Properties['version']) {
            Write-Host "   Version: $($response.version)" -ForegroundColor Gray
        }
        return $true
    }
    return $false
}
if ($passed) { $testsPassed++ } else { $testsFailed++ }

# Test 2: Environments Configuration
Write-Host "`n📋 Test Suite 2: Multi-Environment Configuration" -ForegroundColor Magenta
$passed = Invoke-SmokeTest -TestName "Environments API" -Url "$AppUrl/api/environments" -Validation {
    param($response)
    if ($response -and $response.PSObject.Properties['environments'] -and $response.environments.Count -gt 0) {
        Write-Host "   Environments found: $($response.environments.Count)" -ForegroundColor Gray
        foreach ($env in $response.environments) {
            Write-Host "     - $($env.name) ($($env.id))" -ForegroundColor DarkGray
        }
        return $true
    }
    Write-Host "   ⚠️ No environments configured!" -ForegroundColor Yellow
    return $false
}
if ($passed) { $testsPassed++ } else { $testsFailed++ }

# Test 3: Publishers API (with environmentId)
Write-Host "`n📋 Test Suite 3: Dataverse Integration" -ForegroundColor Magenta

    # First get default environment
    try {
        $envResponse = Invoke-RestMethod -Uri "$AppUrl/api/environments" -TimeoutSec $TimeoutSeconds
        $defaultEnvId = $envResponse.defaultEnvironmentId
        
        if ($defaultEnvId) {
            Write-Host "   Using environment: $defaultEnvId" -ForegroundColor Gray
            
            $passed = Invoke-SmokeTest -TestName "Publishers API" -Url "$AppUrl/api/publishers?environmentId=$defaultEnvId" -Validation {
                param($response)
                if ($response -and $response.Count -ge 0) {
                    Write-Host "   Publishers found: $($response.Count)" -ForegroundColor Gray
                    if ($response.Count -gt 0) {
                        $publisher = $response[0]
                        $displayName = if ($publisher.friendlyName) { $publisher.friendlyName } 
                                      elseif ($publisher.uniqueName) { $publisher.uniqueName }
                                      else { "(name not available)" }
                        Write-Host "     Example: $displayName" -ForegroundColor DarkGray
                    }
                    return $true
                }
                return $false
            }
            if ($passed) { $testsPassed++ } else { $testsFailed++ }
            
            # Test 4: Solutions API
            $passed = Invoke-SmokeTest -TestName "Solutions API" -Url "$AppUrl/api/solutions?environmentId=$defaultEnvId" -Validation {
                param($response)
                if ($response -and $response.Count -ge 0) {
                    Write-Host "   Solutions found: $($response.Count)" -ForegroundColor Gray
                    return $true
                }
                return $false
            }
            if ($passed) { $testsPassed++ } else { $testsFailed++ }
            
            # Test 5: Global Choices API
            $passed = Invoke-SmokeTest -TestName "Global Choices API" -Url "$AppUrl/api/global-choices-list?environmentId=$defaultEnvId" -Validation {
                param($response)
                if ($response -and $response.Count -ge 0) {
                    Write-Host "   Global choices found: $($response.Count)" -ForegroundColor Gray
                    return $true
                }
                return $false
            }
            if ($passed) { $testsPassed++ } else { $testsFailed++ }
        } else {
            Write-Host "   ⚠️ No default environment configured, skipping Dataverse tests" -ForegroundColor Yellow
            $testsFailed += 3
        }
    }
    catch {
        Write-Host "   ❌ Could not retrieve environment configuration" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor DarkRed
        $testsFailed += 3
    }

# Test 6: Frontend Assets
Write-Host "`n📋 Test Suite 4: Frontend Availability" -ForegroundColor Magenta
$passed = Invoke-SmokeTest -TestName "Frontend Landing Page" -Url "$AppUrl/" -Validation {
    param($response)
    # Check if we got HTML content (frontend is served)
    if ($response -match "<!DOCTYPE html>" -or $response -match "<html") {
        Write-Host "   Frontend HTML served successfully" -ForegroundColor Gray
        return $true
    }
    return $false
}
if ($passed) { $testsPassed++ } else { $testsFailed++ }

# Summary
$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host "`n" + ("=" * 60) -ForegroundColor Gray
Write-Host "📊 Smoke Test Summary" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Gray
Write-Host "Total Tests: $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host "✅ Passed: $testsPassed" -ForegroundColor Green
Write-Host "❌ Failed: $testsFailed" -ForegroundColor Red
Write-Host "⏱️  Duration: $([math]::Round($duration, 2))s" -ForegroundColor Gray

if ($testsFailed -eq 0) {
    Write-Host "`n🎉 All smoke tests passed! Application is healthy." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n⚠️  Some tests failed. Please review the errors above." -ForegroundColor Yellow
    exit 1
}
