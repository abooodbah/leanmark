[CmdletBinding()]
param(
    [string]$DistPath,
    [switch]$Runtime,
    [switch]$Dom,
    [switch]$Registry,
    [switch]$RequireDefaultAssociation,
    [ValidateRange(1, 100)][double]$MaxDistributionMiB = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$testsRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $testsRoot))
if ([string]::IsNullOrWhiteSpace($DistPath)) { $DistPath = Join-Path $repoRoot 'dist' }
$resolvedDist = [System.IO.Path]::GetFullPath($DistPath)
Import-Module (Join-Path $testsRoot 'TestSupport.psm1') -Force

function Test-PeHeader {
    param([Parameter(Mandatory = $true)][string]$Path)
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try { return $stream.ReadByte() -eq 0x4D -and $stream.ReadByte() -eq 0x5A }
    finally { $stream.Dispose() }
}

function Test-StaticInvariants {
    $markdownPath = Join-Path $repoRoot 'src\Markdown.cpp'
    $markdownHeaderPath = Join-Path $repoRoot 'src\Markdown.h'
    $appPath = Join-Path $repoRoot 'src\App.cpp'
    $mainPath = Join-Path $repoRoot 'src\main.cpp'
    $manifestPath = Join-Path $repoRoot 'src\LeanMark.manifest'
    $htmlPath = Join-Path $repoRoot 'assets\reader.html'
    $scriptPath = Join-Path $repoRoot 'assets\reader.js'
    $installerPath = Join-Path $repoRoot 'installer\install.ps1'
    $uninstallerPath = Join-Path $repoRoot 'installer\uninstall.ps1'

    $markdown = Read-TextFile $markdownPath
    $markdownHeader = Read-TextFile $markdownHeaderPath
    $app = Read-TextFile $appPath
    $main = Read-TextFile $mainPath
    $manifestText = Read-TextFile $manifestPath
    $html = Read-TextFile $htmlPath
    $reader = Read-TextFile $scriptPath
    $installer = Read-TextFile $installerPath
    $uninstaller = Read-TextFile $uninstallerPath

    Assert-Match $markdown 'MD_DIALECT_GITHUB\s*\|\s*MD_FLAG_NOHTML' 'Markdown must use GFM with raw HTML disabled.'
    Assert-Match $markdownHeader 'kMaximumDocumentBytes\s*=\s*32ull\s*\*\s*1024ull\s*\*\s*1024ull' 'The native parser must retain its 32 MiB safety limit.'
    Assert-Match $markdown 'HasUtf8Bom' 'UTF-8 BOM handling must not regress.'
    Write-TestPass 'GFM, raw-HTML, encoding, and document-size parser guards'

    try { [void]([xml]$manifestText) }
    catch { throw "LeanMark.manifest is not well-formed XML: $($_.Exception.Message)" }
    Assert-Match $manifestText 'level\s*=\s*"asInvoker"' 'LeanMark must run as the current user without elevation.'
    Assert-Match $manifestText 'PerMonitorV2' 'The application manifest must retain per-monitor DPI awareness.'
    Assert-Match $manifestText '<longPathAware[^>]*>\s*true\s*</longPathAware>' 'Long Windows paths must remain enabled.'
    Write-TestPass 'well-formed, non-elevating, DPI-aware application manifest'

    $cspMatch = [regex]::Match($html, '(?is)http-equiv\s*=\s*"Content-Security-Policy"\s+content\s*=\s*"([^"]+)"')
    Assert-True $cspMatch.Success 'reader.html must contain a CSP meta element before runtime scripts.'
    $csp = $cspMatch.Groups[1].Value
    foreach ($directive in @(
        "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
        "font-src 'self'", "img-src 'self' https://doc.leanmark.invalid data:",
        "connect-src 'none'", "object-src 'none'", "frame-src 'none'",
        "form-action 'none'", "base-uri 'none'"
    )) {
        Assert-True $csp.Contains($directive) "CSP directive is missing or weakened: $directive"
    }
    Assert-NotMatch $csp "script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')" 'Runtime scripts must never allow unsafe-inline or unsafe-eval.'
    Assert-Match $html '<script\s+src="/reader\.js"\s+defer' 'The renderer entry script must be a bundled local file.'
    Assert-Match $html '<link\s+rel="stylesheet"\s+href="/reader\.css"' 'The stylesheet must be a bundled local file.'
    Write-TestPass 'fail-closed renderer Content Security Policy and local entry assets'

    Assert-Match $reader 'securityLevel\s*:\s*["'']strict["'']' 'Mermaid must retain strict security mode.'
    Assert-Match $reader 'https://doc\.leanmark\.invalid/' 'Relative images must resolve through the document virtual host.'
    Assert-Match $reader 'Remote image blocked' 'Remote image replacement must remain explicit.'
    Assert-True $reader.Contains('^data:image\/(png|jpeg|gif|webp);base64,') 'Only the intended raster data-image allowlist may bypass local mapping.'
    Assert-Match $reader 'source\.length\s*>\s*100000' 'Individual Mermaid sources must retain their 100 KB limit.'
    Assert-Match $reader 'index\s*>?=\s*50' 'Documents must retain the 50-diagram cap.'
    Assert-Match $reader 'dataset\.renderState\s*=\s*["'']ready["'']' 'DOM tests need the explicit ready state.'
    Write-TestPass 'strict, bounded, local-only Mermaid and image preparation'

    Assert-Match $app 'kAppOrigin\[\].*https://app\.leanmark\.invalid/' 'The trusted application origin changed unexpectedly.'
    Assert-Match $app 'kDocumentHost\[\].*doc\.leanmark\.invalid' 'The document asset origin changed unexpectedly.'
    Assert-True ([regex]::Matches($app, 'COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS').Count -ge 2) 'Both virtual-host mappings must deny CORS.'
    foreach ($guard in @(
        'put_AreDevToolsEnabled\(FALSE\)',
        'put_AreDefaultScriptDialogsEnabled\(FALSE\)',
        'add_NavigationStarting',
        'add_NewWindowRequested',
        'put_Handled\(TRUE\)',
        'add_PermissionRequested',
        'COREWEBVIEW2_PERMISSION_STATE_DENY',
        'add_DownloadStarting'
    )) { Assert-Match $app $guard "WebView2 guard is missing: $guard" }
    Assert-Match $app '(?s)add_DownloadStarting.*?put_Cancel\(TRUE\)' 'WebView2 downloads must be cancelled.'
    Assert-Match $app 'SetCurrentProcessExplicitAppUserModelID\(L"LeanMark\.Reader"\)' 'The explicit AppUserModelID must remain stable.'
    Assert-Match $app 'ShellExecuteW\(window_,\s*L"open",\s*href\.c_str\(\),\s*nullptr' 'External links must use ShellExecuteW directly, never a command shell.'
    Assert-Match $app 'Absolute local links are blocked for safety' 'Absolute local links must remain blocked.'
    Write-TestPass 'native WebView2 origin, navigation, permission, download, and link guards'

    Assert-Match $main 'CommandLineToArgvW' 'Windows command lines must use the system parser.'
    Assert-Match $main 'argument\s*==\s*L"--"' 'The option terminator must be supported for dash-prefixed file names.'
    Assert-Match $main 'CreateProcessW' 'Multi-document launches must create isolated reader processes.'
    Assert-Match $main 'QuoteArgument\(executable\)\s*\+\s*L" -- "' 'Child launches must preserve the option terminator.'
    Write-TestPass 'quoted single- and multi-document command-line handling'

    Assert-Match $installer '\$ProgId\s*=\s*''LeanMark\.Markdown''' 'Installer ProgID is missing or inconsistent.'
    Assert-Match $installer '\$Capabilities\s*=\s*''Software\\LeanMark\\Capabilities''' 'Installer capabilities path is missing.'
    Assert-Match $installer "LocalApplicationData" 'Installation must target the current user LocalAppData.'
    Assert-Match $installer "'\.md',\s*'\.markdown',\s*'\.mdown',\s*'\.mkd'" 'Installer extension coverage differs from the reader.'
    Assert-Match $installer 'OpenWithProgids' 'Installer must register Open With candidacy.'
    Assert-Match $installer 'RegisteredApplications' 'Installer must register Default Apps capabilities.'
    Assert-Match $installer 'MultiSelectModel' 'Installer must declare an explicit Shell multi-select model.'
    Assert-Match $installer 'Document' 'The v1 Shell multi-select model must be Document.'
    Assert-Match $installer 'SHChangeNotify|SHCNE_ASSOCCHANGED' 'Installer must notify Explorer after association changes.'
    Assert-Match $installer 'registeredAppUser=LeanMark' 'Installer must deep-link to the per-user Default Apps page.'
    Assert-Match $installer '\$OpenCommand\s*=.*'' -- ''' 'File associations must preserve the option terminator.'
    Assert-Match $installer 'function\s+Ensure-RegKey' 'Installer must preserve existing registry keys and values.'
    Assert-Match $installer '(?s)\$OpenWith\s*=.*?Ensure-RegKey\s+\$OpenWith' 'Shared Open With keys must be opened without recreating them.'
    Assert-Match $installer '(?s)\$State\s*=.*?Ensure-RegKey\s+\$State' 'Rollback state must survive registration of every extension.'
    Assert-True (
        $installer.IndexOf('function Set-RegString', [StringComparison]::Ordinal) -lt
        $installer.IndexOf('Set-RegString $AppKey', [StringComparison]::Ordinal)
    ) 'Set-RegString must be defined before top-level registration begins.'
    Assert-NotMatch $installer '(?i)HKLM:|HKEY_LOCAL_MACHINE|SetUserFTA|\bDISM\b|\bftype\b|\bassoc(?:\.exe)?\b' 'The per-user installer contains a machine-wide or unsupported association mechanism.'

    # UserChoice is protected by Windows. Allow only its declaration and a
    # read-only Test-Path consent check anywhere in the installer.
    $userChoiceLines = @($installer -split "`r?`n" | Where-Object {
        $_ -match '\$UserChoice' -and $_.TrimStart() -notmatch '^#'
    })
    Assert-True ($userChoiceLines.Count -gt 0) 'Installer must explicitly document/check the protected UserChoice boundary.'
    foreach ($line in $userChoiceLines) {
        Assert-Match $line '^\s*\$UserChoice\s*=|Test-Path\s+-LiteralPath\s+\$UserChoice' "UserChoice may only be declared or queried, never mutated: $line"
    }
    Assert-NotMatch $uninstaller '(?i)HKLM:|HKEY_LOCAL_MACHINE|SetUserFTA|Explorer\\FileExts\\[^\r\n]*UserChoice' 'The uninstaller contains a machine-wide or protected UserChoice operation.'
    Assert-Match $uninstaller 'Remove only LeanMark''s value from the shared OpenWithProgids key' 'Shared OpenWith cleanup must remain value-scoped.'
    Assert-Match $uninstaller 'Resolve-OwnedFile' 'Uninstall file deletion must pass through the owned-path resolver.'
    Assert-Match $uninstaller 'ReparsePoint' 'Uninstall must reject reparse-point traversal.'
    Assert-Match $uninstaller '(?s)schemaVersion.*applicationId.*InstallDir' 'The uninstall manifest must be identity and location checked.'
    Assert-NotMatch $uninstaller '(?im)^\s*Remove-Item[^\r\n]*\$InstallDir[^\r\n]*-Recurse|^\s*Remove-Item[^\r\n]*-Recurse[^\r\n]*\$InstallDir' 'Uninstall must never recursively delete the install directory.'

    # PowerShell's parser treats Add-Type source as an opaque string. Compile each
    # embedded C# block so malformed DllImport declarations fail before install.
    foreach ($scriptCase in @(
        [pscustomobject]@{ Name = 'installer'; Text = $installer },
        [pscustomobject]@{ Name = 'uninstaller'; Text = $uninstaller }
    )) {
        $blocks = [regex]::Matches($scriptCase.Text, "(?s)Add-Type\s+-TypeDefinition\s+@'\s*(.*?)\s*'@")
        Assert-True ($blocks.Count -ge 1) "$($scriptCase.Name) must contain its Shell notification Add-Type block."
        foreach ($block in $blocks) {
            try { Add-Type -TypeDefinition $block.Groups[1].Value -ErrorAction Stop }
            catch { throw ("Embedded C# in {0} does not compile: {1}" -f $scriptCase.Name, $_.Exception.Message) }
        }
    }
    Write-TestPass 'per-user installer and bounded, consent-preserving uninstaller invariants'
}

function Test-Distribution {
    Assert-True (Test-Path -LiteralPath $resolvedDist -PathType Container) "Distribution is missing: $resolvedDist. Run scripts\build.ps1 first."
    $required = @(
        'LeanMark.exe', 'WebView2Loader.dll',
        'assets\reader.html', 'assets\reader.css', 'assets\reader.js',
        'assets\vendor\mermaid.min.js',
        'assets\fonts\ibm-plex-sans-latin-400-normal.woff2',
        'assets\fonts\ibm-plex-sans-latin-500-normal.woff2',
        'assets\fonts\ibm-plex-sans-latin-600-normal.woff2',
        'assets\fonts\ibm-plex-serif-latin-600-normal.woff2',
        'assets\fonts\ibm-plex-mono-latin-400-normal.woff2',
        'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md'
    )
    foreach ($relative in $required) {
        $path = Join-Path $resolvedDist $relative
        Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "Required distribution file is missing: $relative"
        Assert-True ((Get-Item -LiteralPath $path).Length -gt 0) "Distribution file is empty: $relative"
    }
    Assert-True (Test-PeHeader (Join-Path $resolvedDist 'LeanMark.exe')) 'LeanMark.exe does not have a PE MZ header.'
    Assert-True (Test-PeHeader (Join-Path $resolvedDist 'WebView2Loader.dll')) 'WebView2Loader.dll does not have a PE MZ header.'

    $files = @(Get-ChildItem -LiteralPath $resolvedDist -Recurse -File)
    $bytes = [int64](($files | Measure-Object -Property Length -Sum).Sum)
    Assert-True ($bytes -le $MaxDistributionMiB * 1MB) ("Distribution is {0:N2} MiB, over the {1:N2} MiB gate." -f ($bytes / 1MB), $MaxDistributionMiB)
    $forbidden = @($files | Where-Object {
        $_.Extension -in @('.pdb', '.obj', '.lib', '.exp', '.ilk', '.map') -or
        $_.FullName -match '[\\/]node_modules[\\/]'
    })
    $forbiddenNames = @($forbidden | ForEach-Object { $_.FullName }) -join ', '
    Assert-Equal $forbidden.Count 0 ('Developer/build artifacts leaked into dist: ' + $forbiddenNames)

    foreach ($entryAsset in @('reader.html', 'reader.css', 'reader.js')) {
        $source = Join-Path (Join-Path $repoRoot 'assets') $entryAsset
        $staged = Join-Path (Join-Path $resolvedDist 'assets') $entryAsset
        Assert-Equal (Read-TextFile $staged) (Read-TextFile $source) "Staged $entryAsset differs from its audited source."
    }
    $css = Read-TextFile (Join-Path $resolvedDist 'assets\reader.css')
    foreach ($match in [regex]::Matches($css, 'url\(\s*["'']?([^\)"'']+)["'']?\s*\)')) {
        $reference = $match.Groups[1].Value.Trim()
        if ($reference -match '^(?:data:|https?:|/)') { continue }
        Assert-True (Test-Path -LiteralPath (Join-Path (Join-Path $resolvedDist 'assets') $reference) -PathType Leaf) "CSS asset reference is missing from dist: $reference"
    }
    Write-TestPass ("complete, clean distribution ({0} files, {1:N2} MiB)" -f $files.Count, ($bytes / 1MB))
}

function Assert-RegistryString {
    param([string]$SubKey, [string]$Name, [string]$Expected)
    $state = Get-RegistryValueState -Hive CurrentUser -SubKey $SubKey -Name $Name
    $displayName = if ($Name) { $Name } else { '(Default)' }
    Assert-True $state.Exists "Registry value is missing: HKCU\$SubKey [$displayName]"
    Assert-Equal ([string]$state.Value) $Expected "Registry value differs: HKCU\$SubKey [$displayName]."
}

function Test-InstalledRegistry {
    $localData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    $installedExe = [System.IO.Path]::GetFullPath((Join-Path $localData 'Programs\LeanMark\LeanMark.exe'))
    Assert-True (Test-Path -LiteralPath $installedExe -PathType Leaf) "Installed executable is missing: $installedExe"

    $progId = 'LeanMark.Markdown'
    $progKey = 'Software\Classes\LeanMark.Markdown'
    Assert-RegistryString $progKey '' 'Markdown Document'
    Assert-RegistryString ($progKey + '\shell\open') 'MultiSelectModel' 'Document'
    Assert-RegistryString ($progKey + '\shell\open\command') '' ('"{0}" -- "%1"' -f $installedExe)
    $icon = Get-RegistryValueState -Hive CurrentUser -SubKey ($progKey + '\DefaultIcon') -Name ''
    Assert-True $icon.Exists 'LeanMark DefaultIcon is not registered.'
    Assert-True ([string]$icon.Value).Contains($installedExe) 'LeanMark DefaultIcon does not point at the installed executable.'

    Assert-RegistryString 'Software\RegisteredApplications' 'LeanMark' 'Software\LeanMark\Capabilities'
    Assert-RegistryString 'Software\LeanMark\Capabilities' 'ApplicationName' 'LeanMark'
    $description = Get-RegistryValueState -Hive CurrentUser -SubKey 'Software\LeanMark\Capabilities' -Name 'ApplicationDescription'
    Assert-True ($description.Exists -and -not [string]::IsNullOrWhiteSpace([string]$description.Value)) 'Default Apps registration needs a non-empty description.'

    foreach ($extension in @('.md', '.markdown', '.mdown', '.mkd')) {
        Assert-RegistryString 'Software\LeanMark\Capabilities\FileAssociations' $extension $progId
        $openWith = Get-RegistryValueState -Hive CurrentUser -SubKey ("Software\Classes\{0}\OpenWithProgids" -f $extension) -Name $progId
        Assert-True $openWith.Exists "Open With registration is missing for $extension."
        $supported = Get-RegistryValueState -Hive CurrentUser -SubKey 'Software\Classes\Applications\LeanMark.exe\SupportedTypes' -Name $extension
        Assert-True $supported.Exists "Applications\LeanMark.exe SupportedTypes is missing $extension."
    }
    Assert-RegistryString 'Software\Classes\Applications\LeanMark.exe\shell\open\command' '' ('"{0}" -- "%1"' -f $installedExe)

    foreach ($machineKey in @('Software\LeanMark', 'Software\Classes\LeanMark.Markdown')) {
        $state = Get-RegistryValueState -Hive LocalMachine -SubKey $machineKey -Name ''
        Assert-True (-not $state.KeyExists) "Per-user install unexpectedly created HKLM\$machineKey."
    }

    $choice = Get-RegistryValueState -Hive CurrentUser -SubKey 'Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice' -Name 'ProgId'
    if ($choice.Exists) { Write-TestNote ("Windows .md UserChoice is {0}; this test never changes it." -f $choice.Value) }
    else { Write-TestNote 'Windows has no explicit .md UserChoice; this test never creates one.' }

    if ($RequireDefaultAssociation) {
        $effective = Resolve-EffectiveAssociationExecutable -Extension '.md'
        Assert-True (-not [string]::IsNullOrWhiteSpace($effective)) 'Windows did not resolve an effective executable for .md.'
        Assert-Equal ([System.IO.Path]::GetFullPath($effective)) $installedExe 'LeanMark is registered but is not the effective .md default.'
        Write-TestPass 'user-consented effective .md association resolves to LeanMark'
    }
    Write-TestPass 'per-user installed registry state (read-only verification)'
}

function Test-RuntimeWindow {
    $exe = Join-Path $resolvedDist 'LeanMark.exe'
    $showcase = Join-Path $testsRoot 'fixtures\showcase.md'
    $linked = Join-Path $testsRoot 'fixtures\linked-document.md'

    $single = Start-LeanMarkProcess -ExePath $exe -DocumentPaths @($showcase)
    try {
        $window = Wait-LeanMarkWindow -Process $single
        Assert-Equal (Get-LeanMarkWindowClass $window) 'LeanMark.Reader.Window' 'Unexpected main-window class.'
        $single.Refresh()
        Assert-Match $single.MainWindowTitle 'showcase\.md.*LeanMark' 'The document window title does not identify the opened file.'
        Start-Sleep -Milliseconds 750
        $descendants = @(Get-LeanMarkProcessTreeIds -RootProcessId $single.Id)
        Assert-True ($descendants.Count -ge 2) 'No WebView2 descendant process appeared for the document window.'
        Write-TestPass 'built executable launch, visible native window, title, and WebView2 process tree'
    } finally {
        Stop-LeanMarkTestProcessTree -RootProcess $single
    }

    $multi = Start-LeanMarkProcess -ExePath $exe -DocumentPaths @($showcase, $linked)
    try {
        [void](Wait-LeanMarkWindow -Process $multi)
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        $hosts = @()
        do {
            $hosts = @()
            foreach ($processId in @(Get-LeanMarkProcessTreeIds -RootProcessId $multi.Id)) {
                $candidate = Get-Process -Id $processId -ErrorAction SilentlyContinue
                if ($null -ne $candidate -and $candidate.ProcessName -eq 'LeanMark') {
                    $candidate.Refresh()
                    if ($candidate.MainWindowHandle -ne [IntPtr]::Zero) { $hosts += $candidate }
                }
            }
            if ($hosts.Count -lt 2) { Start-Sleep -Milliseconds 100 }
        } while ($hosts.Count -lt 2 -and [DateTime]::UtcNow -lt $deadline)
        Assert-True ($hosts.Count -eq 2) "Expected two LeanMark document windows; found $($hosts.Count)."
        $titles = @($hosts | ForEach-Object { $_.Refresh(); $_.MainWindowTitle })
        Assert-True (@($titles | Where-Object { $_ -match 'showcase\.md.*LeanMark' }).Count -eq 1) 'Multi-file launch lost the showcase document.'
        Assert-True (@($titles | Where-Object { $_ -match 'linked-document\.md.*LeanMark' }).Count -eq 1) 'Multi-file launch lost the linked document.'
        Write-TestPass 'two-path launch creates exactly one isolated window for each document'
    } finally {
        Stop-LeanMarkTestProcessTree -RootProcess $multi
    }
}

try {
    Write-TestNote "Repository: $repoRoot"
    Write-TestNote "Distribution: $resolvedDist"
    Test-StaticInvariants
    Test-Distribution

    if ($RequireDefaultAssociation -and -not $Registry) {
        throw '-RequireDefaultAssociation requires -Registry.'
    }
    if ($Registry) { Test-InstalledRegistry }
    else { Write-TestNote 'Registry checks skipped. Add -Registry after running the per-user installer.' }

    if ($Runtime -or $Dom) { Test-RuntimeWindow }
    else { Write-TestNote 'Window launch checks skipped. Add -Runtime to opt in.' }

    if ($Dom) {
        & (Join-Path $testsRoot 'Invoke-DomSmoke.ps1') -ExePath (Join-Path $resolvedDist 'LeanMark.exe')
    } else {
        Write-TestNote 'WebView/CDP DOM checks skipped. Add -Dom to opt in.'
    }
    Write-Host 'LeanMark verification completed successfully.' -ForegroundColor Green
} catch {
    Write-Error ("LeanMark verification failed: {0}" -f $_.Exception.Message)
    exit 1
}
