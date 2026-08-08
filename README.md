<p align="center">
  <img src="https://raw.githubusercontent.com/abooodbah/leanmark/main/site/assets/leanmark-icon.png" width="88" height="88" alt="LeanMark">
</p>

<h1 align="center">LeanMark</h1>

<p align="center"><strong>Open the README, not the IDE.</strong></p>

<p align="center">
  A focused, read-only Markdown viewer for Windows x64 with offline
  GitHub-flavored Markdown and Mermaid rendering.
</p>

<p align="center">
  <a href="https://github.com/abooodbah/leanmark/actions/workflows/build.yml"><img alt="Windows build" src="https://github.com/abooodbah/leanmark/actions/workflows/build.yml/badge.svg"></a>
  <a href="https://github.com/abooodbah/leanmark/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/abooodbah/leanmark?display_name=tag&sort=semver"></a>
  <a href="https://github.com/abooodbah/leanmark/blob/main/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1d4ed8"></a>
  <img alt="Windows x64" src="https://img.shields.io/badge/Windows-x64-1a1917">
</p>

<p align="center">
  <a href="https://github.com/abooodbah/leanmark/releases/download/v0.1.0/LeanMark-v0.1.0-windows-x64.zip"><strong>Download for Windows x64</strong></a>
  ·
  <a href="https://abooodbah.github.io/leanmark/">Website</a>
  ·
  <a href="https://github.com/abooodbah/leanmark/issues/new/choose">Report an issue</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/abooodbah/leanmark/main/site/assets/leanmark-window.png" width="980" alt="LeanMark displaying a local Markdown document with Mermaid diagrams and an automatic outline.">
</p>

LeanMark opens an ordinary Markdown file as a document—not a project. It
provides a calm reading surface, local diagrams, and useful navigation without
the editor panes, extensions, or workspace indexing of a full IDE.

The Windows host is C++17. WebView2 renders the final document. That distinction
is intentional and public: LeanMark has a small shipped package, while WebView2
still carries a browser-process memory cost.

## Who it is for

LeanMark is a good fit when you:

- want a focused app you can make the double-click handler for Markdown;
- need GFM tables, task lists, local images, or Mermaid diagrams offline;
- prefer a focused viewer over an editor or knowledge-management system; or
- value inspectable, MIT-licensed source and transparent measurements.

It is not a full Markdown editor, an Obsidian-style vault, a pure native text
renderer, or the lowest-RAM option. LeanMark v0.1.0 is verified on Windows 11
x64. It targets Windows 10 or later, but this release has not yet completed a
Windows 10 runtime test.

## Download and run

Download
<a href="https://github.com/abooodbah/leanmark/releases/download/v0.1.0/LeanMark-v0.1.0-windows-x64.zip">LeanMark-v0.1.0-windows-x64.zip</a>
from the official GitHub Release and verify the adjacent SHA-256 file if your
workflow requires it.

### Portable

1. Extract the complete ZIP.
2. Keep <code>LeanMark.exe</code>, <code>WebView2Loader.dll</code>, and the
   <code>assets</code> folder together.
3. Run <code>LeanMark.exe</code>, then open a Markdown file.

### Add Windows integration

The release includes <code>INSTALL.txt</code> and bounded per-user install and
uninstall scripts. From the extracted folder:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1 -OpenDefaultAppsSettings
~~~

The installer copies LeanMark to
<code>%LOCALAPPDATA%\Programs\LeanMark</code>, adds Start menu and Open With
entries, and registers the app with Windows Default Apps. It never edits or
deletes Windows' protected <code>UserChoice</code> value. Windows may ask you to
confirm LeanMark as the default Markdown app.

Uninstall through Windows Settings > Apps > Installed apps > LeanMark, or run:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Programs\LeanMark\uninstall.ps1"
~~~

> [!WARNING]
> LeanMark v0.1.0 is currently unsigned. Windows may identify the publisher as
> unknown or show a Microsoft Defender SmartScreen warning. Use only a release
> linked from this repository. If your device or organization prohibits
> unsigned applications, wait for a signed release.

Requirements: Windows 11 x64 is tested; Windows 10 x64 compatibility is not yet
runtime-verified. Both require the
[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/consumer/).

## What it does

- Renders CommonMark plus GFM tables, task lists, autolinks, and strikethrough.
- Renders fenced Mermaid diagrams offline and loads Mermaid only when needed.
- Displays relative local images while blocking remote images.
- Opens relative Markdown links inside LeanMark.
- Provides find, an automatic outline, reading progress, reader zoom, printing,
  and system/light/dark themes.
- Watches the open file and refreshes after a save while preserving the
  approximate reading position.
- Accepts <code>.md</code>, <code>.markdown</code>, <code>.mdown</code>, and
  <code>.mkd</code>.
- Uses a 32 MiB input limit and retains the last complete view when it catches a
  file mid-save.

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Open a Markdown file |
| Ctrl+F | Focus find |
| Enter / Shift+Enter | Next / previous match |
| F3 / Shift+F3 | Next / previous match |
| Ctrl+R | Reload from disk |
| Ctrl++ / Ctrl+- / Ctrl+0 | Zoom in / out / reset |
| Ctrl+Shift+T | Cycle system, light, and dark themes |
| Ctrl+P | Print with the standard Windows print UI |
| Escape | Leave find and return to the document |

Mermaid uses its familiar fenced syntax:

~~~~text
~~~mermaid
flowchart LR
    File[Markdown file] --> Parse[Native MD4C parser]
    Parse --> Read[LeanMark reading surface]
    Parse --> Diagram[Bundled Mermaid renderer]
    Diagram --> Read
~~~
~~~~

## Measured release

LeanMark publishes package, startup, and memory figures together. A small
package does not imply a tiny in-memory footprint.

| Measurement | Simple document | Mermaid showcase |
| --- | ---: | ---: |
| Native window visible | 320.88 ms | 1,158.41 ms |
| Peak private memory, full process tree | 162.94 MiB | 208.60 MiB |
| Peak working set, full process tree | 322.96 MiB | 362.39 MiB |
| Observed process count | 7 | 7 |

Release download: **1.34 MiB ZIP**. The extracted, staged application payload is
**4.11 MiB**.

Test machine: Windows 11 Pro build 26200, 13th Gen Intel Core i7-13620H,
16 logical processors, and 15.6 GiB RAM. The simple-document figures used a
three-second observation window. Hardware, system state, WebView2 version, and
document complexity affect results.

The measurement helper and methodology are in
[tests/README.md](https://github.com/abooodbah/leanmark/blob/main/tests/README.md).
There is deliberately no unmeasured comparison against VS Code or another app.

## Privacy and security

Markdown is treated as untrusted input:

- MD4C runs with raw HTML disabled.
- The reader page uses a strict Content Security Policy.
- The app origin and current document-image folder use separate virtual hosts.
- Remote images, custom URL schemes, downloads, popups, permissions, and
  in-reader external navigation are blocked.
- Mermaid runs with <code>securityLevel: "strict"</code>.
- External HTTP, HTTPS, and mail links are handed to Windows only after a click.
  No command shell is involved.

LeanMark renders documents with bundled local assets and does not require a
document-processing service. GFM and Mermaid rendering work offline once the
WebView2 Runtime is available. Security smoke tests exercise hostile HTML,
links, images, and Mermaid content in a real WebView.

Please report vulnerabilities privately as described in
[SECURITY.md](https://github.com/abooodbah/leanmark/blob/main/SECURITY.md).

## Build from source

Requirements:

- Visual Studio 2022 Build Tools with the MSVC v143 toolset
- Node.js 20 or newer for pinned build-time assets
- Evergreen WebView2 Runtime

Build and stage the portable payload:

~~~powershell
.\scripts\build.ps1 -Configuration Release -Platform x64
~~~

Run the dependency-free core verification suite:

~~~powershell
.\tests\Test-LeanMark.ps1 -DistPath .\dist
~~~

Create the same versioned ZIP and SHA-256 sidecar used for releases:

~~~powershell
.\scripts\package-release.ps1 -Version 0.1.0
~~~

The build restores pinned packages, compiles the native host with a static C++
runtime, and stages only the app, WebView2 loader, reader assets, bundled
Mermaid, five IBM Plex font files, and license notices. Node.js is not a runtime
dependency.

### Project map

- <code>src/</code> — native window, argument handling, file reading, MD4C
  rendering, WebView2 policy, and Windows resources.
- <code>assets/</code> — the trusted reader page, style system, navigation,
  find, and lazy Mermaid integration.
- <code>installer/</code> — auditable per-user registration and cleanup.
- <code>tests/</code> — static invariants, hostile fixtures, real DOM smoke
  tests, and performance helpers.
- <code>site/</code> — the dependency-free GitHub Pages product site.
- <code>brand/</code> — deterministic source artwork for the app and launch
  assets.

Comments focus on the Windows, rendering, and security decisions that are not
obvious from the code.

## Contribute

Real documents are the best compatibility tests. Try one of your READMEs,
ideally with a Mermaid block, then
[report what rendered incorrectly](https://github.com/abooodbah/leanmark/issues/new/choose).

See
[CONTRIBUTING.md](https://github.com/abooodbah/leanmark/blob/main/CONTRIBUTING.md)
for setup and validation,
[ROADMAP.md](https://github.com/abooodbah/leanmark/blob/main/ROADMAP.md) for
current priorities, and
[CHANGELOG.md](https://github.com/abooodbah/leanmark/blob/main/CHANGELOG.md) for
release history.

## License

LeanMark is free to use, modify, and redistribute under the
[MIT License](https://github.com/abooodbah/leanmark/blob/main/LICENSE). Bundled
dependencies retain their own permissive licenses; see
[THIRD_PARTY_NOTICES.md](https://github.com/abooodbah/leanmark/blob/main/THIRD_PARTY_NOTICES.md).
