[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ExePath,
    [ValidateRange(5, 120)][int]$TimeoutSeconds = 30,
    [ValidateSet('Both', 'Showcase', 'Security')][string]$Fixture = 'Both'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'TestSupport.psm1') -Force

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

function Wait-RenderedDocument {
    param([string]$WebSocketUrl, [int]$Seconds)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $state = Invoke-CdpExpression -WebSocketUrl $WebSocketUrl -Expression 'document.documentElement.dataset.renderState || ""'
        if ($state -eq 'ready') { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "LeanMark's DOM did not reach data-render-state=ready within $Seconds seconds."
}

function Start-DebuggableLeanMark {
    param([string]$DocumentPath, [ref]$Port)
    $Port.Value = Get-FreeLoopbackPort
    $oldArguments = [Environment]::GetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', 'Process')
    # The endpoint itself binds to loopback. Current Chromium/WebView2 builds
    # require an explicit DevTools WebSocket origin allowlist; wildcard is scoped
    # to this short-lived, test-owned browser process and ephemeral local port.
    $debugArguments = "--remote-debugging-port=$($Port.Value) --remote-allow-origins=*"
    $combined = if ([string]::IsNullOrWhiteSpace($oldArguments)) {
        $debugArguments
    } else {
        $oldArguments + ' ' + $debugArguments
    }
    [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', $combined, 'Process')
    try { Start-LeanMarkProcess -ExePath $ExePath -DocumentPaths @($DocumentPath) }
    finally {
        [Environment]::SetEnvironmentVariable('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS', $oldArguments, 'Process')
    }
}

function Get-DomSnapshot {
    param([string]$WebSocketUrl)
    $expression = @'
JSON.stringify((function () {
  var article = document.getElementById("article");
  var resources = performance.getEntriesByType("resource").filter(function (entry) {
    return /^https?:/i.test(entry.name) &&
      !/^https:\/\/app\.leanmark\.invalid\//i.test(entry.name) &&
      !/^https:\/\/doc\.leanmark\.invalid\//i.test(entry.name);
  }).map(function (entry) {
    return { name: entry.name, transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0 };
  });
  var eventAttributes = Array.from(article.querySelectorAll("*")).reduce(function (count, node) {
    return count + Array.from(node.attributes || []).filter(function (attribute) {
      return /^on/i.test(attribute.name);
    }).length;
  }, 0);
  var dangerousLinks = Array.from(article.querySelectorAll("a[href^='javascript:'],a[href^='data:'],a[href^='file:']"));
  var preventedDangerousClicks = dangerousLinks.filter(function (link) {
    var event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    return event.defaultPrevented;
  }).length;
  return {
    state: document.documentElement.dataset.renderState || "",
    title: document.title,
    fileName: document.getElementById("fileName").textContent,
    text: article.innerText,
    h1: Array.from(article.querySelectorAll("h1")).map(function (node) { return node.textContent; }),
    headings: article.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
    tables: article.querySelectorAll("table").length,
    tasks: article.querySelectorAll('input[type="checkbox"]').length,
    enabledTasks: article.querySelectorAll('input[type="checkbox"]:not([disabled])').length,
    deletions: article.querySelectorAll("del").length,
    codeBlocks: article.querySelectorAll("pre > code").length,
    blockquotes: article.querySelectorAll("blockquote").length,
    diagrams: article.querySelectorAll("figure.diagram").length,
    diagramSvgs: article.querySelectorAll("figure.diagram svg").length,
    unsafeDiagramNodes: article.querySelectorAll("figure.diagram script, figure.diagram [onload], figure.diagram [onerror], figure.diagram a[href^='javascript:']").length,
    images: Array.from(article.querySelectorAll("img")).map(function (image) { return image.src; }),
    blockedImages: article.querySelectorAll(".blocked-image").length,
    dangerousElements: article.querySelectorAll("script,iframe,object,embed,form,meta[http-equiv='refresh']").length,
    eventAttributes: eventAttributes,
    dangerousSchemeLinks: dangerousLinks.length,
    preventedDangerousClicks: preventedDangerousClicks,
    location: window.location.href,
    inlineScripts: Array.from(document.scripts).filter(function (script) { return !script.src; }).length,
    nonAppScripts: Array.from(document.scripts).filter(function (script) {
      return script.src && !/^https:\/\/app\.leanmark\.invalid\//i.test(script.src);
    }).length,
    externalResources: resources,
    externalTransferredBytes: resources.reduce(function (total, entry) {
      return total + entry.transferSize + entry.encodedBodySize;
    }, 0),
    xssSentinel: window.__leanmarkXss || null
  };
}()))
'@
    $json = Invoke-CdpExpression -WebSocketUrl $WebSocketUrl -Expression $expression
    $json | ConvertFrom-Json
}

function Test-DomFixture {
    param([string]$FixturePath, [ValidateSet('Showcase', 'Security')][string]$Kind)
    [int]$port = 0
    $process = Start-DebuggableLeanMark -DocumentPath $FixturePath -Port ([ref]$port)
    try {
        [void](Wait-LeanMarkWindow -Process $process -TimeoutSeconds $TimeoutSeconds)
        $target = Wait-CdpPageTarget -Port $port -Seconds $TimeoutSeconds
        Wait-RenderedDocument -WebSocketUrl $target.webSocketDebuggerUrl -Seconds $TimeoutSeconds
        $snapshot = Get-DomSnapshot -WebSocketUrl $target.webSocketDebuggerUrl
        Assert-Equal $snapshot.state 'ready' "$Kind DOM did not report ready."
        Assert-Equal $snapshot.fileName ([System.IO.Path]::GetFileName($FixturePath)) "$Kind fixture filename differs in the DOM."
        Assert-Equal $snapshot.inlineScripts 0 "$Kind fixture created an inline script element."
        Assert-Equal $snapshot.nonAppScripts 0 "$Kind fixture loaded a script outside the application origin."

        if ($Kind -eq 'Showcase') {
            Assert-Equal @($snapshot.externalResources).Count 0 'Showcase initiated a resource outside LeanMark virtual hosts.'
            Assert-True (@($snapshot.h1) -contains 'LeanMark renderer showcase') 'Showcase H1 is missing.'
            Assert-True ($snapshot.headings -ge 8) 'Showcase heading structure is incomplete.'
            Assert-True ($snapshot.tables -ge 1) 'GFM table did not render.'
            Assert-Equal $snapshot.tasks 3 'GFM task-list item count differs.'
            Assert-Equal $snapshot.enabledTasks 0 'Rendered task controls must be read-only.'
            Assert-True ($snapshot.deletions -ge 1) 'GFM strikethrough did not render.'
            Assert-True ($snapshot.codeBlocks -ge 2) 'Fenced code blocks did not render as expected.'
            Assert-True ($snapshot.blockquotes -ge 1) 'Blockquote did not render.'
            Assert-Equal $snapshot.diagrams 2 'Expected two Mermaid figure containers.'
            Assert-Equal $snapshot.diagramSvgs 2 'Expected two completed local Mermaid SVGs.'
            Assert-Equal $snapshot.unsafeDiagramNodes 0 'Mermaid output contains an unsafe node or URL.'
            Assert-True (@($snapshot.images | Where-Object { $_ -like 'https://doc.leanmark.invalid/*' }).Count -eq 1) 'Local SVG did not resolve through the document origin.'
            Write-TestPass 'real WebView DOM: CommonMark/GFM, local SVG, accessibility structure, and two Mermaid diagrams'
        } else {
            Assert-Equal $snapshot.externalTransferredBytes 0 'A hostile external resource transferred bytes despite CSP.'
            if (@($snapshot.externalResources).Count -gt 0) {
                Write-TestNote ('CSP-blocked Resource Timing sentinels (zero bytes): ' +
                    (@($snapshot.externalResources | ForEach-Object { $_.name }) -join ', '))
            }
            Assert-Equal $snapshot.xssSentinel $null 'A hostile fixture payload executed JavaScript.'
            Assert-Equal $snapshot.dangerousElements 0 'Raw HTML created an active dangerous element.'
            Assert-Equal $snapshot.eventAttributes 0 'An inline event-handler attribute survived rendering.'
            Assert-True ($snapshot.dangerousSchemeLinks -ge 3) 'Hostile scheme-link sentinels were not rendered for the click-interception test.'
            Assert-Equal $snapshot.preventedDangerousClicks $snapshot.dangerousSchemeLinks 'A javascript/data/file link click was not cancelled by the reader.'
            Assert-Match $snapshot.location '^https://app\.leanmark\.invalid/' 'A hostile link navigated the reader away from its trusted origin.'
            Assert-Equal $snapshot.unsafeDiagramNodes 0 'Hostile Mermaid content created an unsafe node or URL.'
            Assert-True ($snapshot.blockedImages -ge 2) 'Remote/unsupported data images were not visibly blocked.'
            Assert-Match $snapshot.text 'final sentinel' 'Security fixture did not render through its final sentinel.'
            Write-TestPass 'real WebView DOM: hostile HTML, URLs, images, and Mermaid payloads remain inert'
        }
    } finally { Stop-LeanMarkTestProcessTree -RootProcess $process }
}

$resolvedExe = [System.IO.Path]::GetFullPath($ExePath)
Assert-True (Test-Path -LiteralPath $resolvedExe -PathType Leaf) "LeanMark.exe is missing: $resolvedExe"
Write-TestNote 'DOM smoke enables an ephemeral loopback-only CDP port for each test process, then restores the environment.'
if ($Fixture -in @('Both', 'Showcase')) {
    Test-DomFixture -FixturePath (Join-Path $PSScriptRoot 'fixtures\showcase.md') -Kind Showcase
}
if ($Fixture -eq 'Both') {
    # WebView2's shared user-data process needs a brief shutdown boundary before
    # a new instance can honor a different ephemeral debugging port.
    Start-Sleep -Milliseconds 1500
}
if ($Fixture -in @('Both', 'Security')) {
    Test-DomFixture -FixturePath (Join-Path $PSScriptRoot 'fixtures\security.md') -Kind Security
}
