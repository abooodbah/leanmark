[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DistPath,
    [ValidateRange(5, 120)][int]$TimeoutSeconds = 30
)

# Installs LeanMark the way a user does after downloading the release ZIP in a
# browser and extracting it with Explorer: every file carries the internet zone
# mark. The installed copy must not keep that mark, or Windows checks the
# unsigned executable before every launch from a file association. Then the
# installed copy is started through the shell, as a double-click does, and
# removed again.
#
# This replaces the current user's LeanMark installation, so it refuses to run
# where one exists. CI runners start without one.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TestSupport.psm1') -Force

$repoRoot = Split-Path -Parent $PSScriptRoot
$dist = [System.IO.Path]::GetFullPath($DistPath)
$installDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\LeanMark'
$installedExe = Join-Path $installDir 'LeanMark.exe'
Assert-True (-not (Test-Path -LiteralPath $installedExe)) `
    "LeanMark is already installed in $installDir; this test would replace it."

# Lay the package out as the release ZIP does.
$package = Join-Path ([System.IO.Path]::GetTempPath()) 'leanmark-downloaded-package'
Remove-Item -LiteralPath $package -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $dist -Destination $package -Recurse
New-Item -ItemType Directory -Path (Join-Path $package 'installer') -Force | Out-Null
foreach ($name in @('install.ps1', 'uninstall.ps1')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "installer\$name") `
        -Destination (Join-Path $package "installer\$name")
}
$packageFiles = @(Get-ChildItem -LiteralPath $package -Recurse -File)
foreach ($file in $packageFiles) {
    Set-Content -LiteralPath $file.FullName -Stream Zone.Identifier `
        -Value "[ZoneTransfer]`r`nZoneId=3`r`nHostUrl=https://github.com/"
}
Write-TestPass ('marked {0} package files as downloaded from the internet' -f $packageFiles.Count)

$powershell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $powershell)) { $powershell = 'powershell.exe' }
& $powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $package 'installer\install.ps1') -Quiet
Assert-Equal $LASTEXITCODE 0 'The installer failed on a downloaded package.'
try {
    $installed = @(Get-ChildItem -LiteralPath $installDir -Recurse -File)
    Assert-True ($installed.Count -gt 0) 'The installer copied no files.'
    $marked = @($installed | Where-Object {
        $null -ne (Get-Item -LiteralPath $_.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue)
    })
    Assert-Equal $marked.Count 0 ('Installed files still carry the internet zone mark: {0}' -f
        (($marked | ForEach-Object { $_.FullName }) -join ', '))
    Write-TestPass ('the {0} installed files carry no internet zone mark' -f $installed.Count)

    $document = Join-Path $PSScriptRoot 'fixtures\simple.md'
    $process = Start-Process -FilePath $installedExe -ArgumentList ('-- "{0}"' -f $document) -PassThru
    try {
        [void](Wait-LeanMarkWindow -Process $process -TimeoutSeconds $TimeoutSeconds)
        Write-TestPass 'the installed copy starts through the shell'
    } finally {
        Stop-LeanMarkTestProcessTree -RootProcess $process
    }
} finally {
    $uninstaller = Join-Path $installDir 'uninstall.ps1'
    if (Test-Path -LiteralPath $uninstaller) {
        & $powershell -NoProfile -ExecutionPolicy Bypass -File $uninstaller -Quiet
    }
    Remove-Item -LiteralPath $package -Recurse -Force -ErrorAction SilentlyContinue
}
Assert-True (-not (Test-Path -LiteralPath $installedExe)) 'The uninstaller left LeanMark.exe behind.'
Write-TestPass 'the downloaded package installs, launches, and uninstalls'
