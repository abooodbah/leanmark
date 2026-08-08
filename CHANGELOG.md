# Changelog

All notable LeanMark changes are recorded here. The project follows semantic
versioning.

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

[0.1.0]: https://github.com/abooodbah/leanmark/releases/tag/v0.1.0
