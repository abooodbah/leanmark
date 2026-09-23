[CmdletBinding()]
param(
    [string]$SourceDirectory,
    [switch]$OpenDefaultAppsSettings,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Centralized per-user identifiers keep registration and cleanup auditable.
$AppName = 'LeanMark'
$ExeName = 'LeanMark.exe'
$ProgId = 'LeanMark.Markdown'
$Extensions = @('.md', '.markdown', '.mdown', '.mkd')
$Capabilities = 'Software\LeanMark\Capabilities'
$AppKey = 'HKCU:\Software\LeanMark'
$Classes = 'HKCU:\Software\Classes'
$LocalData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$InstallDir = [IO.Path]::GetFullPath((Join-Path $LocalData 'Programs\LeanMark')).TrimEnd('\')
$InstalledExe = Join-Path $InstallDir $ExeName
$ManifestPath = Join-Path $InstallDir 'install-manifest.json'
$ExistingInstall = Test-Path -LiteralPath $ManifestPath -PathType Leaf

function Resolve-Payload {
    param([string]$Requested)
    $Root = Split-Path -Parent $PSScriptRoot
    $Candidates = if ($Requested) {
        @($Requested)
    } else {
        @(
            $Root,
            (Join-Path $Root 'dist'),
            (Join-Path $Root 'bin\x64\Release'),
            (Join-Path $Root 'build\bin\x64\Release'),
            (Join-Path $Root 'x64\Release'),
            (Join-Path $Root 'Release')
        )
    }
    foreach ($Candidate in $Candidates) {
        if (Test-Path -LiteralPath (Join-Path $Candidate $ExeName) -PathType Leaf) {
            return [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Candidate).Path).TrimEnd('\')
        }
    }
    throw 'LeanMark.exe was not found. Build Release or pass -SourceDirectory.'
}

function Get-DefaultState {
    param([string]$SubKey)
    $Key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($SubKey, $false)
    if ($null -eq $Key) { return [pscustomobject]@{ Present = $false; Value = $null } }
    try {
        $Present = @($Key.GetValueNames()) -contains ''
        $Value = if ($Present) { $Key.GetValue('', $null) } else { $null }
        [pscustomobject]@{ Present = $Present; Value = $Value }
    } finally { $Key.Dispose() }
}

function Set-DefaultValue {
    param([string]$SubKey, [string]$Value)
    $Key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($SubKey)
    if ($null -eq $Key) { throw 'Cannot write the per-user Classes key.' }
    try { $Key.SetValue('', $Value, [Microsoft.Win32.RegistryValueKind]::String) }
    finally { $Key.Dispose() }
}

function Ensure-RegKey {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -Path $Path -Force | Out-Null
    }
}

function Set-RegString {
    param([string]$Path, [string]$Name, [string]$Value)
    Ensure-RegKey $Path
    if ($Name) {
        New-ItemProperty -LiteralPath $Path -Name $Name -Value $Value -PropertyType String -Force | Out-Null
    } else {
        Set-Item -LiteralPath $Path -Value $Value
    }
}

function Register-Extension {
    param([string]$Extension)
    $SubKey = 'Software\Classes\' + $Extension
    $UserChoice = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $Extension + '\UserChoice'
    $OpenWith = Join-Path (Join-Path $Classes $Extension) 'OpenWithProgids'
    Ensure-RegKey $OpenWith
    New-ItemProperty -LiteralPath $OpenWith -Name $ProgId -Value '' -PropertyType String -Force | Out-Null

    # Never alter or delete protected UserChoice. Write the direct Classes
    # default only when Windows has no explicit selection for this extension.
    if (-not (Test-Path -LiteralPath $UserChoice)) {
        $Old = Get-DefaultState $SubKey
        $State = Join-Path $AppKey 'InstallState'
        $Stem = $Extension.TrimStart('.')
        Ensure-RegKey $State
        $StateItem = Get-ItemProperty -LiteralPath $State
        $HadName = $Stem + '_HadPrevious'
        $PreviousName = $Stem + '_Previous'
        $HadProperty = $StateItem.PSObject.Properties[$HadName]
        $PreviousProperty = $StateItem.PSObject.Properties[$PreviousName]
        $RecordedSelfAsPrevious =
            $null -ne $HadProperty -and [bool]$HadProperty.Value -and
            $null -ne $PreviousProperty -and
            [string]$PreviousProperty.Value -eq $ProgId

        # Repair state left by an interrupted or older LeanMark install. The
        # app's own ProgID is never a useful value to restore on uninstall.
        if ($ExistingInstall -and $Old.Present -and
            [string]$Old.Value -eq $ProgId -and
            ($null -eq $HadProperty -or $RecordedSelfAsPrevious)) {
            Set-RegString $State $PreviousName ''
            New-ItemProperty -LiteralPath $State -Name $HadName -Value 0 -PropertyType DWord -Force | Out-Null
        } elseif ($null -eq $HadProperty) {
            Set-RegString $State $PreviousName ([string]$Old.Value)
            New-ItemProperty -LiteralPath $State -Name $HadName -Value ([int]$Old.Present) -PropertyType DWord -Force | Out-Null
        }
        Set-DefaultValue $SubKey $ProgId
        return $true
    }
    return $false
}

# Notify Explorer after all registration changes are complete.
if (-not ('LeanMarkSetup.Native' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
namespace LeanMarkSetup {
 public static class Native {
    [DllImport("shell32.dll")]
  public static extern void SHChangeNotify(UInt32 e,UInt32 f,IntPtr a,IntPtr b);
    [DllImport("shlwapi.dll",CharSet=CharSet.Unicode)]
  public static extern UInt32 AssocQueryString(UInt32 f,UInt32 s,string a,string x,StringBuilder o,ref UInt32 n);
 }
}
'@
}

function Get-EffectiveExe {
    param([string]$Extension)
    $Buffer = [Text.StringBuilder]::new(2048)
    [uint32]$Length = $Buffer.Capacity
    $Result = [LeanMarkSetup.Native]::AssocQueryString(
        0, 2, $Extension, 'open', $Buffer, [ref]$Length)
    if ($Result -eq 0) { return $Buffer.ToString() }
    return $null
}

$Payload = Resolve-Payload $SourceDirectory
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$OwnedFiles = [Collections.Generic.List[string]]::new()
$PayloadNames = @(
    'LeanMark.exe',
    'WebView2Loader.dll',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'README.md'
)
foreach ($Name in $PayloadNames) {
    $Source = Join-Path $Payload $Name
    if (Test-Path -LiteralPath $Source -PathType Leaf) {
        Copy-Item -LiteralPath $Source -Destination (Join-Path $InstallDir $Name) -Force
        $OwnedFiles.Add($Name)
    } elseif ($Name -in @('LeanMark.exe', 'WebView2Loader.dll')) {
        throw ('Required payload file is missing: {0}' -f $Source)
    }
}

$AssetRoot = Join-Path $Payload 'assets'
if (Test-Path -LiteralPath $AssetRoot -PathType Container) {
    $AssetPrefix = $AssetRoot.TrimEnd('\') + '\'
    foreach ($Asset in Get-ChildItem -LiteralPath $AssetRoot -File -Recurse) {
        if ($Asset.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
        $Relative = 'assets\' + $Asset.FullName.Substring($AssetPrefix.Length)
        $Destination = Join-Path $InstallDir $Relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
        Copy-Item -LiteralPath $Asset.FullName -Destination $Destination -Force
        $OwnedFiles.Add($Relative)
    }
}

$UninstallSource = Join-Path $PSScriptRoot 'uninstall.ps1'
if (-not (Test-Path -LiteralPath $UninstallSource -PathType Leaf)) {
    throw 'installer\uninstall.ps1 is missing.'
}
Copy-Item -LiteralPath $UninstallSource -Destination (Join-Path $InstallDir 'uninstall.ps1') -Force
$OwnedFiles.Add('uninstall.ps1')

# This allow-list lets uninstall remove app-owned files without deleting an
# unknown file that the user later places in LeanMark's directory.
$Manifest = [ordered]@{
    schemaVersion = 1
    applicationId = $AppName
    installLocation = $InstallDir
    files = @($OwnedFiles | Sort-Object -Unique)
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

$Quote = [char]34
$OpenCommand = $Quote + $InstalledExe + $Quote + ' -- ' + $Quote + '%1' + $Quote
Set-RegString $AppKey 'InstallLocation' $InstallDir
Set-RegString $AppKey 'ExecutablePath' $InstalledExe
Set-RegString (Join-Path $AppKey 'Capabilities') 'ApplicationName' $AppName
Set-RegString (Join-Path $AppKey 'Capabilities') 'ApplicationDescription' 'A focused Markdown reader with offline Mermaid support.'
Set-RegString (Join-Path $AppKey 'Capabilities') 'ApplicationIcon' ($InstalledExe + ',0')
foreach ($Extension in $Extensions) {
    Set-RegString (Join-Path $AppKey 'Capabilities\FileAssociations') $Extension $ProgId
}
Set-RegString 'HKCU:\Software\RegisteredApplications' $AppName $Capabilities

$ProgPath = Join-Path $Classes $ProgId
Set-RegString $ProgPath '' 'Markdown Document'
Set-RegString (Join-Path $ProgPath 'DefaultIcon') '' ($InstalledExe + ',0')
Set-RegString (Join-Path $ProgPath 'shell\open') 'MultiSelectModel' 'Document'
Set-RegString (Join-Path $ProgPath 'shell\open\command') '' $OpenCommand

$ApplicationPath = Join-Path $Classes ('Applications\' + $ExeName)
Set-RegString $ApplicationPath 'FriendlyAppName' $AppName
Set-RegString (Join-Path $ApplicationPath 'shell\open\command') '' $OpenCommand
foreach ($Extension in $Extensions) {
    Set-RegString (Join-Path $ApplicationPath 'SupportedTypes') $Extension ''
}

$AppPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\LeanMark.exe'
Set-RegString $AppPath '' $InstalledExe
Set-RegString $AppPath 'Path' $InstallDir

$Direct = [Collections.Generic.List[string]]::new()
foreach ($Extension in $Extensions) {
    if (Register-Extension $Extension) { $Direct.Add($Extension) }
}

$StartMenu = [Environment]::GetFolderPath([Environment+SpecialFolder]::StartMenu)
$ShortcutPath = Join-Path $StartMenu 'Programs\LeanMark.lnk'
$Shell = New-Object -ComObject WScript.Shell
try {
    $Shortcut = $Shell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = $InstalledExe
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description = 'Open Markdown files with LeanMark'
    $Shortcut.IconLocation = $InstalledExe + ',0'
    $Shortcut.Save()
} finally {
    if ($null -ne $Shell) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Shell)
    }
}

$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LeanMark'
$InstalledUninstaller = Join-Path $InstallDir 'uninstall.ps1'
$UninstallCommand = $Quote + (Join-Path $PSHOME 'powershell.exe') + $Quote +
    ' -NoProfile -ExecutionPolicy Bypass -File ' + $Quote + $InstalledUninstaller + $Quote
$Version = [Diagnostics.FileVersionInfo]::GetVersionInfo($InstalledExe).ProductVersion
if (-not $Version) { $Version = '0.3.0' }
Set-RegString $UninstallKey 'DisplayName' $AppName
Set-RegString $UninstallKey 'DisplayVersion' $Version
Set-RegString $UninstallKey 'DisplayIcon' ($InstalledExe + ',0')
Set-RegString $UninstallKey 'Publisher' 'LeanMark contributors'
Set-RegString $UninstallKey 'InstallLocation' $InstallDir
Set-RegString $UninstallKey 'UninstallString' $UninstallCommand
Set-RegString $UninstallKey 'QuietUninstallString' ($UninstallCommand + ' -Quiet')
New-ItemProperty -LiteralPath $UninstallKey -Name 'NoModify' -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -LiteralPath $UninstallKey -Name 'NoRepair' -Value 1 -PropertyType DWord -Force | Out-Null

[LeanMarkSetup.Native]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Start-Sleep -Milliseconds 300
$Status = foreach ($Extension in $Extensions) {
    $Effective = Get-EffectiveExe $Extension
    $IsDefault = $false
    if ($Effective) {
        try {
            $IsDefault = [IO.Path]::GetFullPath($Effective).Equals(
                $InstalledExe, [StringComparison]::OrdinalIgnoreCase)
        } catch { $IsDefault = $false }
    }
    [pscustomobject]@{
        Extension = $Extension
        IsDefault = $IsDefault
        EffectiveExecutable = $Effective
    }
}
$Missing = @($Status | Where-Object { -not $_.IsDefault })
Write-Host ('LeanMark installed to {0}' -f $InstallDir)
$Status | Format-Table -AutoSize | Out-Host

if ($Missing.Count -gt 0) {
    Write-Warning ('Windows still uses another app for: {0}. UserChoice was preserved.' -f ($Missing.Extension -join ', '))
    $Launch = $OpenDefaultAppsSettings.IsPresent
    if (-not $Launch -and -not $Quiet -and $Host.Name -eq 'ConsoleHost') {
        try {
            if (-not [Console]::IsInputRedirected) {
                $Launch = (Read-Host 'Open Windows Default Apps for LeanMark? [y/N]') -match '^(?i:y|yes)$'
            }
        } catch { $Launch = $false }
    }
    if ($Launch) {
        try {
            Start-Process 'ms-settings:defaultapps?registeredAppUser=LeanMark' | Out-Null
        } catch {
            Start-Process 'ms-settings:defaultapps' | Out-Null
        }
    } else {
        Write-Host 'Finish later in Windows Settings > Apps > Default apps > LeanMark.'
    }
} else {
    Write-Host 'LeanMark is the effective default for all registered Markdown extensions.'
}
