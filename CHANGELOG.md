# Changelog

All notable LeanMark changes are recorded here. The project follows semantic
versioning.

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

[0.2.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.2.0
[0.1.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.1.0
