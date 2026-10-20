[CmdletBinding()]
param(
    # One or more label=path pairs, for example 0.3.0=C:\old\LeanMark.exe.
    [Parameter(Mandatory = $true)][string[]]$Build,
    [string[]]$DocumentPath,
    [ValidateRange(1, 50)][int]$Iterations = 8,
    [ValidateRange(0, 10)][int]$WarmupIterations = 1,
    [ValidateRange(5, 120)][int]$TimeoutSeconds = 45,
    [string]$OutputPath,
    [string]$MarkdownSummaryPath
)

# Times each launch to a rendered document, not just to a visible window, and
# splits it into WebView2 start-up and the reader's own work. Builds take turns
# launch by launch so drift on the machine affects them equally.
#
# Each launch gets an ephemeral loopback DevTools port, the same way the DOM
# smoke test does. That costs every build the same small amount.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TestSupport.psm1') -Force

if (@($DocumentPath | Where-Object { $_ }).Count -eq 0) {
    $DocumentPath = @(Join-Path $PSScriptRoot 'fixtures\showcase.md')
}
$documents = @($DocumentPath | ForEach-Object { [System.IO.Path]::GetFullPath($_) })

$builds = foreach ($entry in $Build) {
    $parts = $entry -split '=', 2
    Assert-True ($parts.Count -eq 2 -and $parts[0] -and $parts[1]) "Use label=path for -Build: $entry"
    $exe = [System.IO.Path]::GetFullPath($parts[1])
    Assert-True (Test-Path -LiteralPath $exe -PathType Leaf) "LeanMark executable is missing: $exe"
    [pscustomobject]@{ Label = $parts[0]; Exe = $exe }
}

# Resolves in the page once the document has rendered (diagrams included) and
# reports where the time went, measured by the page's own clock.
$readyProbe = @'
new Promise(function (resolve) {
  function done() {
    var root = document.documentElement;
    var article = document.getElementById("article");
    return root.dataset.renderState === "ready" && article &&
      article.textContent.trim().length > 0;
  }
  function report() {
    var nav = performance.getEntriesByType("navigation")[0];
    var mermaid = performance.getEntriesByType("resource").filter(function (entry) {
      return /mermaid\.min\.js$/.test(entry.name);
    })[0];
    resolve(JSON.stringify({
      timeOrigin: performance.timeOrigin,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : -1,
      ready: performance.now(),
      mermaidStart: mermaid ? mermaid.startTime : -1,
      mermaidEnd: mermaid ? mermaid.responseEnd : -1,
      diagrams: document.querySelectorAll("#article figure.diagram svg").length
    }));
  }
  (function poll() {
    if (done()) { report(); } else { setTimeout(poll, 5); }
  }());
})
'@

function Measure-Launch {
    param([pscustomobject]$Target)
    $port = Get-FreeLoopbackPort
    $saved = [Environment]::GetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'Process')
    [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
        "--remote-debugging-port=$port --remote-allow-origins=*", 'Process')
    $clock = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $process = Start-LeanMarkProcess -ExePath $Target.Exe -DocumentPaths $documents
    } finally {
        [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', $saved, 'Process')
    }
    try {
        [void](Wait-LeanMarkWindow -Process $process -TimeoutSeconds $TimeoutSeconds)
        $windowMs = $clock.Elapsed.TotalMilliseconds
        try {
            $page = Wait-CdpPageTarget -Port $port -Seconds $TimeoutSeconds
        } catch {
            # Say what did start, so a runner without a usable WebView2 is
            # told apart from a reader that never loaded.
            $tree = @(Get-LeanMarkProcessTreeIds -RootProcessId $process.Id)
            $details = @(Get-CimInstance Win32_Process | Where-Object { $tree -contains $_.ProcessId } |
                ForEach-Object { '{0} {1}' -f $_.Name, $_.CommandLine })
            throw ('{0} Process tree: {1}' -f $_.Exception.Message, ($details -join ' | '))
        }
        $pageMs = $clock.Elapsed.TotalMilliseconds
        $result = Invoke-CdpExpression -WebSocketUrl $page.webSocketDebuggerUrl `
            -Expression $readyProbe -Seconds $TimeoutSeconds | ConvertFrom-Json
        $readyMs = $clock.Elapsed.TotalMilliseconds
        $startEpochMs = ([DateTimeOffset]$process.StartTime).ToUnixTimeMilliseconds()
        [pscustomobject]@{
            Build = $Target.Label
            WindowVisibleMs = [Math]::Round($windowMs, 1)
            PageTargetMs = [Math]::Round($pageMs, 1)
            DocumentReadyMs = [Math]::Round($readyMs, 1)
            # Process start to the reader page's navigation start: the host
            # and WebView2 starting up.
            HostAndWebViewMs = [Math]::Round([double]$result.timeOrigin - $startEpochMs, 1)
            PageLoadedMs = [Math]::Round([double]$result.domContentLoaded, 1)
            PageToReadyMs = [Math]::Round([double]$result.ready, 1)
            MermaidLoadMs = if ([double]$result.mermaidStart -ge 0) {
                [Math]::Round([double]$result.mermaidEnd - [double]$result.mermaidStart, 1)
            } else { 0 }
            Diagrams = [int]$result.diagrams
        }
    } finally {
        Stop-LeanMarkTestProcessTree -RootProcess $process
        # The next launch must not join this one's still-closing browser.
        Start-Sleep -Milliseconds 1500
    }
}

function Get-Median {
    param([double[]]$Values)
    $sorted = @($Values | Sort-Object)
    if ($sorted.Count -eq 0) { return 0 }
    $middle = [int][Math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2) { return $sorted[$middle] }
    ($sorted[$middle - 1] + $sorted[$middle]) / 2
}

$samples = [System.Collections.Generic.List[object]]::new()
for ($round = 1 - $WarmupIterations; $round -le $Iterations; $round += 1) {
    foreach ($target in $builds) {
        $sample = Measure-Launch -Target $target
        $kind = if ($round -le 0) { 'warm-up' } else { "launch $round" }
        Write-TestNote ('{0,-8} {1,-9} window {2,7:N1} ms  ready {3,7:N1} ms' -f
            $target.Label, $kind, $sample.WindowVisibleMs, $sample.DocumentReadyMs)
        if ($round -ge 1) { $samples.Add($sample) }
    }
}

$metrics = @('WindowVisibleMs', 'HostAndWebViewMs', 'PageLoadedMs', 'PageToReadyMs',
    'MermaidLoadMs', 'DocumentReadyMs')
$summary = foreach ($target in $builds) {
    $own = @($samples | Where-Object { $_.Build -eq $target.Label })
    $row = [ordered]@{ Build = $target.Label }
    foreach ($metric in $metrics) {
        $row[$metric] = [Math]::Round((Get-Median ([double[]]@($own | ForEach-Object { $_.$metric }))), 1)
    }
    [pscustomobject]$row
}

$summary | Format-Table -AutoSize | Out-String | Write-Host

$report = [ordered]@{
    SchemaVersion = 1
    TimestampUtc = [DateTime]::UtcNow.ToString('o')
    OperatingSystem = [Environment]::OSVersion.VersionString
    LogicalProcessorCount = [Environment]::ProcessorCount
    Documents = $documents
    Iterations = $Iterations
    MedianSummary = @($summary)
    Samples = @($samples)
}
if ($OutputPath) {
    [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutputPath),
        ($report | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
}
if ($MarkdownSummaryPath) {
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add(('### Launch time, median of {0} launches: {1}' -f $Iterations,
        (($documents | ForEach-Object { Split-Path -Leaf $_ }) -join ', ')))
    $lines.Add('')
    $lines.Add('| Build | Window visible | Host + WebView2 | Page loaded | Page to ready | Mermaid load | Document ready |')
    $lines.Add('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
    foreach ($row in $summary) {
        $lines.Add(('| {0} | {1} ms | {2} ms | {3} ms | {4} ms | {5} ms | **{6} ms** |' -f
            $row.Build, $row.WindowVisibleMs, $row.HostAndWebViewMs, $row.PageLoadedMs,
            $row.PageToReadyMs, $row.MermaidLoadMs, $row.DocumentReadyMs))
    }
    $lines.Add('')
    Add-Content -LiteralPath $MarkdownSummaryPath -Value $lines -Encoding UTF8
}
