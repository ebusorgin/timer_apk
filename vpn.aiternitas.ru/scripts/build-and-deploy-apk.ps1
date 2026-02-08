# Build APK via EAS and deploy to server
# First run: execute "eas build --platform android --profile production" in terminal
# and answer "yes" when prompted for keystore. After that this script works.

param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"
$AppDir = "$PSScriptRoot\..\app"
$WebPublic = "$PSScriptRoot\..\web\public"
$Server = "root@82.146.44.126"
$SshKey = "C:\Users\evg\.ssh\id_rsa_aiternitas"

if ($Build) {
    Write-Host "=== Building APK via EAS ===" -ForegroundColor Cyan
    Push-Location $AppDir
    try {
        eas build --platform android --profile production --non-interactive
    } finally {
        Pop-Location
    }
}

Write-Host "`n=== Checking latest build ===" -ForegroundColor Cyan
Push-Location $AppDir
$json = eas build:list --platform android --limit 1 --json --non-interactive 2>$null
$buildList = $json | ConvertFrom-Json
Pop-Location

if (-not $buildList -or (@($buildList).Count -eq 0)) {
    Write-Host "No builds found. Run: cd app; eas build --platform android --profile production" -ForegroundColor Yellow
    Write-Host "Answer 'yes' when prompted for keystore (first time only)." -ForegroundColor Yellow
    exit 1
}

$latest = @($buildList)[0]
if (-not $latest) { Write-Host "No builds found." -ForegroundColor Yellow; exit 1 }
$status = $latest.status
$id = $latest.id

Write-Host "Latest build: $id Status: $status"

if ($status -ne "finished") {
    Write-Host "Build not ready. Status: $status. Wait and run again." -ForegroundColor Yellow
    exit 1
}

$apkPath = "$WebPublic\vpn-app.apk"
New-Item -ItemType Directory -Path $WebPublic -Force | Out-Null

Write-Host "`n=== Downloading APK ===" -ForegroundColor Cyan
Push-Location $AppDir
eas build:download --id $id --output $apkPath
Pop-Location

if (-not (Test-Path $apkPath)) {
    Write-Host "Download failed." -ForegroundColor Red
    exit 1
}

Write-Host "APK saved to $apkPath" -ForegroundColor Green

Write-Host "`n=== Uploading to server ===" -ForegroundColor Cyan
scp -i $SshKey -o StrictHostKeyChecking=no $apkPath "${Server}:/opt/vpn/public/"
Write-Host "Done. https://vpn.aiternitas.ru/vpn-app.apk" -ForegroundColor Green
