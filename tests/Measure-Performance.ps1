[CmdletBinding()]
param(
    [string]$ExePath,
    [string[]]$DocumentPath,
    [ValidateRange(1, 100)][int]$Iterations = 3,
    [ValidateRange(0, 20)][int]$WarmupIterations = 1,
    [ValidateRange(1, 60)][int]$ObservationSeconds = 3,
    [ValidateRange(50, 2000)][int]$SampleIntervalMilliseconds = 100,
    [ValidateRange(0, 4096)][double]$MaxPeakPrivateMiB = 0,
    [ValidateRange(0, 60000)][double]$MaxWindowReadyMilliseconds = 0,
    [string]$OutputPath,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TestSupport.psm1') -Force

if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $ExePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\LeanMark.exe'
}
if (@($DocumentPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count -eq 0) {
    $DocumentPath = @(Join-Path $PSScriptRoot 'fixtures\showcase.md')
}

function Get-Percentile {
    param([double[]]$Values, [ValidateRange(0, 100)][double]$Percent)
    if ($Values.Count -eq 0) { return 0.0 }
    $sorted = @($Values | Sort-Object)
    $index = [Math]::Max(0, [Math]::Ceiling(($Percent / 100.0) * $sorted.Count) - 1)
    [double]$sorted[[int]$index]
}

function Invoke-MeasurementIteration {
    param([int]$Number, [bool]$Warmup)
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    # Several documents measure one launch that opens them all, which is what
    # Explorer does with a multi-file selection.
    $process = Start-LeanMarkProcess -ExePath $resolvedExe -DocumentPaths $resolvedDocuments
    try {
        [void](Wait-LeanMarkWindow -Process $process -TimeoutSeconds 30)
        $windowMilliseconds = $clock.Elapsed.TotalMilliseconds
        # A native Win32 window appears before WebView2 has necessarily created
        # its browser/renderer processes. Wait for a meaningful process tree so
        # the sample can never report host-only memory as total reader memory.
        $treeDeadline = [DateTime]::UtcNow.AddSeconds(30)
        do {
            $firstSample = Get-LeanMarkProcessSample -RootProcessId $process.Id
            if ($firstSample.ProcessCount -lt 3) { Start-Sleep -Milliseconds 100 }
        } while ($firstSample.ProcessCount -lt 3 -and [DateTime]::UtcNow -lt $treeDeadline)
        Assert-True ($firstSample.ProcessCount -ge 3) 'WebView2 did not create a browser/renderer process tree within 30 seconds.'
        $treeMilliseconds = $clock.Elapsed.TotalMilliseconds
        $samples = [System.Collections.Generic.List[object]]::new()
        $samples.Add($firstSample)
        $sampleDeadline = [DateTime]::UtcNow.AddSeconds($ObservationSeconds)
        do {
            $samples.Add((Get-LeanMarkProcessSample -RootProcessId $process.Id))
            Start-Sleep -Milliseconds $SampleIntervalMilliseconds
        } while ([DateTime]::UtcNow -lt $sampleDeadline)

        $last = $samples[$samples.Count - 1]
        Assert-True ($last.ProcessCount -ge 3) 'The WebView2 process tree exited during the observation window.'
        $peakPrivate = [int64](($samples | Measure-Object -Property PrivateBytes -Maximum).Maximum)
        $peakWorking = [int64](($samples | Measure-Object -Property WorkingSetBytes -Maximum).Maximum)
        $peakHandles = [int](($samples | Measure-Object -Property HandleCount -Maximum).Maximum)
        $peakThreads = [int](($samples | Measure-Object -Property ThreadCount -Maximum).Maximum)
        $peakProcesses = [int](($samples | Measure-Object -Property ProcessCount -Maximum).Maximum)
        $cpuDelta = [Math]::Max(0.0, [double]$last.CpuSeconds - [double]$samples[0].CpuSeconds)
        $cpuPercent = 100.0 * $cpuDelta / [Math]::Max(0.001, $ObservationSeconds) /
            [Math]::Max(1, [Environment]::ProcessorCount)
        [pscustomobject]@{
            Iteration = $Number
            Warmup = $Warmup
            WindowReadyMilliseconds = [Math]::Round($windowMilliseconds, 2)
            WebViewTreeReadyMilliseconds = [Math]::Round($treeMilliseconds, 2)
            PeakPrivateMiB = [Math]::Round($peakPrivate / 1MB, 2)
            SettledPrivateMiB = [Math]::Round([int64]$last.PrivateBytes / 1MB, 2)
            PeakWorkingSetMiB = [Math]::Round($peakWorking / 1MB, 2)
            SettledWorkingSetMiB = [Math]::Round([int64]$last.WorkingSetBytes / 1MB, 2)
            PeakProcessCount = $peakProcesses
            PeakHandleCount = $peakHandles
            PeakThreadCount = $peakThreads
            AverageCpuPercentOfMachine = [Math]::Round($cpuPercent, 3)
            SampleCount = $samples.Count
        }
    } finally {
        Stop-LeanMarkTestProcessTree -RootProcess $process
    }
}

$resolvedExe = [System.IO.Path]::GetFullPath($ExePath)
$resolvedDocuments = @($DocumentPath | ForEach-Object { [System.IO.Path]::GetFullPath($_) })
Assert-True (Test-Path -LiteralPath $resolvedExe -PathType Leaf) "LeanMark executable is missing: $resolvedExe"
foreach ($resolvedDocument in $resolvedDocuments) {
    Assert-True (Test-Path -LiteralPath $resolvedDocument -PathType Leaf) "Benchmark fixture is missing: $resolvedDocument"
}

$all = [System.Collections.Generic.List[object]]::new()
for ($index = 1; $index -le $WarmupIterations; $index += 1) {
    Write-TestNote "Warm-up $index of $WarmupIterations"
    $all.Add((Invoke-MeasurementIteration -Number $index -Warmup $true))
    Start-Sleep -Milliseconds 1000
}
for ($index = 1; $index -le $Iterations; $index += 1) {
    Write-TestNote "Measured launch $index of $Iterations"
    $all.Add((Invoke-MeasurementIteration -Number $index -Warmup $false))
    Start-Sleep -Milliseconds 1000
}

$measured = @($all | Where-Object { -not $_.Warmup })
$windowTimes = [double[]]@($measured | ForEach-Object { $_.WindowReadyMilliseconds })
$privatePeaks = [double[]]@($measured | ForEach-Object { $_.PeakPrivateMiB })
$distributionRoot = Split-Path -Parent $resolvedExe
$distributionBytes = [int64](Get-ChildItem -LiteralPath $distributionRoot -Recurse -File |
    Measure-Object -Property Length -Sum).Sum

$report = [ordered]@{
    SchemaVersion = 1
    TimestampUtc = [DateTime]::UtcNow.ToString('o')
    Executable = $resolvedExe
    Document = if ($resolvedDocuments.Count -eq 1) { $resolvedDocuments[0] } else { @($resolvedDocuments) }
    OperatingSystem = [Environment]::OSVersion.VersionString
    LogicalProcessorCount = [Environment]::ProcessorCount
    ObservationSeconds = $ObservationSeconds
    SampleIntervalMilliseconds = $SampleIntervalMilliseconds
    DistributionMiB = [Math]::Round($distributionBytes / 1MB, 2)
    SharedWebView2RuntimeIncludedInDistribution = $false
    Summary = [ordered]@{
        WindowReadyMedianMilliseconds = [Math]::Round((Get-Percentile $windowTimes 50), 2)
        WindowReadyP95Milliseconds = [Math]::Round((Get-Percentile $windowTimes 95), 2)
        PeakPrivateMedianMiB = [Math]::Round((Get-Percentile $privatePeaks 50), 2)
        PeakPrivateP95MiB = [Math]::Round((Get-Percentile $privatePeaks 95), 2)
    }
    Iterations = @($all)
    Notes = @(
        'WindowReady measures process start to a visible native window; it is not a first-contentful-paint metric.',
        'WebViewTreeReady measures process start until at least the host, browser, and renderer are observable.',
        'Memory totals LeanMark.exe and every descendant WebView2 process sampled from the Toolhelp process tree.',
        'Run after a reboot for a cold sample; these repeated iterations are most useful as warm-start measurements.'
    )
}

if ($MaxPeakPrivateMiB -gt 0) {
    Assert-True ($report.Summary.PeakPrivateP95MiB -le $MaxPeakPrivateMiB) ("Peak private-memory p95 {0:N2} MiB exceeds {1:N2} MiB." -f $report.Summary.PeakPrivateP95MiB, $MaxPeakPrivateMiB)
}
if ($MaxWindowReadyMilliseconds -gt 0) {
    Assert-True ($report.Summary.WindowReadyP95Milliseconds -le $MaxWindowReadyMilliseconds) ("Window-ready p95 {0:N2} ms exceeds {1:N2} ms." -f $report.Summary.WindowReadyP95Milliseconds, $MaxWindowReadyMilliseconds)
}

$json = $report | ConvertTo-Json -Depth 8
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    if ((Test-Path -LiteralPath $resolvedOutput) -and -not $Force) {
        throw "Output already exists; pass -Force to replace it: $resolvedOutput"
    }
    $parent = Split-Path -Parent $resolvedOutput
    Assert-True (Test-Path -LiteralPath $parent -PathType Container) "Output directory does not exist: $parent"
    [System.IO.File]::WriteAllText($resolvedOutput, $json, [System.Text.UTF8Encoding]::new($false))
    Write-TestNote "Performance JSON written to $resolvedOutput"
}
$json
