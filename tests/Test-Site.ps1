[CmdletBinding()]
param(
    [string]$SitePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$testsRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $testsRoot))
if ([string]::IsNullOrWhiteSpace($SitePath)) {
    $SitePath = Join-Path $repoRoot 'site'
}
$resolvedSite = [System.IO.Path]::GetFullPath($SitePath)
Import-Module (Join-Path $testsRoot 'TestSupport.psm1') -Force

function Get-PngDimensions {
    param([Parameter(Mandatory = $true)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    Assert-True ($bytes.Length -ge 24) "PNG is too short: $Path"
    $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    for ($index = 0; $index -lt $signature.Length; $index++) {
        Assert-Equal $bytes[$index] $signature[$index] "Invalid PNG signature: $Path"
    }
    $width = [uint32][System.Net.IPAddress]::NetworkToHostOrder(
        [System.BitConverter]::ToInt32($bytes, 16))
    $height = [uint32][System.Net.IPAddress]::NetworkToHostOrder(
        [System.BitConverter]::ToInt32($bytes, 20))
    [pscustomobject]@{ Width = $width; Height = $height }
}

Assert-True (Test-Path -LiteralPath $resolvedSite -PathType Container) "Site directory is missing: $resolvedSite"

$requiredFiles = @(
    'index.html',
    'styles.css',
    'robots.txt',
    'sitemap.xml',
    'site.webmanifest',
    '.nojekyll',
    'assets/leanmark-icon.png',
    'assets/leanmark-window.png',
    'assets/social-preview.png',
    'assets/fonts/ibm-plex-mono-latin-400-normal.woff2',
    'assets/fonts/ibm-plex-sans-latin-400-normal.woff2',
    'assets/fonts/ibm-plex-sans-latin-500-normal.woff2',
    'assets/fonts/ibm-plex-sans-latin-600-normal.woff2',
    'assets/fonts/ibm-plex-serif-latin-600-normal.woff2'
)
foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $resolvedSite $relativePath
    Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "Required site file is missing: $relativePath"
    if ($relativePath -ne '.nojekyll') {
        Assert-True ((Get-Item -LiteralPath $path).Length -gt 0) "Required site file is empty: $relativePath"
    }
}
Write-TestPass 'complete, self-contained GitHub Pages payload'

$html = Read-TextFile (Join-Path $resolvedSite 'index.html')
$css = Read-TextFile (Join-Path $resolvedSite 'styles.css')
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw |
    ConvertFrom-Json
$version = [string]$package.version
$downloadName = 'LeanMark-v{0}-windows-x64.zip' -f $version

Assert-Match $html '<html\s+lang="en">' 'The page language must remain explicit.'
Assert-Equal ([regex]::Matches($html, '(?is)<h1(?:\s|>)').Count) 1 'The landing page must have exactly one H1.'
Assert-Match $html '<a\s+class="skip-link"\s+href="#main-content">' 'A keyboard skip link must remain the first navigation aid.'
Assert-Match $html '<main\s+id="main-content">' 'The skip link target must remain a semantic main element.'
Assert-Match $html '<meta\s+name="viewport"' 'The responsive viewport meta element is missing.'
Assert-Match $html '<link\s+rel="canonical"\s+href="https://abooodbah\.github\.io/leanmark/"' 'The canonical Pages URL is missing or inconsistent.'
Assert-Match $html '<meta\s+property="og:image"\s+content="https://abooodbah\.github\.io/leanmark/assets/social-preview\.png"' 'The public social preview URL is missing.'
Assert-Match $html ([regex]::Escape($downloadName)) 'The landing-page download does not match package.json.'
Assert-Match $html '<img[^>]+leanmark-window\.png[^>]+alt="LeanMark displaying' 'The real product screenshot must retain meaningful alternative text.'
Assert-NotMatch $html '(?i)javascript\s*:' 'The static site must not contain javascript: URLs.'
Assert-NotMatch $html '(?is)<script[^>]+\bsrc\s*=' 'The static landing page must not execute external or bundled JavaScript.'
Assert-NotMatch $html ([char]0xFFFD) 'The page contains a Unicode replacement character.'
Write-TestPass 'semantic metadata, release CTA, and script-free markup'

Assert-Match $css ':focus-visible' 'Visible keyboard focus styling is required.'
Assert-Match $css '@media\s*\(prefers-reduced-motion:\s*reduce\)' 'Reduced-motion support is required.'
Assert-Match $css '@media\s*\(prefers-color-scheme:\s*dark\)' 'Dark color-scheme support is required.'
Assert-Match $css '@media\s*\(max-width:\s*34rem\)' 'A narrow mobile breakpoint is required.'
Assert-Match $css '(?s)@media\s*\(max-width:\s*34rem\).*?\.header-download\s*\{\s*display:\s*none;' 'The sticky-header CTA must collapse cleanly on narrow mobile screens.'
Assert-Match $css '\.button-small\s*\{[^}]*min-height:\s*2\.75rem' 'Small buttons must keep a 44 px minimum target height.'
Assert-Match $css '\.button-large\s*\{[^}]*min-height:\s*3rem' 'Large buttons must keep an accessible target height.'
Assert-NotMatch $css '(?i)url\(\s*["'']?https?://' 'Fonts and images must remain locally hosted.'
Write-TestPass 'responsive, motion-safe, keyboard-visible local styling'

$sitePrefix = $resolvedSite.TrimEnd([char[]]@('\', '/')) +
    [System.IO.Path]::DirectorySeparatorChar
$references = [regex]::Matches($html, '(?is)(?:href|src)\s*=\s*"([^"]+)"')
foreach ($reference in $references) {
    $value = $reference.Groups[1].Value
    if ($value.StartsWith('#') -or
        $value.StartsWith('https://') -or
        $value.StartsWith('http://') -or
        $value.StartsWith('mailto:') -or
        $value.StartsWith('data:')) {
        continue
    }
    $relativePath = ($value -split '[?#]', 2)[0]
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $resolvedSite $relativePath))
    Assert-True ($candidate.StartsWith($sitePrefix, [StringComparison]::OrdinalIgnoreCase)) "A local site reference escapes the site root: $value"
    Assert-True (Test-Path -LiteralPath $candidate -PathType Leaf) "A local site reference is broken: $value"
}
Write-TestPass 'all local page references resolve inside the deployable site'

$icon = Get-PngDimensions (Join-Path $resolvedSite 'assets/leanmark-icon.png')
$social = Get-PngDimensions (Join-Path $resolvedSite 'assets/social-preview.png')
$window = Get-PngDimensions (Join-Path $resolvedSite 'assets/leanmark-window.png')
Assert-Equal $icon.Width 256 'Brand icon width changed unexpectedly.'
Assert-Equal $icon.Height 256 'Brand icon height changed unexpectedly.'
Assert-Equal $social.Width 1280 'Social preview width must match GitHub recommendations.'
Assert-Equal $social.Height 640 'Social preview height must remain 2:1.'
Assert-Equal $window.Width 1226 'Product screenshot width changed without updating its markup.'
Assert-Equal $window.Height 853 'Product screenshot height changed without updating its markup.'
Write-TestPass 'brand, social-preview, and real-product image dimensions'

try {
    [void]([xml](Read-TextFile (Join-Path $resolvedSite 'sitemap.xml')))
} catch {
    throw "sitemap.xml is not well-formed XML: $($_.Exception.Message)"
}
$manifest = Get-Content -LiteralPath (Join-Path $resolvedSite 'site.webmanifest') -Raw |
    ConvertFrom-Json
Assert-Equal ([string]$manifest.name) 'LeanMark' 'Web app manifest name changed unexpectedly.'
Assert-Match (Read-TextFile (Join-Path $resolvedSite 'robots.txt')) 'Sitemap:\s+https://abooodbah\.github\.io/leanmark/sitemap\.xml' 'robots.txt must point crawlers to the public sitemap.'
Write-TestPass 'parseable manifest, sitemap, and crawler metadata'

Write-Host ''
Write-Host 'LeanMark site verification passed.' -ForegroundColor Green
