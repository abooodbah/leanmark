# Hostile Markdown safety fixture

Every payload in this file is a harmless sentinel. A secure build displays text,
blocks the element, or reports an inline diagram error; it never executes the
payload and never performs a remote request.

<script>window.__leanmarkXss = "raw-script";</script>

<img src="missing-sentinel.png" onerror="window.__leanmarkXss = 'event-handler'">

<iframe src="https://127.0.0.1:9/leanmark-must-not-frame"></iframe>
<object data="https://127.0.0.1:9/leanmark-must-not-object"></object>
<embed src="https://127.0.0.1:9/leanmark-must-not-embed">
<form action="https://127.0.0.1:9/leanmark-must-not-submit"><button>Do not submit</button></form>
<meta http-equiv="refresh" content="0;url=https://127.0.0.1:9/leanmark-must-not-navigate">
<style>body { background-image: url("https://127.0.0.1:9/leanmark-must-not-style"); }</style>

[JavaScript URL must be inert](javascript:window.__leanmarkXss='javascript-link')

[Data URL must be inert](data:text/html,<script>window.__leanmarkXss='data-link'</script>)

[Absolute executable path must be blocked](file:///C:/Windows/System32/calc.exe)

![Remote image must be replaced](https://127.0.0.1:9/leanmark-must-not-request.png)

![Unsupported-scheme image must be replaced](ftp://127.0.0.1/leanmark-must-not-request.png)

![Unsupported inline SVG must be replaced](data:image/svg+xml,<svg onload="window.__leanmarkXss='svg-data'"></svg>)

```html
<script>window.__leanmarkXss = "fenced-code";</script>
```

```mermaid
flowchart LR
    A["<img src=x onerror=window.__leanmarkXss='mermaid-label'>"] --> B[Safe]
    click A "javascript:window.__leanmarkXss='mermaid-click'"
```

The final sentinel proves the rest of the document still rendered.
