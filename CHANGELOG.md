# Changelog

All notable LeanMark changes are recorded here. The project follows semantic
versioning.

## [0.4.1] - 2026-10-20

### Fixed

- An installed LeanMark was slow to start from a file association or the Start
  menu when it was installed from a downloaded ZIP. Explorer marks files
  extracted from a download as coming from the internet, the installer copied
  that mark onto the installed files, and Windows then checked the unsigned
  executable before every launch. The installer now clears the mark on the
  installed copy. Running the 0.4.1 installer over an existing installation
  fixes it. Launches without the mark measure the same in 0.3.0, 0.4.0, and
  0.4.1.
- Installing over, or uninstalling, a LeanMark that is open from the install
  directory stopped with a file-in-use error. Both now ask it to close first,
  wait up to ten seconds, and otherwise stop with a clear message before
  changing anything.

### Added

- `tests/Compare-LaunchTime.ps1` and a Compare launch time workflow that time
  releases and the current branch to a rendered document on Windows.
- `tests/Test-DownloadedInstall.ps1`, run in CI, installs a package marked as
  downloaded and starts the installed copy through the shell.
- The README and the package's INSTALL.txt explain how to clear the mark on a
  portable copy.

## [0.4.0] - 2026-10-20

### Added

- An expand button in the bottom-right corner of every rendered Mermaid
  diagram and every standalone image. It is semi-transparent until hovered or
  focused. It opens the figure in a full-window viewer that follows the reader
  theme and fits the figure to the window. The viewer zooms from 10% to 800%
  with + and -, fits with 0, shows actual size with 1, pans with the arrow keys
  or a drag, zooms at the pointer with Ctrl+wheel, and closes with Escape or a
  click on the background. Inline images such as badges, and images smaller
  than 48 by 24 pixels, get no button.
- Page zoom steps through fixed levels (50% to 300%, the familiar browser
  steps) on all three hosts instead of adding or removing 10% at a time. The
  new level shows briefly at the bottom of the window and is remembered for
  the next launch. Ctrl+= now zooms in as well as Ctrl++.
- On macOS the View menu's zoom commands zoom an expanded figure when one is
  open.
- A browser test for the reader page (`tests/Invoke-ReaderBrowserSmoke.mjs`),
  run in CI with Chrome on Linux and Edge on Windows. The Linux and macOS
  WebKit smoke tests now also expand and restore a figure.
- `packaging/winget/README.md` and a release job that submits each new
  version to winget when a `WINGET_TOKEN` secret is configured.

### Changed

- Faster parser core: UTF-8 validation and JSON escaping test eight bytes at
  a time, and rendered HTML is reserved up front instead of grown by doubling.
  On a 22.8 MiB document, rendering went from 177.7 to 135.4 ms, escaping from
  88.3 to 38.8 ms, and the HTML buffer from 53.0 to 34.3 MiB.
- Copying the whole document no longer parses it for headings first (105.2 to
  3.7 ms on the same document).
- The Linux and macOS hosts release their copy of the rendered HTML once the
  reader has it, and render the file again if the page reloads. The Linux host
  builds its reader message in place instead of copying it.
- The Windows host releases the HTML and the UTF-8 message before WebView2
  copies the UTF-16 one, so one fewer document-sized buffer is alive at once.
- The reader measures reading progress at most once per frame, runs a search
  after a short pause in typing (Enter and F3 run it at once), and builds the
  outline and section-copy buttons in one pass over the headings.

### Fixed

- With "show animations" turned off in the operating system, Mermaid could
  lay a diagram out at the wrong size (a five-box flowchart came out square),
  because the reduced-motion style made every property of every element
  transition. Reduced motion now turns transitions off instead. The website
  had the same rule and is fixed too.
- Mermaid diagrams after the fiftieth showed the "Diagram limit reached"
  message but were still rendered behind it. They are now left unrendered.

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

[0.4.1]: https://github.com/abooodbah/leanmark/releases/tag/v0.4.1
[0.4.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.4.0
[0.3.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.3.0
[0.2.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.2.0
[0.1.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.1.0
