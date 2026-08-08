[CmdletBinding()]
param(
    [string]$EdgePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$SvgPath = Join-Path $RepoRoot 'brand\leanmark-mark.svg'
$IconPath = Join-Path $RepoRoot 'src\LeanMark.ico'
$SiteAssetRoot = Join-Path $RepoRoot 'site\assets'
$SiteIconPath = Join-Path $SiteAssetRoot 'leanmark-icon.png'
$SocialSource = Join-Path $RepoRoot 'brand\social-preview.html'
$SocialPath = Join-Path $SiteAssetRoot 'social-preview.png'

if (-not $EdgePath) {
    $ProgramFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $ProgramFiles64 = [Environment]::GetEnvironmentVariable('ProgramFiles')
    $Candidates = @(
        (Join-Path $ProgramFilesX86 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $ProgramFiles64 'Microsoft\Edge\Application\msedge.exe')
    )
    $EdgePath = $Candidates |
        Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
        Select-Object -First 1
}
if (-not $EdgePath -or -not (Test-Path -LiteralPath $EdgePath -PathType Leaf)) {
    throw 'Microsoft Edge is required to render the source SVG.'
}
if (-not (Test-Path -LiteralPath $SvgPath -PathType Leaf)) {
    throw "Brand mark source is missing: $SvgPath"
}

$TempRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'LeanMark-brand-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
New-Item -ItemType Directory -Path $SiteAssetRoot -Force | Out-Null

try {
    $SourcePng = Join-Path $TempRoot 'leanmark-256.png'
    $Profile = Join-Path $TempRoot 'edge-profile'
    $Uri = [Uri]::new($SvgPath).AbsoluteUri
    $Arguments = @(
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        "--user-data-dir=$Profile",
        '--window-size=256,256',
        "--screenshot=$SourcePng",
        $Uri
    )
    & $EdgePath $Arguments | Out-Null
    if ($LASTEXITCODE -ne 0 -or
        -not (Test-Path -LiteralPath $SourcePng -PathType Leaf)) {
        throw 'Edge did not render the LeanMark mark.'
    }

    Add-Type -AssemblyName System.Drawing
    $Source = [Drawing.Image]::FromFile($SourcePng)
    try {
        $Sizes = @(16, 24, 32, 48, 64, 128, 256)
        $Frames = [Collections.Generic.List[object]]::new()
        foreach ($Size in $Sizes) {
            $Bitmap = [Drawing.Bitmap]::new(
                $Size,
                $Size,
                [Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $Graphics = [Drawing.Graphics]::FromImage($Bitmap)
            try {
                $Graphics.Clear([Drawing.Color]::Transparent)
                $Graphics.CompositingMode =
                    [Drawing.Drawing2D.CompositingMode]::SourceCopy
                $Graphics.CompositingQuality =
                    [Drawing.Drawing2D.CompositingQuality]::HighQuality
                $Graphics.InterpolationMode =
                    [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $Graphics.PixelOffsetMode =
                    [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $Graphics.DrawImage($Source, 0, 0, $Size, $Size)
            } finally {
                $Graphics.Dispose()
            }

            $Stream = [IO.MemoryStream]::new()
            try {
                $Bitmap.Save($Stream, [Drawing.Imaging.ImageFormat]::Png)
                $Frames.Add([pscustomobject]@{
                    Size = $Size
                    Bytes = $Stream.ToArray()
                })
            } finally {
                $Stream.Dispose()
                $Bitmap.Dispose()
            }
        }
    } finally {
        $Source.Dispose()
    }

    $IconStream = [IO.MemoryStream]::new()
    $Writer = [IO.BinaryWriter]::new($IconStream)
    try {
        $Writer.Write([uint16]0)
        $Writer.Write([uint16]1)
        $Writer.Write([uint16]$Frames.Count)
        $Offset = 6 + (16 * $Frames.Count)
        foreach ($Frame in $Frames) {
            $Dimension = if ($Frame.Size -eq 256) { 0 } else { $Frame.Size }
            $Writer.Write([byte]$Dimension)
            $Writer.Write([byte]$Dimension)
            $Writer.Write([byte]0)
            $Writer.Write([byte]0)
            $Writer.Write([uint16]1)
            $Writer.Write([uint16]32)
            $Writer.Write([uint32]$Frame.Bytes.Length)
            $Writer.Write([uint32]$Offset)
            $Offset += $Frame.Bytes.Length
        }
        foreach ($Frame in $Frames) {
            $Writer.Write([byte[]]$Frame.Bytes)
        }
        $Writer.Flush()
        [IO.File]::WriteAllBytes($IconPath, $IconStream.ToArray())
    } finally {
        $Writer.Dispose()
        $IconStream.Dispose()
    }

    Copy-Item -LiteralPath $SourcePng -Destination $SiteIconPath -Force
    Write-Host "Generated $IconPath and $SiteIconPath from $SvgPath"

    if (Test-Path -LiteralPath $SocialSource -PathType Leaf) {
        $SocialProfile = Join-Path $TempRoot 'social-edge-profile'
        $SocialUri = [Uri]::new($SocialSource).AbsoluteUri
        $SocialArguments = @(
            '--headless=new',
            '--disable-gpu',
            '--hide-scrollbars',
            '--force-device-scale-factor=1',
            "--user-data-dir=$SocialProfile",
            '--window-size=1280,640',
            '--virtual-time-budget=1500',
            "--screenshot=$SocialPath",
            $SocialUri
        )
        & $EdgePath $SocialArguments | Out-Null
        if ($LASTEXITCODE -ne 0 -or
            -not (Test-Path -LiteralPath $SocialPath -PathType Leaf)) {
            throw 'Edge did not render the LeanMark social preview.'
        }
        Write-Host "Generated $SocialPath from $SocialSource"
    }
} finally {
    $ResolvedTemp = [IO.Path]::GetFullPath($TempRoot)
    $SystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($ResolvedTemp.StartsWith($SystemTemp, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $ResolvedTemp).StartsWith('LeanMark-brand-')) {
        Remove-Item -LiteralPath $ResolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}
