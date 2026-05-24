param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$AppIdentifier = "com.specialorganizer.app"
$RequiredConfirmation = "DELETE SPECIAL ORGANIZER DATA"
$ProcessNames = @("special-organizer", "Special Organizer")

function Require-EnvironmentPath {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Environment variable $Name is not set. Refusing to continue."
    }

    return [System.IO.Path]::GetFullPath($Value)
}

function Assert-DeclaredTarget {
    param(
        [string]$Path,
        [string[]]$AllowedRoots
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $leafName = Split-Path -Leaf $fullPath
    $isInsideAllowedRoot = $false

    foreach ($root in $AllowedRoots) {
        $normalizedRoot = [System.IO.Path]::GetFullPath($root).TrimEnd('\')
        if ($fullPath.StartsWith($normalizedRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            $isInsideAllowedRoot = $true
            break
        }
    }

    if ($leafName -ne $AppIdentifier -or -not $isInsideAllowedRoot) {
        throw "Unsafe cleanup target rejected: $fullPath"
    }

    return $fullPath
}

$roamingRoot = Require-EnvironmentPath -Name "APPDATA" -Value $env:APPDATA
$localRoot = Require-EnvironmentPath -Name "LOCALAPPDATA" -Value $env:LOCALAPPDATA
$allowedRoots = @($roamingRoot, $localRoot)

$targets = @(
    @{
        Label = "Roaming app data, local SQLite, migrations";
        Path = Join-Path $roamingRoot $AppIdentifier
    },
    @{
        Label = "Local app data, WebView cache, logs";
        Path = Join-Path $localRoot $AppIdentifier
    }
)

Write-Host ""
Write-Host "Special Organizer data cleanup" -ForegroundColor Yellow
Write-Host "WARNING: this deletes local application data, logs, WebView cache, and the local SQLite database." -ForegroundColor Yellow
Write-Host "This does not uninstall the application binary. Back up anything you need before continuing." -ForegroundColor Yellow
Write-Host ""

$runningProcesses = Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $ProcessNames -contains $_.ProcessName }

if ($runningProcesses) {
    Write-Host "Special Organizer appears to be running. Close the app before deleting data." -ForegroundColor Red
    $runningProcesses | Select-Object ProcessName, Id | Format-Table -AutoSize
    exit 1
}

$declaredTargets = foreach ($target in $targets) {
    $safePath = Assert-DeclaredTarget -Path $target.Path -AllowedRoots $allowedRoots
    [PSCustomObject]@{
        Label = $target.Label
        Path = $safePath
        Exists = Test-Path -LiteralPath $safePath
    }
}

$declaredTargets | Format-Table -AutoSize

if ($DryRun) {
    Write-Host "Dry run only. No files were deleted." -ForegroundColor Cyan
    exit 0
}

Write-Host ""
Write-Host "Type exactly '$RequiredConfirmation' to delete these declared targets." -ForegroundColor Yellow
$confirmation = Read-Host "Confirmation"

if ($confirmation -ne $RequiredConfirmation) {
    Write-Host "Confirmation did not match. No files were deleted." -ForegroundColor Cyan
    exit 0
}

foreach ($target in $declaredTargets) {
    if (-not $target.Exists) {
        Write-Host "Not present: $($target.Path)"
        continue
    }

    Remove-Item -LiteralPath $target.Path -Recurse -Force
    Write-Host "Deleted: $($target.Path)" -ForegroundColor Green
}

Write-Host "Cleanup completed." -ForegroundColor Green
