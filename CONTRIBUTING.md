# Contributing to LeanMark

Thank you for helping improve LeanMark. Bug reports, focused feature ideas,
documentation fixes, tests, and code changes are welcome.

## Before you start

- Search existing issues before opening a new one.
- Use the bug or feature form so the report includes the details needed for
  review.
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities. Do not include
  sensitive security details in a public issue.
- Open a feature request before making a large change, adding a runtime
  dependency, or changing the installer or rendering architecture.

## Development setup

All platform builds require Node.js 20 or newer for pinned fonts and Mermaid
assets. Native toolchains are platform-specific:

- Windows: Visual Studio 2022 Build Tools, MSVC v143, Windows SDK, and the
  Evergreen WebView2 Runtime.
- Ubuntu 24.04: CMake, Ninja, a C++17 compiler, pkg-config, GTK 4, and
  WebKitGTK 6.0 development packages.
- macOS 12 or later: Xcode command-line tools and CMake 3.24 or newer.

Node.js is used only to stage pinned fonts and Mermaid assets. It is not a
runtime dependency.

Windows release build:

```powershell
.\scripts\build.ps1 -Configuration Release
```

The build restores pinned packages, compiles the C++17 application, and creates
the portable `dist\` directory. Installing LeanMark is not required for normal
development.

Linux and macOS build/package commands are maintained in the platform sections
of [README.md](README.md).

## Project layout

- `src/core/` contains the portable Markdown, UTF-8, and resource-path policy.
- `src/` contains the Win32/WebView2 host and Windows project.
- `src/linux/` and `packaging/linux/` contain the GTK/WebKitGTK host and
  Debian metadata.
- `macos/` contains the AppKit/WKWebView host, tests, and bundle packaging.
- `assets/` contains the shared local reader HTML, CSS, and JavaScript.
- `installer/` contains the per-user install and uninstall scripts.
- `tests/` contains PowerShell checks, fixtures, DOM smoke tests, and performance
  measurement helpers.
- `third_party/md4c/` is vendored upstream source. Change it only as part of a
  deliberate dependency update.

## Project conventions

- Keep LeanMark a fast, read-only, offline-capable Markdown viewer.
- Treat Markdown, Mermaid, links, and local resources as untrusted input.
  Preserve every host's navigation, resource, permission, popup, and download
  restrictions unless the change includes a clear security review.
- Use C++17 and follow `.editorconfig`: four spaces for C++ and headers, and two
  spaces for web assets, YAML, Markdown, JSON, and PowerShell.
- Keep dependencies pinned. Update `THIRD_PARTY_NOTICES.md` when a dependency or
  its license changes.
- Add or update a focused fixture or test when behavior changes.

## Validate a change

Run the affected platform Release build and checks for code or runtime-asset
changes. Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1 -Configuration Release
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1
```

Run the checks that match the affected area:

```powershell
# Native window, argument handling, or multi-file behavior
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Runtime

# Rendered HTML, CSS, JavaScript, Mermaid, or resource security
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Dom

# Read-only verification after deliberately installing LeanMark
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-LeanMark.ps1 -Registry

# Public site markup, assets, responsive layout, focus, and browser console
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\Test-Site.ps1
node .\tests\Invoke-SiteBrowserSmoke.mjs --site .\site
```

Linux and macOS CTest commands are listed in [README.md](README.md). CI builds
all three platforms; a platform failure is not treated as optional when shared
core or reader assets change.

Describe any skipped check in the pull request. Include screenshots for visible
changes and remove private information from sample Markdown files.

## Submit a pull request

Keep the change focused, explain its user-visible effect, and link the related
issue. The pull request template lists the final review and validation points.

Contributions are submitted under the repository's [MIT License](LICENSE).
