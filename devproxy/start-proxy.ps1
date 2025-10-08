# Smart Dev Proxy starter - checks if already running before starting
# This script prevents "port already in use" errors

param(
    [string]$ConfigFile = "devproxy/devproxyrc.json"
)

# Check if Dev Proxy is already running
$devproxyProcess = Get-Process -Name "devproxy" -ErrorAction SilentlyContinue

if ($devproxyProcess) {
    Write-Host "✅ Dev Proxy is already running (PID: $($devproxyProcess.Id))" -ForegroundColor Green
    Write-Host "   Proxy listener: http://127.0.0.1:8000" -ForegroundColor Cyan
    Write-Host "   API endpoint: http://127.0.0.1:8897" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "To restart Dev Proxy, run: npm run proxy:restart" -ForegroundColor Yellow
    exit 0
}

# Dev Proxy is not running, start it
Write-Host "🚀 Starting Dev Proxy..." -ForegroundColor Cyan
Write-Host ""

# Start Dev Proxy with the specified config
# Note: Dev Proxy does NOT set system proxy by default
# Only Node.js backend with HTTP_PROXY env var will use it
devproxy --config-file $ConfigFile
