# Clear Vite cache and restart development server quickly
Write-Host "Clearing Vite cache..." -ForegroundColor Yellow

# Remove Vite cache
if (Test-Path "node_modules\.vite") {
    Remove-Item "node_modules\.vite" -Recurse -Force
    Write-Host "Cleared node_modules\.vite" -ForegroundColor Green
}

# Remove dist folder
if (Test-Path "dist") {
    Remove-Item "dist" -Recurse -Force
    Write-Host "Cleared dist folder" -ForegroundColor Green
}

# Clear npm cache (optional)
Write-Host "Clearing npm cache..." -ForegroundColor Yellow
npm cache clean --force

Write-Host "Cache cleared! Now run: npm run dev" -ForegroundColor Green
