# LeanMark

**Read Markdown and Mermaid diagrams without opening an IDE. Everything renders
offline, with no Electron and no telemetry.**

![LeanMark showing a Mermaid flowchart and a table, with two documents open as tabs](docs/images/leanmark-mermaid.png)

*A Mermaid flowchart and a GFM table rendered offline, with a second document
open in a tab.*

![LeanMark's diagram viewer showing a Mermaid flowchart enlarged to fit the window, with zoom controls](docs/images/leanmark-diagram-viewer.png)

*New in 0.4.0: the expand button in a diagram's corner opens it full-window,
fitted and zoomable. Captured from the Linux build.*

Most Markdown tools are editors. VS Code, Typora, Obsidian, and MarkText are
built for writing, and most of them run on Electron. LeanMark is for reading.

It renders GitHub-flavored Markdown, local images, and Mermaid diagrams entirely
offline, using the system web runtime rather than a bundled Chromium. Raw HTML is
disabled, a strict CSP is enforced, and remote images and navigation are blocked,
which makes it usable in environments where outbound network calls are not
permitted.

## Install

On Windows:

```powershell
winget install abooodbah.LeanMark
```

This installs the portable Windows build. The optional installer inside the ZIP
adds Start menu and Open With entries; see [Windows x64](#windows-x64). To move
an existing winget installation to the newest release:

```powershell
winget upgrade abooodbah.LeanMark
```

A new version reaches winget once the community repository has accepted its
manifest, which can take a few days after the GitHub release.

### Microsoft Store

<a href="https://apps.microsoft.com/detail/9MSS4WKJ22ZV"><img src="https://get.microsoft.com/images/en-us%20dark.svg" width="200" alt="Download from the Microsoft Store"></a>

LeanMark is also in the [Microsoft Store](https://apps.microsoft.com/detail/9MSS4WKJ22ZV).
The Store build is signed by Microsoft, so Windows installs it without the
SmartScreen warning that the unsigned GitHub ZIP can show. It can also be
installed from the Store with winget:

```powershell
winget install --id 9MSS4WKJ22ZV --source msstore
```

### Scoop

```powershell
scoop bucket add lean https://github.com/abooodbah/scoop-bucket
scoop install lean/leanmark
```

### Homebrew (macOS)

```bash
brew install --cask abooodbah/tap/leanmark
```

The macOS build is not notarized by Apple, so macOS blocks the first launch.
Open LeanMark once, then choose **Open Anyway** under System Settings > Privacy &
Security. Later launches open normally.

### GitHub Releases

Windows, Linux (.deb), and macOS builds are also on the
[Releases](https://github.com/abooodbah/leanmark/releases) page.

## Platform releases

| Operating system | Architecture | v0.5.0 artifact | Runtime and verification |
| --- | --- | --- | --- |
| Windows 10 / 11 | x64 | [ZIP](https://github.com/abooodbah/leanmark/releases/download/v0.5.0/LeanMark-v0.5.0-windows-x64.zip) | Evergreen WebView2; CI-built, with source checks and the reader page tested in Edge |
| Ubuntu 24.04 / compatible Debian-based systems | x86-64 | [DEB](https://github.com/abooodbah/leanmark/releases/download/v0.5.0/LeanMark-v0.5.0-linux-x86_64.deb) | GTK 4 + WebKitGTK 6.0; package and WebKit smoke-verified in CI |
| macOS 12 or later | Intel + Apple silicon | [Universal app preview ZIP](https://github.com/abooodbah/leanmark/releases/download/v0.5.0/LeanMark-v0.5.0-macos-universal-preview.zip) | Preview: system WKWebView; CI verifies both Mach-O slices and a real WebKit smoke test |

Each artifact has an adjacent <code>.sha256</code> sidecar on the
[v0.5.0 release](https://github.com/abooodbah/leanmark/releases/tag/v0.5.0).
The verification column records tested coverage; it does not imply publisher
signing. The Windows column reflects CI; the WebView2 window itself was
runtime-verified on Windows 11 for 0.5.0, from a local build of the same source.
Windows ARM64, Linux ARM64, and distro-independent Linux packages are not part
of this release.

> [!IMPORTANT]
> The Windows executable on GitHub Releases is unsigned; the
> [Microsoft Store](https://apps.microsoft.com/detail/9MSS4WKJ22ZV) build is signed by
> Microsoft. The macOS preview bundle is ad-hoc signed with
> the hardened-runtime flag but is not Developer ID signed or notarized.
> Windows SmartScreen or macOS Gatekeeper may therefore require an explicit
> trust decision. Official project binaries are limited to assets attached to
> this repository's GitHub Releases. The published checksum proves byte
> identity with the release asset; it does not replace platform code signing.

## Package use

### Windows x64

The extracted ZIP is portable. <code>LeanMark.exe</code>,
<code>WebView2Loader.dll</code>, and the <code>assets</code> directory must
remain together. Markdown paths may be opened from the application or passed
as command-line arguments.

Windows marks files extracted from a downloaded ZIP as coming from the
internet and, because the executable is unsigned, checks
<code>LeanMark.exe</code> before every launch started from Explorer or a file
association, which makes each one slower. The installer below clears that mark
on the installed copy. For a portable copy, clear it once from the extracted
folder:

~~~powershell
Get-ChildItem -Recurse | Unblock-File
~~~

The optional current-user integration entry point is:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1 -OpenDefaultAppsSettings
~~~

It copies LeanMark to <code>%LOCALAPPDATA%\Programs\LeanMark</code>, creates
Start menu and Open With entries, and registers Default Apps capabilities. It
does not write or delete Windows' protected <code>UserChoice</code> value.
Removal is available through Windows Settings or the installed uninstaller:

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\Programs\LeanMark\uninstall.ps1"
~~~

### Linux x86-64

The Debian package declares its GTK 4 and WebKitGTK 6.0 dependencies. A local
download can be installed through APT:

~~~sh
sudo apt install ./LeanMark-v0.5.0-linux-x86_64.deb
~~~

The package installs <code>/usr/bin/leanmark</code>, desktop and AppStream
metadata, the application icon, and the offline reader assets. It advertises
Markdown support to the desktop without forcibly replacing an existing default
application.

### macOS universal preview

The ZIP contains <code>LeanMark.app</code> with native Intel and Apple-silicon
slices. The application bundle may be placed in <code>/Applications</code> or
another application directory. Finder recognizes the four supported Markdown
extensions and offers LeanMark as a viewer.

Because the v0.5.0 preview is not notarized, Gatekeeper may block the first launch.
macOS records any explicit approval under **System Settings > Privacy &
Security**. Environments that require a Developer ID/notarized application are
not supported by this release.

## Use cases and scope

LeanMark is designed for:

- opening a local README or generated report without loading an editor;
- offline GFM tables, task lists, local images, and Mermaid diagrams;
- focused reading without vault, workspace, or authoring features; and
- inspectable, MIT-licensed source with reproducible package checks.

LeanMark is not a Markdown editor, an Obsidian-style knowledge base, a
browser-free renderer, or a claim to the lowest possible RAM use.

## Reader features

- CommonMark plus GFM tables, task lists, autolinks, and strikethrough.
- Lazy, offline Mermaid rendering with strict mode and bounded diagram input.
- Relative local images and relative Markdown document links.
- Automatic outline, find, reading progress, and printing.
- Five reader themes: System, Light, Dark, and two softer dark themes, Dim
  (neutral grey) and Dusk (warm), with less contrast than Dark for long
  reading. The theme button in the toolbar, or Ctrl+Shift+T, steps through
  them, and LeanMark remembers the choice.
- Page zoom in fixed steps (50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200,
  250, and 300%). The new level shows briefly, and LeanMark remembers it for
  the next launch.
- An expand button in the bottom-right corner of every Mermaid diagram and
  standalone image. It opens the figure full-window, fitted to the window,
  with its own zoom from 10% to 800%, panning, and keyboard control. Inline
  images such as badges and very small images get no button.
- A copy button on every heading that copies that section's Markdown, and a
  toolbar button that copies the whole file. The copy comes from the file, not
  the rendered page.
- On Windows, every Markdown file you open joins the running window as a tab.
  Background tabs keep no rendered page and are read again when selected.
- Live refresh after a save while retaining the last complete render and
  approximate reading position.
- Support for <code>.md</code>, <code>.markdown</code>, <code>.mdown</code>,
  and <code>.mkd</code>.
- UTF-8 validation and a 32 MiB document safety limit.

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Open a Markdown file | Ctrl+O | Command+O |
| Find | Ctrl+F | Command+F |
| Next / previous match | Enter / Shift+Enter or F3 / Shift+F3 | Enter / Shift+Enter |
| Reload from disk | Ctrl+R | Command+R |
| Zoom in / out / reset | Ctrl++ (or Ctrl+=) / Ctrl+- / Ctrl+0 | Command++ / Command+- / Command+0 |
| Cycle reader theme | Ctrl+Shift+T | Command+Shift+T |
| Copy the whole document | Ctrl+Shift+C | Command+Shift+C |
| Next / previous tab (Windows) | Ctrl+Tab / Ctrl+Shift+Tab | Window menu |
| Go to tab 1 to 8 / last tab (Windows) | Ctrl+1 to Ctrl+8 / Ctrl+9 | Window menu |
| Close tab (Windows) | Ctrl+W | Window menu |
| Open a link in a new tab (Windows) | Ctrl+click or middle-click | Not available |
| Print | Ctrl+P | Command+P |
| Leave find | Escape | Escape |

In the figure viewer, opened with a figure's expand button:

| Action | Keys and pointer |
| --- | --- |
| Zoom in / out | + or = / - (with or without Ctrl or Command), or Ctrl+wheel at the pointer |
| Fit to the window / actual size | 0 / 1, or double-click to switch between them |
| Pan | Arrow keys (Shift for larger steps), drag, or the scroll wheel |
| Close | Escape, the close button, or a click on the empty background |

Mermaid uses its familiar fenced syntax:

~~~~text
~~~mermaid
flowchart LR
    File[Markdown file] --> Parse[Portable MD4C core]
    Parse --> Host[Native desktop host]
    Host --> Read[LeanMark reader]
~~~
~~~~

## Architecture

~~~mermaid
flowchart LR
    File[Local Markdown file] --> Core[Portable C++ / MD4C core]
    Core --> Host{Native host}
    Host -->|Win32| W[WebView2]
    Host -->|GTK 4| L[WebKitGTK]
    Host -->|AppKit| M[WKWebView]
    W --> Reader[Shared offline reader]
    L --> Reader
    M --> Reader
~~~

The parser owns UTF-8 validation, the 32 MiB limit, GFM rendering, raw-HTML
disablement, and Mermaid detection. Native hosts own file dialogs, file
watching, appearance, printing, external links, and web-runtime policy. The
reader HTML, CSS, JavaScript, Mermaid bundle, and fonts are identical across
packages.

The rationale and security contract are documented in
[the cross-platform architecture decision](https://github.com/abooodbah/leanmark/blob/main/docs/architecture/cross-platform-port.md).

## Measured Windows footprint

A small package does not imply a tiny in-memory process tree. The figures below
compare the 0.2.0 and 0.3.0 releases on the same machine and day.
Each is the median of ten warm launches from
<code>tests/Measure-Performance.ps1</code> with a three-second observation
window, and covers LeanMark plus every WebView2 process it starts. No Linux or
macOS values are inferred from them.

| Measurement | Simple, 0.2.0 | Simple, 0.3.0 | Showcase, 0.2.0 | Showcase, 0.3.0 |
| --- | ---: | ---: | ---: | ---: |
| Native window visible | 70.39 ms | 74.15 ms | 93.43 ms | 88.62 ms |
| Peak private memory, full process tree | 163.91 MiB | 96.79 MiB | 205.70 MiB | 125.31 MiB |
| Peak working set, full process tree | 335.57 MiB | 294.71 MiB | 372.25 MiB | 339.08 MiB |
| Observed process count | 7 | 6 | 7 | 6 |

Opening five documents in one launch (the four test fixtures and this README)
peaked at 447.66 MiB private and 15 processes in 0.2.0, which started a reader
per document. 0.3.0 opens them as tabs of one reader and peaked at
120.56 MiB and 6 processes, because only the visible tab is rendered. Two of the
ten 0.2.0 launches joined the previous launch's still-running browser, so their
trees were incomplete; that median uses the other eight.

Environment: Windows 11 Pro build 26200, Intel Core i7-13620H, 16 logical
processors, 15.6 GiB RAM, and WebView2 Runtime 153.0.4234.48. Hardware, system
state, runtime version, and document complexity affect results.

The Windows process-tree figures have not been re-measured for 0.4.0. Its
efficiency work is in the shared parser core, which every host uses, and in
how each host hands a document to its reader. The core was timed on a 22.8 MiB
generated document (this README and the showcase fixture repeated), best of
five runs, on Linux x86-64 with GCC 13 at -O2:

| Core step, 22.8 MiB document | 0.3.0 | 0.4.0 |
| --- | ---: | ---: |
| Validate and render to HTML | 177.7 ms | 135.4 ms |
| Escape the HTML for the reader message | 88.3 ms | 38.8 ms |
| Copy the whole document as Markdown | 105.2 ms | 3.7 ms |
| Memory held by the rendered HTML (27.9 MiB of text) | 53.0 MiB | 34.3 MiB |

In 0.3.0 the Linux and macOS hosts kept that HTML for as long as the window was
open; 0.4.0 releases it once the reader has the page. Windows already released
it, and now does so before the message is converted for WebView2, so one fewer
document-sized buffer is alive at the peak.

The measurement helper and method are documented in
[tests/README.md](https://github.com/abooodbah/leanmark/blob/main/tests/README.md).
No unmeasured comparison against VS Code or
another application is claimed.

## Privacy and security

Markdown is treated as untrusted input:

- MD4C runs with raw HTML disabled.
- The reader uses a strict, deny-by-default Content Security Policy.
- Application assets and current-document images use separate origins.
- Document image handlers canonicalize paths and reject directory traversal and
  symlink escapes.
- Remote images, unrequested navigation, downloads, popups, permissions, and
  script dialogs are blocked.
- Mermaid runs with <code>securityLevel: "strict"</code>.
- External HTTP(S) and mail links leave the reader only after a click and open
  through the operating-system handler. No command shell is involved.
- WebKit hosts use nonpersistent browser data stores; all rendering libraries
  and fonts are bundled locally.

LeanMark's own code makes no network requests. On Windows, however, the page is
drawn by Microsoft's WebView2 runtime, which can contact Microsoft services on
its own. On one Windows 11 PC with a work account added to Windows, the runtime
held two connections to Microsoft 365 (`substrate.office.com`, port 443) while
LeanMark 0.3.0 was open. Chromium's network log from that launch recorded no
request other than LeanMark's local reader page and Windows proxy
auto-detection (WPAD) lookups, so the connections do not come from the document
or the reader. They also appeared with a new, empty WebView2 profile. Other PCs
have not been measured.

Windows security smoke tests exercise hostile input in WebView2. Linux and
macOS CI run their platform-specific source policy, core, package/bundle, and
real-WebKit checks.

Private vulnerability reports follow
[SECURITY.md](https://github.com/abooodbah/leanmark/blob/main/SECURITY.md).

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

LeanMark opens an external link only when you click it, and then hands it to
the operating system. On Windows, LeanMark displays documents through
Microsoft's Edge WebView2 runtime, which Microsoft installs and updates and
which is not part of LeanMark. That runtime can contact Microsoft services on
its own. On one measured PC it held connections to `substrate.office.com`, and
the measurement found that they do not come from LeanMark's reader or the
document; details are under [Privacy and security](#privacy-and-security).
The runtime's own network use is governed by the
[Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement).

## Uninstall

- Windows, installed copy: Settings > Apps > Installed apps > LeanMark, or the
  installed <code>uninstall.ps1</code> shown under [Windows x64](#windows-x64).
- Windows, portable copy: delete the extracted folder.
- Windows, through winget: <code>winget uninstall abooodbah.LeanMark</code>.
- Linux: <code>sudo apt remove leanmark</code>.
- macOS: move <code>LeanMark.app</code> to the Trash.

## Source builds

Node.js 20 or later installs the pinned Mermaid and IBM Plex build-time assets.
Node.js is not a runtime dependency.

### Windows

Requirements: Visual Studio 2022 Build Tools with MSVC v143, the Evergreen
WebView2 Runtime, and Node.js.

~~~powershell
.\scripts\build.ps1 -Configuration Release -Platform x64
.\tests\Test-LeanMark.ps1 -DistPath .\dist
.\scripts\package-release.ps1 -Version 0.5.0
~~~

### Linux

Requirements: CMake 3.22+, Ninja, a C++17 compiler, pkg-config, GTK 4,
WebKitGTK 6.0, Node.js, and Debian packaging tools. Ubuntu 24.04 build packages:

~~~sh
sudo apt install build-essential cmake ninja-build pkg-config \
  libgtk-4-dev libwebkitgtk-6.0-dev
./scripts/package-linux.sh --version 0.5.0
~~~

### macOS

Requirements: macOS 12+, Xcode command-line tools, CMake 3.24+, and Node.js.

~~~sh
npm ci --ignore-scripts --no-audit --no-fund
cmake -S . -B obj/macos -G Xcode -DCMAKE_BUILD_TYPE=Release
cmake --build obj/macos --config Release
ctest --test-dir obj/macos -C Release --output-on-failure
cmake --build obj/macos --config Release --target package_macos
~~~

Developer ID signing and notarization require credentialed, protected release
automation and are not simulated by the public CI build.

### Project map

- <code>src/core/</code>: portable file policy, UTF-8 validation, and MD4C
  rendering.
- <code>src/</code>: Windows host, resources, and Visual Studio project.
- <code>src/linux/</code> and <code>packaging/linux/</code>: GTK/WebKitGTK
  host and Debian metadata.
- <code>macos/</code>: AppKit/WKWebView host, bundle metadata, and packaging.
- <code>assets/</code>: shared trusted reader UI and security policy.
- <code>scripts/</code>: deterministic asset and release staging.
- <code>tests/</code>: static invariants, hostile fixtures, runtime/DOM smoke,
  package checks, and performance helpers.
- <code>site/</code>: dependency-free GitHub Pages product site.

## Related tools

LeanMark is for reading Markdown.
[LeanDoc](https://github.com/abooodbah/leandoc) is for reading Word documents
(`.docx`) without opening an office suite, and
[LeanRows](https://github.com/abooodbah/leanrows) is for viewing large CSV and
log files. All three are read-only, work offline, and are MIT licensed.

## Contributing

Compatibility reports based on real, non-private Markdown documents are
welcome, especially documents containing local images or Mermaid blocks.
Rendering issues belong in the
[issue tracker](https://github.com/abooodbah/leanmark/issues/new/choose).

Contribution guidance, current priorities, and release history are documented
in
[CONTRIBUTING.md](https://github.com/abooodbah/leanmark/blob/main/CONTRIBUTING.md),
[ROADMAP.md](https://github.com/abooodbah/leanmark/blob/main/ROADMAP.md), and
[CHANGELOG.md](https://github.com/abooodbah/leanmark/blob/main/CHANGELOG.md).

## License

LeanMark is free to use, modify, and redistribute under the [MIT License](LICENSE).
Bundled dependencies retain their own permissive licenses; details are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
