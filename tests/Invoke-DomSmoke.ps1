[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ExePath,
    [ValidateRange(5, 120)][int]$TimeoutSeconds = 30,
    [ValidateSet('All', 'Both', 'Showcase', 'Security', 'Tabs')][string]$Fixture = 'All'
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
      !/^https:\/\/d[1-9][0-9]*\.doc\.leanmark\.invalid\//i.test(entry.name);
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
    headingsWithText: Array.from(article.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(function (node) {
      return node.textContent.trim().length > 0;
    }).length,
    copyButtons: article.querySelectorAll("h1 > .copy-section,h2 > .copy-section,h3 > .copy-section,h4 > .copy-section,h5 > .copy-section,h6 > .copy-section").length,
    copyButtonText: Array.from(article.querySelectorAll(".copy-section")).map(function (node) { return node.textContent; }).join(""),
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
            Assert-True (@($snapshot.images | Where-Object { $_ -match '^https://d[1-9][0-9]*\.doc\.leanmark\.invalid/' }).Count -eq 1) 'Local SVG did not resolve through its folder origin.'
            Assert-Equal $snapshot.copyButtons $snapshot.headingsWithText 'Every heading with text needs one copy button.'
            Assert-Equal $snapshot.copyButtonText '' 'Copy buttons must add no text to headings, outlines, or search.'
            Write-TestPass 'real WebView DOM: CommonMark/GFM, local SVG, copy buttons, accessibility structure, and two Mermaid diagrams'
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

function Wait-DomCondition {
    param([string]$WebSocketUrl, [string]$Expression, [string]$Description, [int]$Seconds = 15)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        if ((Invoke-CdpExpression -WebSocketUrl $WebSocketUrl -Expression $Expression) -eq $true) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Timed out waiting for: $Description"
}

# Another program (a clipboard manager, or Windows clipboard history) can hold
# the clipboard for a moment, and the cmdlets then throw instead of waiting.
function Invoke-WithClipboard {
    param([Parameter(Mandatory = $true)][scriptblock]$Action)
    for ($attempt = 1; ; $attempt += 1) {
        try { return & $Action }
        catch {
            if ($attempt -ge 20) { throw }
            Start-Sleep -Milliseconds 100
        }
    }
}

function Wait-ClipboardChange {
    param([string]$From, [int]$Seconds = 10)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $text = Invoke-WithClipboard { Get-Clipboard -Raw }
        if ($null -ne $text -and $text -ne $From) { return $text }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'The clipboard did not change after a copy button was pressed.'
}

function Get-TabState {
    param([string]$WebSocketUrl)
    $expression = @'
JSON.stringify({
  file: document.getElementById("fileName").textContent,
  state: document.documentElement.dataset.renderState || "",
  stripHidden: document.getElementById("tabStrip").hidden,
  tabs: Array.from(document.querySelectorAll("#tabStrip .tab")).map(function (tab) {
    return { id: Number(tab.dataset.tabId), label: tab.textContent, selected: tab.getAttribute("aria-selected") === "true" };
  }),
  loadedImages: Array.from(document.querySelectorAll("#article img")).filter(function (image) {
    return image.complete && image.naturalWidth > 0;
  }).map(function (image) { return image.src; }),
  timeOrigin: performance.timeOrigin,
  navigations: performance.getEntriesByType("navigation").length
})
'@
    (Invoke-CdpExpression -WebSocketUrl $WebSocketUrl -Expression $expression) | ConvertFrom-Json
}

function Test-TabsAndCopy {
    $folder = Join-Path ([System.IO.Path]::GetTempPath()) ('leanmark-tabs-' + [guid]::NewGuid().ToString('N'))
    $outside = Join-Path ([System.IO.Path]::GetTempPath()) ('leanmark-outside-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $folder | Out-Null
    New-Item -ItemType Directory -Path $outside | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $outside 'secret.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>')
    $clipboardSaved = $false
    $savedClipboard = $null
    [int]$port = 0
    $process = $null
    try {
        $otherDocument = Join-Path $folder 'other.md'
        [System.IO.File]::WriteAllText((Join-Path $folder 'pic.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="teal"/></svg>')
        # LF endings on disk; the clipboard must receive CRLF.
        [System.IO.File]::WriteAllText($otherDocument, (@(
            '# Other folder', '', '![teal](pic.svg)', '', '## Part two', '',
            'First line', 'second line', '', '### Nested', '', 'Inside', '',
            '```md', '# not a heading', '```', '', '## Part three', '', 'Last', ''
        ) -join "`n"))

        $process = Start-DebuggableLeanMark -DocumentPath (Join-Path $PSScriptRoot 'fixtures\showcase.md') -Port ([ref]$port)
        [void](Wait-LeanMarkWindow -Process $process -TimeoutSeconds $TimeoutSeconds)
        $target = Wait-CdpPageTarget -Port $port -Seconds $TimeoutSeconds
        $socket = $target.webSocketDebuggerUrl
        Wait-RenderedDocument -WebSocketUrl $socket -Seconds $TimeoutSeconds
        $before = Get-TabState -WebSocketUrl $socket
        Assert-True $before.stripHidden 'The tab strip must stay hidden while one document is open.'

        # A later launch hands its file to the running window and exits.
        $forwarder = Start-LeanMarkProcess -ExePath $resolvedExe -DocumentPaths @($otherDocument)
        Assert-True ($forwarder.WaitForExit(15000)) 'A later launch did not exit after handing over its file.'
        Assert-Equal $forwarder.ExitCode 0 'A forwarding launch must exit cleanly.'
        Wait-DomCondition -WebSocketUrl $socket -Description 'the forwarded document to render' -Expression @'
document.getElementById("fileName").textContent === "other.md" &&
  document.documentElement.dataset.renderState === "ready" &&
  Array.from(document.querySelectorAll("#article img")).some(function (image) { return image.complete && image.naturalWidth > 0; })
'@
        $after = Get-TabState -WebSocketUrl $socket
        Assert-Equal @($after.tabs).Count 2 'The forwarded file must open as a second tab.'
        Assert-True (-not $after.stripHidden) 'The tab strip must appear with two documents.'
        Assert-True (@($after.tabs | Where-Object { $_.selected -and $_.label -eq 'other.md' }).Count -eq 1) 'The forwarded tab must be the selected one.'
        Assert-Equal $after.timeOrigin $before.timeOrigin 'Opening a tab from another folder must not reload the reader.'
        Assert-True (@($after.loadedImages | Where-Object { $_ -match '^https://d[1-9][0-9]*\.doc\.leanmark\.invalid/pic\.svg$' }).Count -eq 1) 'An image beside the new tab did not load from its own folder origin.'
        $readers = @(Get-Process LeanMark -ErrorAction SilentlyContinue | Where-Object {
            try { $_.MainModule.FileName -ieq $resolvedExe } catch { $false }
        })
        Assert-Equal $readers.Count 1 'Only one reader process may remain after forwarding.'
        Write-TestPass 'real WebView DOM: a later launch opens as a tab in the same page, with images from its own folder'

        # The folder origin answers images inside that folder and nothing else.
        $origin = ([regex]::Match(@($after.loadedImages)[0], '^https://d[1-9][0-9]*\.doc\.leanmark\.invalid/')).Value
        $outsideName = Split-Path -Leaf $outside
        $probes = [ordered]@{
            inside = $origin + 'pic.svg'
            encodedParent = $origin + '%2e%2e/' + $outsideName + '/secret.svg'
            backslashParent = $origin + '..%5c' + $outsideName + '%5csecret.svg'
            notAnImage = $origin + 'other.md'
            unknownHost = 'https://d999999.doc.leanmark.invalid/pic.svg'
        }
        $probeJson = $probes | ConvertTo-Json -Compress
        $results = (Invoke-CdpExpression -WebSocketUrl $socket -Expression @"
(function (probes) {
  var names = Object.keys(probes);
  return Promise.all(names.map(function (name) {
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () { resolve(name + "=load"); };
      image.onerror = function () { resolve(name + "=error"); };
      image.src = probes[name] + (probes[name].indexOf("?") < 0 ? "?probe=" : "&probe=") + Date.now();
    });
  })).then(function (list) { return list.join(","); });
}($probeJson))
"@) -split ','
        Assert-True ($results -contains 'inside=load') 'The control image inside the folder did not load.'
        foreach ($name in @('encodedParent', 'backslashParent', 'notAnImage', 'unknownHost')) {
            Assert-True ($results -contains "$name=error") "A folder origin served a request it must refuse: $name ($($results -join ', '))"
        }
        Write-TestPass 'real WebView DOM: folder origins refuse traversal, other file types, and unknown hosts'

        # Section copy comes from the file on disk. "Part two" is heading 1 and
        # owns its "Nested" subsection and the fenced block's fake heading.
        try { $savedClipboard = Invoke-WithClipboard { Get-Clipboard -Raw }; $clipboardSaved = $true } catch { $clipboardSaved = $false }
        $sentinel = 'leanmark-clipboard-sentinel-' + [guid]::NewGuid().ToString('N')
        Invoke-WithClipboard { Set-Clipboard -Value $sentinel }
        [void](Invoke-CdpExpression -WebSocketUrl $socket -Expression 'document.querySelectorAll("#article .copy-section")[1].click(); true')
        $section = Wait-ClipboardChange -From $sentinel
        $expectedSection = (@('## Part two', '', 'First line', 'second line', '', '### Nested', '', 'Inside', '', '```md', '# not a heading', '```') -join "`r`n")
        Assert-Equal $section $expectedSection 'A section copy must be the exact Markdown of that section with CRLF endings.'
        Wait-DomCondition -WebSocketUrl $socket -Description 'the copied mark on the section button' -Expression 'document.querySelectorAll("#article .copy-section")[1].hasAttribute("data-copied")'

        Invoke-WithClipboard { Set-Clipboard -Value $sentinel }
        [void](Invoke-CdpExpression -WebSocketUrl $socket -Expression 'document.getElementById("copyButton").click(); true')
        $whole = Wait-ClipboardChange -From $sentinel
        $expectedWhole = ([System.IO.File]::ReadAllText($otherDocument).TrimEnd() -replace "`n", "`r`n")
        Assert-Equal $whole $expectedWhole 'The toolbar copy must be the whole file with CRLF endings.'
        Write-TestPass 'real WebView DOM: section and whole-document copy give the exact Markdown source'

        # Selecting a tab re-reads that file into the same page.
        $showcaseTab = @($after.tabs | Where-Object { $_.label -eq 'showcase.md' })[0]
        [void](Invoke-CdpExpression -WebSocketUrl $socket -Expression ('document.querySelector(''#tabStrip .tab[data-tab-id="{0}"]'').click(); true' -f $showcaseTab.id))
        Wait-DomCondition -WebSocketUrl $socket -Description 'the first tab to render again' -Expression 'document.getElementById("fileName").textContent === "showcase.md" && document.querySelectorAll("#article figure.diagram svg").length === 2'
        $process.Refresh()
        Assert-Match $process.MainWindowTitle 'showcase\.md.*LeanMark' 'The window title must follow the selected tab.'

        # Opening a file that is already open brings its tab forward instead of
        # adding a second copy.
        $again = Start-LeanMarkProcess -ExePath $resolvedExe -DocumentPaths @($otherDocument)
        Assert-True ($again.WaitForExit(15000)) 'A repeated launch did not exit after handing over its file.'
        Wait-DomCondition -WebSocketUrl $socket -Description 'the open tab to come forward' -Expression 'document.getElementById("fileName").textContent === "other.md"'
        $reopened = Get-TabState -WebSocketUrl $socket
        Assert-Equal @($reopened.tabs).Count 2 'Opening an already open file must not add a duplicate tab.'

        # Closing a tab leaves one document and hides the strip again.
        $otherTab = @($after.tabs | Where-Object { $_.label -eq 'other.md' })[0]
        [void](Invoke-CdpExpression -WebSocketUrl $socket -Expression ('document.querySelector(''#tabStrip .tab[data-tab-id="{0}"] .tab-close'').click(); true' -f $otherTab.id))
        Wait-DomCondition -WebSocketUrl $socket -Description 'the closed tab to disappear' -Expression 'document.getElementById("tabStrip").hidden && document.getElementById("fileName").textContent === "showcase.md" && document.querySelectorAll("#article figure.diagram svg").length === 2'
        $final = Get-TabState -WebSocketUrl $socket
        Assert-Equal $final.timeOrigin $before.timeOrigin 'Switching and closing tabs must not reload the reader.'
        Write-TestPass 'real WebView DOM: switching and closing tabs keep one page and follow the title'
    } finally {
        if ($null -ne $process) { Stop-LeanMarkTestProcessTree -RootProcess $process }
        if ($clipboardSaved -and $null -ne $savedClipboard) {
            try { Invoke-WithClipboard { Set-Clipboard -Value $savedClipboard } } catch { }
        }
        Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $outside -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$resolvedExe = [System.IO.Path]::GetFullPath($ExePath)
Assert-True (Test-Path -LiteralPath $resolvedExe -PathType Leaf) "LeanMark.exe is missing: $resolvedExe"
Write-TestNote 'DOM smoke enables an ephemeral loopback-only CDP port for each test process, then restores the environment.'
# WebView2's shared user-data process needs a brief shutdown boundary before a
# new instance can honor a different ephemeral debugging port.
$ranOne = $false
if ($Fixture -in @('All', 'Both', 'Showcase')) {
    Test-DomFixture -FixturePath (Join-Path $PSScriptRoot 'fixtures\showcase.md') -Kind Showcase
    $ranOne = $true
}
if ($Fixture -in @('All', 'Both', 'Security')) {
    if ($ranOne) { Start-Sleep -Milliseconds 1500 }
    Test-DomFixture -FixturePath (Join-Path $PSScriptRoot 'fixtures\security.md') -Kind Security
    $ranOne = $true
}
if ($Fixture -in @('All', 'Tabs')) {
    if ($ranOne) { Start-Sleep -Milliseconds 1500 }
    Test-TabsAndCopy
}
