# ULTRA FAST development without heavy dependencies
Write-Host "Starting LIGHTNING FAST dev server..." -ForegroundColor Green

# Temporarily use minimal entry point
Copy-Item "src\main.tsx" "src\main-full.tsx.bak" -Force
Copy-Item "src\main-minimal.tsx" "src\main.tsx" -Force

Write-Host "Switched to minimal UI - starting server..." -ForegroundColor Yellow
npm run dev:fast

# Note: Run restore-full.ps1 when you want the full UI back
