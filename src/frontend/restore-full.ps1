# Restore full UI
Write-Host "Restoring full Fluent UI..." -ForegroundColor Yellow

if (Test-Path "src\main-full.tsx.bak") {
    Copy-Item "src\main-full.tsx.bak" "src\main.tsx" -Force
    Remove-Item "src\main-full.tsx.bak" -Force
    Write-Host "Full UI restored!" -ForegroundColor Green
} else {
    Write-Host "No backup found - full UI is already active" -ForegroundColor Red
}
