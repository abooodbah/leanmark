Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Dependency-free helpers for Windows PowerShell 5.1 and PowerShell 7. All
# registry and native API helpers below are read-only.

function Assert-True {
    param([bool]$Condition, [Parameter(Mandatory = $true)][string]$Message)
    if (-not $Condition) { throw [System.InvalidOperationException]::new($Message) }
}

function Assert-Equal {
    param([AllowNull()]$Actual, [AllowNull()]$Expected,
          [Parameter(Mandatory = $true)][string]$Message)
    if ($Actual -ne $Expected) {
        throw [System.InvalidOperationException]::new(
            ('{0} Expected <{1}> but found <{2}>.' -f $Message, $Expected, $Actual))
    }
}

function Assert-Match {
    param([string]$Text, [string]$Pattern,
          [Parameter(Mandatory = $true)][string]$Message)
    if ($Text -notmatch $Pattern) { throw [System.InvalidOperationException]::new($Message) }
}

function Assert-NotMatch {
    param([string]$Text, [string]$Pattern,
          [Parameter(Mandatory = $true)][string]$Message)
    if ($Text -match $Pattern) { throw [System.InvalidOperationException]::new($Message) }
}

function Read-TextFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    Assert-True (Test-Path -LiteralPath $Path -PathType Leaf) "Required file is missing: $Path"
    [System.IO.File]::ReadAllText([System.IO.Path]::GetFullPath($Path))
}

function Write-TestPass {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ('PASS  ' + $Message) -ForegroundColor Green
}

function Write-TestNote {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ('INFO  ' + $Message) -ForegroundColor Cyan
}

function Get-RegistryValueState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('CurrentUser', 'LocalMachine')][string]$Hive,
        [Parameter(Mandatory = $true)][string]$SubKey,
        [AllowEmptyString()][string]$Name = ''
    )
    $root = if ($Hive -eq 'CurrentUser') {
        [Microsoft.Win32.Registry]::CurrentUser
    } else {
        [Microsoft.Win32.Registry]::LocalMachine
    }
    $key = $root.OpenSubKey($SubKey, $false)
    if ($null -eq $key) {
        return [pscustomobject]@{ KeyExists = $false; Exists = $false; Value = $null; Kind = $null }
    }
    try {
        $exists = @($key.GetValueNames()) -contains $Name
        [pscustomobject]@{
            KeyExists = $true
            Exists = $exists
            Value = if ($exists) { $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { $null }
            Kind = if ($exists) { $key.GetValueKind($Name) } else { $null }
        }
    } finally { $key.Dispose() }
}

function Initialize-LeanMarkNativeHelpers {
    if ('LeanMark.Tests.NativeMethods' -as [type]) { return }
    # Toolhelp avoids WMI/CIM. AssocQueryString resolves the effective Shell
    # handler rather than guessing from one registry location.
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace LeanMark.Tests
{
    public static class NativeMethods
    {
        private const uint TH32CS_SNAPPROCESS = 0x00000002;
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct PROCESSENTRY32
        {
            public uint dwSize; public uint cntUsage; public uint th32ProcessID;
            public UIntPtr th32DefaultHeapID; public uint th32ModuleID;
            public uint cntThreads; public uint th32ParentProcessID;
            public int pcPriClassBase; public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
        }
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr handle);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern int GetClassNameW(IntPtr window, StringBuilder className, int maximumCount);
        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindowVisible(IntPtr window);
        [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
        public static extern int AssocQueryStringW(uint flags, uint associationString,
            string association, string extra, StringBuilder output, ref uint characterCount);
        public static Dictionary<int, int> GetParentProcessMap()
        {
            IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (snapshot == new IntPtr(-1))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try
            {
                Dictionary<int, int> result = new Dictionary<int, int>();
                PROCESSENTRY32 entry = new PROCESSENTRY32();
                entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                if (Process32FirstW(snapshot, ref entry))
                {
                    do
                    {
                        result[(int)entry.th32ProcessID] = (int)entry.th32ParentProcessID;
                        entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                    } while (Process32NextW(snapshot, ref entry));
                }
                return result;
            }
            finally { CloseHandle(snapshot); }
        }
    }
}
"@
}

function Get-LeanMarkProcessTreeIds {
    param([Parameter(Mandatory = $true)][int]$RootProcessId)
    Initialize-LeanMarkNativeHelpers
    $parentMap = [LeanMark.Tests.NativeMethods]::GetParentProcessMap()
    $found = [System.Collections.Generic.HashSet[int]]::new()
    [void]$found.Add($RootProcessId)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($entry in $parentMap.GetEnumerator()) {
            if ($found.Contains([int]$entry.Value) -and $found.Add([int]$entry.Key)) {
                $changed = $true
            }
        }
    }
    @($found)
}

function Start-LeanMarkProcess {
    param(
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][string[]]$DocumentPaths
    )
    $resolvedExe = [System.IO.Path]::GetFullPath($ExePath)
    Assert-True (Test-Path -LiteralPath $resolvedExe -PathType Leaf) "LeanMark executable is missing: $resolvedExe"
    foreach ($document in $DocumentPaths) {
        Assert-True (Test-Path -LiteralPath $document -PathType Leaf) "Test document is missing: $document"
        Assert-True (-not $document.Contains('"')) "A Windows test path unexpectedly contains a quote: $document"
    }
    $quotedDocuments = @($DocumentPaths | ForEach-Object {
        '"{0}"' -f ([System.IO.Path]::GetFullPath($_))
    })
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $resolvedExe
    $startInfo.Arguments = '-- ' + ($quotedDocuments -join ' ')
    $startInfo.UseShellExecute = $false
    $startInfo.WorkingDirectory = Split-Path -Parent $resolvedExe
    $process = [System.Diagnostics.Process]::Start($startInfo)
    Assert-True ($null -ne $process) 'Windows did not return a process for LeanMark.'
    $process
}

function Wait-LeanMarkWindow {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [int]$TimeoutSeconds = 20
    )
    Initialize-LeanMarkNativeHelpers
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "LeanMark exited before creating a window (exit code $($Process.ExitCode))."
        }
        if ($Process.MainWindowHandle -ne [IntPtr]::Zero -and
            [LeanMark.Tests.NativeMethods]::IsWindowVisible($Process.MainWindowHandle)) {
            return $Process.MainWindowHandle
        }
        Start-Sleep -Milliseconds 50
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "LeanMark did not create a visible main window within $TimeoutSeconds seconds."
}

function Get-LeanMarkWindowClass {
    param([Parameter(Mandatory = $true)][IntPtr]$WindowHandle)
    Initialize-LeanMarkNativeHelpers
    $buffer = [System.Text.StringBuilder]::new(256)
    $length = [LeanMark.Tests.NativeMethods]::GetClassNameW($WindowHandle, $buffer, $buffer.Capacity)
    Assert-True ($length -gt 0) 'GetClassNameW failed for the LeanMark window.'
    $buffer.ToString()
}

function Stop-LeanMarkTestProcessTree {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$RootProcess,
        [int]$GraceSeconds = 3
    )
    # Never stop by image name. Only the exact PID tree created by this test is
    # eligible for cleanup, leaving unrelated LeanMark/WebView2 sessions alone.
    $ownedIds = @(Get-LeanMarkProcessTreeIds -RootProcessId $RootProcess.Id)
    try {
        $RootProcess.Refresh()
        if (-not $RootProcess.HasExited -and $RootProcess.MainWindowHandle -ne [IntPtr]::Zero) {
            [void]$RootProcess.CloseMainWindow()
            [void]$RootProcess.WaitForExit($GraceSeconds * 1000)
        }
    } catch { Write-Verbose "Graceful LeanMark close failed: $($_.Exception.Message)" }
    # Give WebView2 time to flush and release its shared user-data directory.
    # Force-killing the browser immediately can make the next measured launch
    # wait on stale profile locks and corrupt the startup sample.
    $childDeadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
        $stillRunning = @($ownedIds | Where-Object {
            $null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)
        })
        if ($stillRunning.Count -gt 0) { Start-Sleep -Milliseconds 100 }
    } while ($stillRunning.Count -gt 0 -and [DateTime]::UtcNow -lt $childDeadline)
    $ownedIds = @($ownedIds + (Get-LeanMarkProcessTreeIds -RootProcessId $RootProcess.Id) | Sort-Object -Unique)
    foreach ($processId in ($ownedIds | Sort-Object -Descending)) {
        if ($null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-LeanMarkProcessSample {
    param([Parameter(Mandatory = $true)][int]$RootProcessId)
    $ids = @(Get-LeanMarkProcessTreeIds -RootProcessId $RootProcessId)
    $workingSet = [int64]0; $privateBytes = [int64]0
    $handles = 0; $threads = 0; $cpuSeconds = 0.0; $liveIds = @()
    foreach ($processId in $ids) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -eq $process) { continue }
        try {
            $process.Refresh()
            $workingSet += [int64]$process.WorkingSet64
            $privateBytes += [int64]$process.PrivateMemorySize64
            $handles += [int]$process.HandleCount
            $threads += [int]$process.Threads.Count
            $cpuSeconds += [double]$process.TotalProcessorTime.TotalSeconds
            $liveIds += [int]$process.Id
        } catch { }
    }
    [pscustomobject]@{
        TimestampUtc = [DateTime]::UtcNow.ToString('o')
        ProcessIds = @($liveIds)
        ProcessCount = @($liveIds).Count
        WorkingSetBytes = $workingSet
        PrivateBytes = $privateBytes
        HandleCount = $handles
        ThreadCount = $threads
        CpuSeconds = $cpuSeconds
    }
}

function Resolve-EffectiveAssociationExecutable {
    param([string]$Extension = '.md')
    Initialize-LeanMarkNativeHelpers
    # ASSOCF_VERIFY = 0x40; ASSOCSTR_EXECUTABLE = 2.
    [uint32]$characters = 0
    [void][LeanMark.Tests.NativeMethods]::AssocQueryStringW(
        0x40, 2, $Extension, 'open', $null, [ref]$characters)
    if ($characters -eq 0) { return $null }
    $output = [System.Text.StringBuilder]::new([int]$characters)
    $result = [LeanMark.Tests.NativeMethods]::AssocQueryStringW(
        0x40, 2, $Extension, 'open', $output, [ref]$characters)
    if ($result -ne 0) { return $null }
    $output.ToString()
}

# DevTools helpers for a WebView2 started with a loopback debugging port.
function Get-FreeLoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Wait-CdpPageTarget {
    param([int]$Port, [int]$Seconds)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    $lastUrls = @()
    do {
        try {
            $response = Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/json/list" -f $Port) -TimeoutSec 2
            # Windows PowerShell 5.1 wraps a top-level JSON array in a `value`
            # property, while PowerShell 7 returns the array directly.
            $wrappedValue = $response.PSObject.Properties['value']
            $targets = if ($null -ne $wrappedValue) { @($wrappedValue.Value) } else { @($response) }
            $lastUrls = @($targets | ForEach-Object { $_.url })
            $target = $targets | Where-Object {
                $_.type -eq 'page' -and $_.url -like 'https://app.leanmark.invalid/*'
            } | Select-Object -First 1
            if ($null -ne $target -and -not [string]::IsNullOrWhiteSpace($target.webSocketDebuggerUrl)) {
                return $target
            }
        } catch { }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw ("WebView2 did not expose LeanMark's local page on CDP port {0} within {1} seconds. Last targets: {2}" -f
        $Port, $Seconds, ($lastUrls -join ', '))
}

function Invoke-CdpExpression {
    param(
        [Parameter(Mandatory = $true)][string]$WebSocketUrl,
        [Parameter(Mandatory = $true)][string]$Expression,
        [int]$Seconds = 10
    )
    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $cancel = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($Seconds))
    try {
        [void]$socket.ConnectAsync([Uri]$WebSocketUrl, $cancel.Token).GetAwaiter().GetResult()
        $request = @{
            id = 1
            method = 'Runtime.evaluate'
            params = @{
                expression = $Expression
                returnByValue = $true
                awaitPromise = $true
            }
        } | ConvertTo-Json -Compress -Depth 8
        $requestBytes = [System.Text.Encoding]::UTF8.GetBytes($request)
        $sendBuffer = [System.ArraySegment[byte]]::new($requestBytes)
        [void]$socket.SendAsync($sendBuffer, [System.Net.WebSockets.WebSocketMessageType]::Text,
            $true, $cancel.Token).GetAwaiter().GetResult()

        while ($true) {
            $memory = [System.IO.MemoryStream]::new()
            try {
                do {
                    $receiveBytes = New-Object byte[] 16384
                    $receiveBuffer = [System.ArraySegment[byte]]::new($receiveBytes)
                    $received = $socket.ReceiveAsync($receiveBuffer, $cancel.Token).GetAwaiter().GetResult()
                    if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                        throw 'CDP closed the WebSocket before returning the evaluation result.'
                    }
                    $memory.Write($receiveBytes, 0, $received.Count)
                } while (-not $received.EndOfMessage)
                $message = [System.Text.Encoding]::UTF8.GetString($memory.ToArray()) | ConvertFrom-Json
            } finally { $memory.Dispose() }
            $idProperty = $message.PSObject.Properties['id']
            if ($null -eq $idProperty -or $idProperty.Value -ne 1) { continue }
            $errorProperty = $message.PSObject.Properties['error']
            if ($null -ne $errorProperty) {
                throw ("CDP error: " + ($errorProperty.Value | ConvertTo-Json -Compress))
            }
            $exceptionProperty = $message.result.PSObject.Properties['exceptionDetails']
            if ($null -ne $exceptionProperty) {
                throw ("DOM expression failed: " + ($exceptionProperty.Value | ConvertTo-Json -Compress -Depth 6))
            }
            return $message.result.result.value
        }
    } finally {
        if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            try { [void]$socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
                    'test complete', [System.Threading.CancellationToken]::None).GetAwaiter().GetResult() }
            catch { }
        }
        $socket.Dispose()
        $cancel.Dispose()
    }
}

Export-ModuleMember -Function @(
    'Assert-True', 'Assert-Equal', 'Assert-Match', 'Assert-NotMatch',
    'Read-TextFile', 'Write-TestPass', 'Write-TestNote',
    'Get-RegistryValueState', 'Get-LeanMarkProcessTreeIds',
    'Start-LeanMarkProcess', 'Wait-LeanMarkWindow', 'Get-LeanMarkWindowClass',
    'Stop-LeanMarkTestProcessTree', 'Get-LeanMarkProcessSample',
    'Resolve-EffectiveAssociationExecutable',
    'Get-FreeLoopbackPort', 'Wait-CdpPageTarget', 'Invoke-CdpExpression'
)
