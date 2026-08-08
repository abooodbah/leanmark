# LeanMark verification

These tests are dependency-free PowerShell scripts. The default run is read-only:
it audits source hardening and the staged `dist/` payload without launching the
application or touching the registry.

## Quick start

Build first, then run the default fail-closed checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1 -Configuration Release
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1
```

Add the native window and multi-file launch smoke tests:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Runtime
```

Exercise the real rendered DOM as well. This temporarily gives each test WebView2
process an ephemeral loopback DevTools port, restores the environment immediately
after launch, and fails if the endpoint cannot be inspected:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Dom
```

Verify the public product site statically, then render it in a test-owned
headless Edge or Chrome profile at desktop, tablet, and mobile widths:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-Site.ps1
node .\tests\Invoke-SiteBrowserSmoke.mjs --site .\site
```

The browser smoke fails on page-level horizontal overflow, broken local assets
or anchors, undersized buttons, missing focus indicators, unnamed interactive
elements, browser exceptions, and failed local resources.

After deliberately running the per-user installer, opt into read-only registry
verification. The second command also requires that Windows currently resolves
`.md` to the installed LeanMark executable:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Registry
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Registry -RequireDefaultAssociation
```

Registry tests never create, modify, or delete a key. In particular, they only
observe Windows' protected `UserChoice`; the OS Settings UI remains the consent
boundary for making LeanMark the default.

## Performance and footprint

The short measurement below launches one warm-up and ten measured instances. It
samples every 100 ms, summing the native host and its complete descendant WebView2
process tree. Results go to standard output unless an output path is explicitly
requested.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Measure-Performance.ps1 `
  -Iterations 10 -WarmupIterations 1 -ObservationSeconds 5 `
  -OutputPath "$env:TEMP\leanmark-performance.json"
```

Optional release gates can be supplied without hard-coding machine-sensitive
limits into normal correctness tests:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Measure-Performance.ps1 `
  -Iterations 10 -MaxPeakPrivateMiB 180 -MaxWindowReadyMilliseconds 1500
```

`WindowReadyMilliseconds` means process start to a visible native window. It is
not claimed as browser first-contentful-paint. Memory figures include every sampled
WebView2 descendant; the separately installed Evergreen runtime is not counted in
LeanMark's distribution size.

## Automated coverage

- MD4C GFM dialect, raw-HTML disablement, UTF-8 BOM path, and 32 MiB guard.
- Well-formed non-elevating manifest, Per-Monitor V2 DPI, and long-path support.
- Exact CSP directives; no unsafe inline/eval scripts; local renderer assets only.
- Strict Mermaid mode, diagram count/input bounds, remote-image blocking, and local
  `doc.leanmark.invalid` asset resolution.
- Native WebView navigation, popup, permission, download, DevTools, and CORS guards.
- Windows argument parsing, `--` handling, quoting, and multi-document process launch.
- Per-user installer registration and a static ban on UserChoice mutation, HKLM,
  DISM, `assoc`, `ftype`, and SetUserFTA.
- Complete distribution, local font/stylesheet references, PE headers, absence of
  build artifacts, source/staged asset equality, and a 15 MiB default disk gate.
- Optional visible window/class/title checks and two-path/two-window behavior.
- Optional real-DOM assertions for headings, tables, task lists, code, blockquotes,
  local SVG, two Mermaid SVGs, and hostile markup/URL/image/diagram payloads.

The fixtures are also useful for manual visual review:

- `fixtures/showcase.md` is the formatting and diagram showcase.
- `fixtures/simple.md` is the primary no-diagram startup/memory fixture.
- `fixtures/security.md` contains inert XSS/navigation/resource sentinels.
- `fixtures/linked-document.md` checks a relative local Markdown link.
- `fixtures/assets/local-architecture.svg` checks a local accessible image.

## Manual release checklist

Automation cannot reliably replace these operator checks on a real desktop:

1. Review the showcase at 100%, 125%, 150%, and 200% DPI in light, dark, and
   Windows High Contrast themes. Confirm no page-level horizontal overflow.
2. Navigate every control by keyboard; test Ctrl+O, Ctrl+F/F3/Shift+F3,
   Ctrl+plus/minus/0, Ctrl+R, Ctrl+Shift+T, Home/End/Page Up/Page Down, and Alt+F4.
3. Run Accessibility Insights and an NVDA smoke pass. Check heading/table/list
   semantics, link names, local-image alt text, diagram accessible names, and focus.
4. Save the showcase in place, by truncate/rewrite, and by atomic rename. Burst-save
   it repeatedly, delete/recreate it, and verify the last good view survives errors,
   the final write wins, and scroll position is preserved.
5. Double-click `.md` paths containing spaces, apostrophes, ampersands, parentheses,
   Unicode, a leading dash, and a path longer than 260 characters.
6. In Windows Settings, select LeanMark for `.md`, rerun with
   `-Registry -RequireDefaultAssociation`, then upgrade/uninstall and confirm other
   handlers and the protected UserChoice were never silently overwritten or deleted.
