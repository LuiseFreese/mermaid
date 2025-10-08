# Restart Dev Proxy - kills existing instance and starts fresh

param(
    [string]$ConfigFile = "devproxy/devproxyrc.json"
)

Write-Host "🔄 Restarting Dev Proxy..." -ForegroundColor Cyan
Write-Host ""

# Kill existing Dev Proxy process if running
$devproxyProcess = Get-Process -Name "devproxy" -ErrorAction SilentlyContinue

if ($devproxyProcess) {
    Write-Host "⏹️  Stopping existing Dev Proxy (PID: $($devproxyProcess.Id))..." -ForegroundColor Yellow
    Stop-Process -Name "devproxy" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✅ Dev Proxy stopped" -ForegroundColor Green
    Write-Host ""
}

# Start Dev Proxy
Write-Host "🚀 Starting Dev Proxy (will NOT change Windows proxy settings)..." -ForegroundColor Cyan
Write-Host ""

devproxy --config-file $ConfigFile
