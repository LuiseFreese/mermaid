# Quick Start Dev Proxy Script
# This script helps you quickly start Dev Proxy with different configurations

param(
    [Parameter(HelpMessage="Test scenario to run")]
    [ValidateSet("errors", "ratelimit", "latency", "mocks", "all")]
    [string]$Scenario = "errors",
    
    [Parameter(HelpMessage="Failure rate percentage (0-100)")]
    [ValidateRange(0, 100)]
    [int]$FailureRate = 50,
    
    [Parameter(HelpMessage="Show debug logs")]
    [switch]$Debug
)

Write-Host "🚀 Starting Dev Proxy for Mermaid to Dataverse Converter" -ForegroundColor Cyan
Write-Host ""

# Check if Dev Proxy is installed
if (-not (Get-Command devproxy -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Dev Proxy is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install with: winget install Microsoft.DevProxy" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Get the devproxy folder path (script location)
$devproxyPath = $PSScriptRoot
$configFile = Join-Path $devproxyPath "devproxyrc.json"

if (-not (Test-Path $configFile)) {
    Write-Host "❌ Configuration file not found: $configFile" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Configuration:" -ForegroundColor Green
Write-Host "   Scenario: $Scenario"
Write-Host "   Failure Rate: $FailureRate%"
Write-Host "   Config: $configFile"
Write-Host ""

# Build command arguments
$arguments = @(
    "--config-file", $configFile,
    "--failure-rate", $FailureRate
)

if ($Debug) {
    $arguments += "--log-level", "debug"
}

# Scenario-specific instructions
switch ($Scenario) {
    "errors" {
        Write-Host "🔴 ERROR SIMULATION MODE" -ForegroundColor Yellow
        Write-Host "   - Randomly injects API errors (503, 500, 429, 401, 400, 403)"
        Write-Host "   - Failure rate: $FailureRate%"
        Write-Host "   - Tests error handling and retry logic"
        Write-Host ""
        Write-Host "📝 What to test:" -ForegroundColor Cyan
        Write-Host "   1. Upload an ERD file"
        Write-Host "   2. Start deployment"
        Write-Host "   3. Watch for error messages"
        Write-Host "   4. Verify retry logic works"
        Write-Host "   5. Check that data isn't lost on failure"
        Write-Host ""
    }
    "ratelimit" {
        Write-Host "⏱️  RATE LIMITING MODE" -ForegroundColor Yellow
        Write-Host "   - Simulates Dataverse throttling (6000 req/5min)"
        Write-Host "   - Tests backoff and retry strategies"
        Write-Host ""
        Write-Host "⚠️  NOTE: Enable RateLimitingPlugin in devproxyrc.json first!" -ForegroundColor Red
        Write-Host ""
        Write-Host "📝 What to test:" -ForegroundColor Cyan
        Write-Host "   1. Deploy a large ERD (20+ entities)"
        Write-Host "   2. Watch for 429 responses"
        Write-Host "   3. Verify automatic retry with backoff"
        Write-Host "   4. Check user sees progress updates"
        Write-Host ""
    }
    "latency" {
        Write-Host "🐌 LATENCY SIMULATION MODE" -ForegroundColor Yellow
        Write-Host "   - Adds 200-2000ms delay to API responses"
        Write-Host "   - Tests loading states and timeouts"
        Write-Host ""
        Write-Host "⚠️  NOTE: Enable LatencyPlugin in devproxyrc.json first!" -ForegroundColor Red
        Write-Host ""
        Write-Host "📝 What to test:" -ForegroundColor Cyan
        Write-Host "   1. Use the app normally"
        Write-Host "   2. Verify loading spinners appear"
        Write-Host "   3. Check timeouts are handled"
        Write-Host "   4. Ensure UI doesn't freeze"
        Write-Host ""
    }
    "mocks" {
        Write-Host "🎭 MOCK API MODE" -ForegroundColor Yellow
        Write-Host "   - Returns mock Dataverse responses"
        Write-Host "   - No real Dataverse connection needed"
        Write-Host "   - Perfect for offline development"
        Write-Host ""
        Write-Host "⚠️  NOTE: Enable MockResponsePlugin in devproxyrc.json first!" -ForegroundColor Red
        Write-Host "⚠️  NOTE: Disable GenericRandomErrorPlugin!" -ForegroundColor Red
        Write-Host ""
        Write-Host "📝 What to test:" -ForegroundColor Cyan
        Write-Host "   1. Work on UI without Dataverse"
        Write-Host "   2. Test frontend logic in isolation"
        Write-Host "   3. Fast iteration on features"
        Write-Host ""
    }
    "all" {
        Write-Host "🎯 FULL SIMULATION MODE" -ForegroundColor Yellow
        Write-Host "   - Errors + Rate Limiting + Latency"
        Write-Host "   - Most realistic production simulation"
        Write-Host ""
        Write-Host "⚠️  NOTE: Enable all plugins in devproxyrc.json first!" -ForegroundColor Red
        Write-Host ""
        Write-Host "📝 What to test:" -ForegroundColor Cyan
        Write-Host "   1. Complete end-to-end deployment"
        Write-Host "   2. Handle multiple failure modes"
        Write-Host "   3. Verify app is production-ready"
        Write-Host ""
    }
}

Write-Host "🔧 Next steps:" -ForegroundColor Magenta
Write-Host "   1. This terminal: Dev Proxy will intercept requests"
Write-Host "   2. New terminal: Run 'npm run dev' to start your app"
Write-Host "   3. Browser: Use the app at http://localhost:3003"
Write-Host "   4. Watch: Observe how the app handles failures"
Write-Host ""
Write-Host "⌨️  Press Ctrl+C to stop Dev Proxy" -ForegroundColor Gray
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""

# Start Dev Proxy
try {
    & devproxy @arguments
} catch {
    Write-Host ""
    Write-Host "❌ Dev Proxy failed to start: $_" -ForegroundColor Red
    exit 1
}
