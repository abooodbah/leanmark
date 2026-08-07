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

# Hand-authored files in assets/ are runtime files by repository convention. Preserve
# their relative paths, but deliberately exclude source maps and documentation.
$sourceAssets = Join-Path $repoRoot "assets"
$stagedAssets = Join-Path $distDirectory "assets"
if (Test-Path -LiteralPath $sourceAssets -PathType Container) {
    Get-ChildItem -LiteralPath $sourceAssets -Recurse -File |
        Where-Object { $_.Extension -notin @(".map", ".md") } |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($sourceAssets.Length).TrimStart('\', '/')
            Copy-RequiredFile -Source $_.FullName -Destination (Join-Path $stagedAssets $relativePath)
        }
}

# Fail closed if the native host's three handcrafted entry assets are missing.
foreach ($requiredAssetName in @("reader.html", "reader.css", "reader.js")) {
    $requiredAssetPath = Join-Path $stagedAssets $requiredAssetName
    if (-not (Test-Path -LiteralPath $requiredAssetPath -PathType Leaf)) {
        throw "Required runtime asset was not staged: $requiredAssetPath"
    }
}

# Only the browser-ready Mermaid bundle is shipped; the rest of node_modules remains
# a build dependency and never enters dist.
Copy-RequiredFile -Source (Join-Path $nodeModules "mermaid\dist\mermaid.min.js") -Destination (Join-Path $stagedAssets "vendor\mermaid.min.js")

# Stage only the Latin font weights used by LeanMark's stylesheet. Keeping the original
# Fontsource filenames makes @font-face URLs obvious and easy to audit.
$fontFiles = @(
    "@fontsource\ibm-plex-sans\files\ibm-plex-sans-latin-400-normal.woff2",
    "@fontsource\ibm-plex-sans\files\ibm-plex-sans-latin-500-normal.woff2",
    "@fontsource\ibm-plex-sans\files\ibm-plex-sans-latin-600-normal.woff2",
    "@fontsource\ibm-plex-serif\files\ibm-plex-serif-latin-600-normal.woff2",
    "@fontsource\ibm-plex-mono\files\ibm-plex-mono-latin-400-normal.woff2"
)

foreach ($fontRelativePath in $fontFiles) {
    $fontSource = Join-Path $nodeModules $fontRelativePath
    $fontName = Split-Path -Leaf $fontRelativePath
    Copy-RequiredFile -Source $fontSource -Destination (Join-Path $stagedAssets "fonts\$fontName")
}

# Distribution documentation is required, not opportunistic: a release must carry
# its use terms and the notices for bundled dependencies.
foreach ($noticeName in @("README.md", "LICENSE", "THIRD_PARTY_NOTICES.md")) {
    Copy-RequiredFile -Source (Join-Path $repoRoot $noticeName) -Destination (Join-Path $distDirectory $noticeName)
}

$stagedFiles = Get-ChildItem -LiteralPath $distDirectory -Recurse -File
$stagedBytes = ($stagedFiles | Measure-Object -Property Length -Sum).Sum
Write-Host ("LeanMark {0} {1} staged {2} files ({3:N2} MiB) in {4}" -f $Configuration, $Platform, $stagedFiles.Count, ($stagedBytes / 1MB), $distDirectory)
