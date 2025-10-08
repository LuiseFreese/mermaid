# Dev Proxy Cleanup Script
# Use this if Dev Proxy has messed up your internet connection

Write-Host "🧹 Dev Proxy Cleanup Script" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop Dev Proxy
Write-Host "1. Stopping Dev Proxy..." -ForegroundColor Yellow
Stop-Process -Name devproxy -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Write-Host "   ✅ Dev Proxy stopped" -ForegroundColor Green
Write-Host ""

# Step 2: Clear Internet Settings proxy
Write-Host "2. Clearing Internet Settings proxy..." -ForegroundColor Yellow
try {
    Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0 -ErrorAction Stop
    Write-Host "   ✅ Internet Settings proxy cleared" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Could not clear Internet Settings proxy: $_" -ForegroundColor Red
}
Write-Host ""

# Step 3: Reset WinHTTP proxy
Write-Host "3. Resetting WinHTTP proxy..." -ForegroundColor Yellow
try {
    netsh winhttp reset proxy | Out-Null
    Write-Host "   ✅ WinHTTP proxy reset" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Could not reset WinHTTP proxy: $_" -ForegroundColor Red
}
Write-Host ""

# Step 4: Clear environment variables
Write-Host "4. Clearing proxy environment variables..." -ForegroundColor Yellow
Remove-Item env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item env:HTTPS_PROXY -ErrorAction SilentlyContinue
Write-Host "   ✅ Environment variables cleared" -ForegroundColor Green
Write-Host ""

# Step 5: Verify
Write-Host "5. Verifying settings..." -ForegroundColor Yellow
$internetSettings = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$winHttpProxy = netsh winhttp show proxy

Write-Host "   Internet Settings:" -ForegroundColor Cyan
Write-Host "   - ProxyEnable: $($internetSettings.ProxyEnable)" -ForegroundColor White
if ($internetSettings.ProxyServer) {
    Write-Host "   - ProxyServer: $($internetSettings.ProxyServer)" -ForegroundColor White
}

Write-Host ""
Write-Host "   WinHTTP Proxy:" -ForegroundColor Cyan
Write-Host "   $($winHttpProxy -join "`n   ")" -ForegroundColor White
Write-Host ""

# Step 6: Test internet
Write-Host "6. Testing internet connection..." -ForegroundColor Yellow
try {
    $testResult = Test-Connection google.com -Count 2 -ErrorAction Stop
    Write-Host "   ✅ Internet connection working!" -ForegroundColor Green
    Write-Host "   - Ping time: $($testResult[0].ResponseTime)ms" -ForegroundColor White
} catch {
    Write-Host "   ❌ Internet still not working" -ForegroundColor Red
    Write-Host "   - Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "   💡 Try these additional steps:" -ForegroundColor Yellow
    Write-Host "   1. Close and reopen PowerShell" -ForegroundColor White
    Write-Host "   2. Check your VPN connection" -ForegroundColor White
    Write-Host "   3. Restart your computer" -ForegroundColor White
}
Write-Host ""

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Cleanup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test your browser (open google.com)" -ForegroundColor White
Write-Host "2. If internet works, you can restart Dev Proxy:" -ForegroundColor White
Write-Host "   cd devproxy" -ForegroundColor Cyan
Write-Host "   devproxy --config-file devproxyrc-rate-limit.json" -ForegroundColor Cyan
Write-Host "3. Always stop Dev Proxy with Ctrl+C (not by closing terminal)" -ForegroundColor White
Write-Host ""
