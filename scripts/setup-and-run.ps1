# MediSathi one-shot setup + E2E (mock or live)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== MediSathi setup ===" -ForegroundColor Cyan

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "Created .env from .env.example — add Exotel keys if needed"
}

Write-Host "Installing dependencies..."
npm install --silent

Write-Host "Syncing database..."
npx prisma generate 2>$null
npx prisma db push --accept-data-loss

Write-Host "Testing Exotel API..."
npm run test:exotel
if ($LASTEXITCODE -eq 0) {
  Write-Host "Exotel OK — you can set DEV_MOCK_EXOTEL=false for live WhatsApp" -ForegroundColor Green
}

Write-Host "`n=== Starting server (background) ===" -ForegroundColor Cyan
$job = Start-Job { Set-Location $using:PWD; npm run dev 2>&1 }
Start-Sleep -Seconds 4

Write-Host "Running E2E flow..."
npm run e2e

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Server job ID: $($job.Id) — Stop-Job $($job.Id) when finished"
Write-Host "Open http://localhost:3000/dev for dev tools"
