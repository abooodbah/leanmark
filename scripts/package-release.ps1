[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [ValidateSet('x64')]
  [string]$Platform = 'x64',
  [string]$DistPath,
  [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($DistPath)) {
  $DistPath = Join-Path $repoRoot 'dist'
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $repoRoot 'release'
}

$normalizedVersion = $Version.Trim()
if ($normalizedVersion.StartsWith('v', [System.StringComparison]::OrdinalIgnoreCase)) {
  $normalizedVersion = $normalizedVersion.Substring(1)
}
$semVerPattern = '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
if ($normalizedVersion -notmatch $semVerPattern) {
  throw ('Version must be a valid Semantic Version, with an optional leading v: {0}' -f $Version)
}

$resolvedDist = [System.IO.Path]::GetFullPath($DistPath)
if (-not (Test-Path -LiteralPath $resolvedDist -PathType Container)) {
  throw ('Staged distribution directory does not exist: {0}' -f $resolvedDist)
}
$requiredPayloadFiles = @(
  'LeanMark.exe',
  'WebView2Loader.dll',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'assets\reader.html',
  'assets\reader.css',
  'assets\reader.js',
  'assets\vendor\mermaid.min.js'
)
foreach ($relativePath in $requiredPayloadFiles) {
  $requiredPath = Join-Path $resolvedDist $relativePath
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw ('Required release payload file is missing: {0}' -f $requiredPath)
  }
}

$installerFiles = @('install.ps1', 'uninstall.ps1')
$installerRoot = Join-Path $repoRoot 'installer'
foreach ($installerName in $installerFiles) {
  $installerPath = Join-Path $installerRoot $installerName
  if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf)) {
    throw ('Required installer file is missing: {0}' -f $installerPath)
  }
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$distPrefix = $resolvedDist.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
if ($resolvedOutput.Equals($resolvedDist, [System.StringComparison]::OrdinalIgnoreCase) -or
    $resolvedOutput.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputPath must be outside DistPath so prior packages cannot enter a new archive.'
}
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$packageName = 'LeanMark-v{0}-windows-{1}' -f $normalizedVersion, $Platform
$zipPath = Join-Path $resolvedOutput ($packageName + '.zip')
$checksumPath = $zipPath + '.sha256'
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  'leanmark-release-' + [guid]::NewGuid().ToString('N'))
$packageRoot = Join-Path $temporaryRoot $packageName
$packageSucceeded = $false

function Copy-ReleaseTree {
  param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$DestinationRoot
  )

  $sourcePrefix = $SourceRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  foreach ($item in Get-ChildItem -LiteralPath $SourceRoot -Recurse -Force) {
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw ('Release inputs must not contain reparse points: {0}' -f $item.FullName)
    }
    if ($item.PSIsContainer) { continue }
    $relativePath = $item.FullName.Substring($sourcePrefix.Length)
    $destination = Join-Path $DestinationRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
  }
}

function Add-FileToArchive {
  param(
    [Parameter(Mandatory = $true)][System.IO.Compression.ZipArchive]$Archive,
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$EntryName,
    [Parameter(Mandatory = $true)][System.DateTimeOffset]$Timestamp
  )

  $entry = $Archive.CreateEntry(
    $EntryName,
    [System.IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = $Timestamp
  $entryStream = $entry.Open()
  $sourceStream = [System.IO.File]::Open(
    $SourcePath,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::Read)
  try {
    $sourceStream.CopyTo($entryStream)
  } finally {
    $sourceStream.Dispose()
    $entryStream.Dispose()
  }
}

try {
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
  Copy-ReleaseTree -SourceRoot $resolvedDist -DestinationRoot $packageRoot

  $packagedInstallerRoot = Join-Path $packageRoot 'installer'
  New-Item -ItemType Directory -Path $packagedInstallerRoot -Force | Out-Null
  foreach ($installerName in $installerFiles) {
    Copy-Item -LiteralPath (Join-Path $installerRoot $installerName) `
      -Destination (Join-Path $packagedInstallerRoot $installerName) -Force
  }

  $installText = @(
    ('LeanMark v{0} for Windows {1}' -f $normalizedVersion, $Platform),
    '',
    'Portable use:',
    '  Extract the complete archive, then run LeanMark.exe.',
    '',
    'Install for the current Windows user (no administrator access required):',
    '  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1 -OpenDefaultAppsSettings',
    '',
    'Uninstall from Windows Settings > Apps > Installed apps > LeanMark,',
    'or run the installed uninstall.ps1 as described in README.md.'
  ) -join [System.Environment]::NewLine
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText(
    (Join-Path $packageRoot 'INSTALL.txt'),
    $installText + [System.Environment]::NewLine,
    $utf8WithoutBom)

  foreach ($outputFile in @($zipPath, $checksumPath)) {
    if (Test-Path -LiteralPath $outputFile -PathType Leaf) {
      Remove-Item -LiteralPath $outputFile -Force
    }
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archiveStream = [System.IO.File]::Open(
    $zipPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None)
  $archive = [System.IO.Compression.ZipArchive]::new(
    $archiveStream,
    [System.IO.Compression.ZipArchiveMode]::Create,
    $false)
  try {
    $fixedTimestamp = [System.DateTimeOffset]::new(
      2000, 1, 1, 0, 0, 0, [System.TimeSpan]::Zero)
    $packagePrefix = $packageRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $packageFiles = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -File -Force |
      Sort-Object { $_.FullName.Substring($packagePrefix.Length) })
    foreach ($file in $packageFiles) {
      $relativePath = $file.FullName.Substring($packagePrefix.Length).Replace('\', '/')
      $entryName = $packageName + '/' + $relativePath
      Add-FileToArchive -Archive $archive -SourcePath $file.FullName `
        -EntryName $entryName -Timestamp $fixedTimestamp
    }
  } finally {
    $archive.Dispose()
    $archiveStream.Dispose()
  }

  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $checksumLine = '{0}  {1}{2}' -f $hash, [System.IO.Path]::GetFileName($zipPath), [char]10
  [System.IO.File]::WriteAllText(
    $checksumPath,
    $checksumLine,
    [System.Text.Encoding]::ASCII)

  $archiveRead = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entryNames = @($archiveRead.Entries | ForEach-Object { $_.FullName })
    foreach ($requiredEntry in @(
      ($packageName + '/LeanMark.exe'),
      ($packageName + '/WebView2Loader.dll'),
      ($packageName + '/INSTALL.txt'),
      ($packageName + '/installer/install.ps1'),
      ($packageName + '/installer/uninstall.ps1')
    )) {
      if ($entryNames -notcontains $requiredEntry) {
        throw ('Created release archive is missing: {0}' -f $requiredEntry)
      }
    }
  } finally {
    $archiveRead.Dispose()
  }

  $packageSucceeded = $true
  Write-Host ('Created {0}' -f $zipPath)
  Write-Host ('SHA256 {0}' -f $hash)
  [pscustomobject]@{
    Version = $normalizedVersion
    Platform = $Platform
    Archive = $zipPath
    Checksum = $checksumPath
    SHA256 = $hash
  }
} finally {
  if (-not $packageSucceeded) {
    foreach ($outputFile in @($zipPath, $checksumPath)) {
      if (Test-Path -LiteralPath $outputFile -PathType Leaf) {
        Remove-Item -LiteralPath $outputFile -Force
      }
    }
  }
  if (Test-Path -LiteralPath $temporaryRoot -PathType Container) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
