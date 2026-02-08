# Deploy web (verify + upload) - run this to fix "Failed to connect to server"
# Runs verify-before-deploy (tests + build) then deploy-local-build
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

& "$Root\deploy-local-build.ps1"
Write-Host "`nDone. Try the app again." -ForegroundColor Green
