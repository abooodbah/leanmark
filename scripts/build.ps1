[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    [ValidateSet("x64")]
    [string]$Platform = "x64",

    [switch]$Clean,
    [switch]$SkipNpmRestore
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$solutionPath = Join-Path $repoRoot "LeanMark.sln"
$binaryDirectory = Join-Path $repoRoot ("bin\{0}\{1}" -f $Platform, $Configuration)
$distDirectory = Join-Path $repoRoot "dist"
$nodeModules = Join-Path $repoRoot "node_modules"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$ArgumentList
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $($LASTEXITCODE): $FilePath $($ArgumentList -join ' ')"
    }
}

function Resolve-MSBuild {
    $available = Get-Command "MSBuild.exe" -ErrorAction SilentlyContinue
    if ($null -ne $available) {
        return $available.Source
    }

    $programFilesX86 = [Environment]::GetFolderPath([Environment+SpecialFolder]::ProgramFilesX86)
    $vswherePath = Join-Path $programFilesX86 "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswherePath) {
        $located = & $vswherePath -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" |
            Select-Object -First 1
        if (-not [string]::IsNullOrWhiteSpace($located)) {
            return $located
        }
    }

    throw "MSBuild.exe was not found. Run this script from a Visual Studio Developer PowerShell or install MSVC Build Tools."
}

function Reset-SafeDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $resolvedParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $Path))
    if (-not $resolvedParent.Equals($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clear a directory outside the repository root: $Path"
    }

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
}

function Copy-RequiredFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,

        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "Required build asset was not found: $Source"
    }

    $destinationParent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

if (-not (Test-Path -LiteralPath $solutionPath -PathType Leaf)) {
    throw "LeanMark.sln was not found at $solutionPath"
}

if ($Clean) {
    foreach ($generatedName in @("bin", "obj", "dist")) {
        $generatedPath = Join-Path $repoRoot $generatedName
        if (Test-Path -LiteralPath $generatedPath) {
            $resolvedGenerated = [System.IO.Path]::GetFullPath($generatedPath)
            if (-not $resolvedGenerated.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Refusing to clean a path outside the repository: $resolvedGenerated"
            }
            Remove-Item -LiteralPath $resolvedGenerated -Recurse -Force
        }
    }
}

Push-Location $repoRoot
try {
    if (-not $SkipNpmRestore) {
        $npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
        if ($null -eq $npm) {
            $npm = Get-Command "npm" -ErrorAction SilentlyContinue
        }
        if ($null -eq $npm) {
            throw "npm was not found. Install Node.js 20 or newer, or pass -SkipNpmRestore when node_modules is already complete."
        }

        # npm ci is deterministic when a committed lock file is available. The fallback
        # makes the first local build able to create that lock file from exact direct pins.
        if (Test-Path -LiteralPath (Join-Path $repoRoot "package-lock.json")) {
            Invoke-CheckedCommand -FilePath $npm.Source -ArgumentList @("ci", "--ignore-scripts", "--no-audit", "--no-fund")
        }
        else {
            Invoke-CheckedCommand -FilePath $npm.Source -ArgumentList @("install", "--ignore-scripts", "--no-audit", "--no-fund")
        }
    }

    $msbuild = Resolve-MSBuild
    Invoke-CheckedCommand -FilePath $msbuild -ArgumentList @(
        $solutionPath,
        "/restore",
        "/m",
        "/nologo",
        "/verbosity:minimal",
        "/p:Configuration=$Configuration",
        "/p:Platform=$Platform"
    )
}
finally {
    Pop-Location
}

# Recreate dist on every successful build. This prevents stale developer files from
# silently becoming part of a release package.
Reset-SafeDirectory -Path $distDirectory
Copy-RequiredFile -Source (Join-Path $binaryDirectory "LeanMark.exe") -Destination (Join-Path $distDirectory "LeanMark.exe")
Copy-RequiredFile -Source (Join-Path $binaryDirectory "WebView2Loader.dll") -Destination (Join-Path $distDirectory "WebView2Loader.dll")

$stagedAssets = Join-Path $distDirectory "assets"
$node = Get-Command "node.exe" -ErrorAction SilentlyContinue
if ($null -eq $node) {
    $node = Get-Command "node" -ErrorAction SilentlyContinue
}
if ($null -eq $node) {
    throw "Node.js was not found. Runtime assets require Node.js 20 or newer."
}
Invoke-CheckedCommand -FilePath $node.Source -ArgumentList @(
    (Join-Path $repoRoot "scripts\stage-runtime-assets.mjs"),
    $stagedAssets
)

# Distribution documentation is required, not opportunistic: a release must carry
# its use terms and the notices for bundled dependencies.
foreach ($noticeName in @("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md")) {
    Copy-RequiredFile -Source (Join-Path $repoRoot $noticeName) -Destination (Join-Path $distDirectory $noticeName)
}

$stagedFiles = Get-ChildItem -LiteralPath $distDirectory -Recurse -File
$stagedBytes = ($stagedFiles | Measure-Object -Property Length -Sum).Sum
Write-Host ("LeanMark {0} {1} staged {2} files ({3:N2} MiB) in {4}" -f $Configuration, $Platform, $stagedFiles.Count, ($stagedBytes / 1MB), $distDirectory)
