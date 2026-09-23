# Changelog

All notable LeanMark changes are recorded here. The project follows semantic
versioning.

## [0.3.0] - 2026-09-23

### Added

- A copy button on every heading. It copies that section, from the heading to
  the next heading of the same or a higher level, subsections included. The
  toolbar Copy button (Ctrl+Shift+C) copies the whole document. On all three
  hosts the copy is the Markdown source read from the file, found with the same
  parser that drew the page, so fenced code that looks like a heading is not
  mistaken for one.
- Tabs on Windows. Opening a Markdown file while LeanMark is running adds a tab
  to the open window instead of starting another reader. Ctrl+Tab and
  Ctrl+Shift+Tab switch tabs, Ctrl+1 to Ctrl+9 select one, Ctrl+W closes one,
  and Ctrl+click or middle-click opens a linked document in a new tab. The open
  dialog accepts several files. A file that is already open is brought forward
  rather than opened twice.
- The Windows host reloads the reader from disk if its renderer process exits,
  instead of leaving a blank window.

### Changed

- Windows runs one reader per executable path. A later launch hands its files
  to the running window through WM_COPYDATA and exits.
- Lower memory on Windows. Median peak private memory for the whole process
  tree fell from 163.91 to 96.79 MiB for the simple fixture, from 205.70 to
  125.31 MiB for the Mermaid showcase, and from 447.66 to 120.56 MiB with five
  documents open (see the README for the method).
- WebView2 now starts with GPU rasterization off, which static text does not
  need. Tracking prevention, SmartScreen checks, and autofill are off and the
  network service runs inside the browser process, because the reader's CSP
  blocks every web request and leaves them nothing to do.
- A background tab keeps no HTML or DOM. Selecting it reads the file again, so
  it never shows stale text, and only the visible tab's file is watched.
- A minimized window stops watching its file, hides and suspends its web view,
  and asks WebView2 to use less memory until it is restored.
- Document images on Windows now load from one origin per open folder,
  `d<N>.doc.leanmark.invalid`, answered by the host with the same path checks
  and image types as the Linux host. A WebView2 folder mapping only applies
  after a page reload, which tabs from new folders cannot wait for.
- The Windows and Linux hosts build each message to the reader in one buffer.
  The Windows host no longer keeps the rendered HTML after sending it, and no
  longer copies each file into a second buffer before parsing it.
- `tests/Measure-Performance.ps1` accepts several documents for one launch.

## [0.2.0] - 2026-08-08

### Added

- Native Linux x86-64 host using GTK 4 and WebKitGTK 6.0, packaged for
  Ubuntu 24.04 and compatible Debian-based systems.
- Native Universal 2 macOS host using AppKit and WKWebView for Intel and Apple
  silicon.
- Shared portable C++ Markdown core and one platform-neutral reader bridge.
- Cross-platform asset staging, package verification, and release aggregation.
- Native Markdown document declarations for Linux desktop environments and
  macOS Finder.
- Architecture and security documentation for the three host implementations.

### Changed

- Public documentation now describes the project and its platform support in
  neutral language instead of assuming a Windows machine.
- Reader assets use a confined document-resource scheme on WebKit hosts while
  preserving the existing WebView2 virtual host.
- Community issue and review templates collect operating-system and system
  web-runtime evidence.

### Known limitations

- Windows binaries remain unsigned.
- The macOS bundle is ad-hoc signed and is not notarized; a Developer ID
  release requires Apple Developer Program credentials.
- The Linux package targets Ubuntu 24.04 / Debian-compatible x86-64 systems;
  it is not a distro-independent package.
- Platform-specific performance figures are not interchangeable. The published
  baseline remains explicitly scoped to the verified Windows configuration.

## [0.1.0] - 2026-08-08

### Added

- Focused, read-only CommonMark and GFM viewing on Windows x64.
- Offline Mermaid 11.16.1 rendering with lazy bundle loading.
- Local images, relative Markdown links, outline, find, zoom, print, themes,
  reading progress, and safe live refresh.
- Native C++17 host with MD4C and a hardened WebView2 reader.
- Per-user Open With and Default Apps integration with owned-file uninstall.
- Hostile-input, DOM, runtime, installer, and performance verification.
- Reproducible Windows ZIP packaging with a SHA-256 sidecar.
- MIT license, contributor guidance, security policy, roadmap, and issue forms.
- Branded application icon and the public LeanMark product site.

### Known limitations

- The Windows executable is not yet code signed.
- Windows x64 is the only shipped platform.
- WebView2 keeps the package small but uses a browser-process memory footprint.
- LeanMark reads Markdown; it does not edit or manage a document vault.

[0.3.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.3.0
[0.2.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.2.0
[0.1.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.1.0
