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

LeanMark currently builds on Windows x64. You need:

- Windows 10 or 11
- Visual Studio 2022 Build Tools with the MSVC v143 toolset and Windows SDK
- Node.js 20 or newer
- Evergreen WebView2 Runtime

Node.js is used only to stage pinned fonts and Mermaid assets. It is not a
runtime dependency.

From a PowerShell prompt in the repository root, build a release:

```powershell
.\scripts\build.ps1 -Configuration Release
```

The build restores pinned packages, compiles the C++17 application, and creates
the portable `dist\` directory. Installing LeanMark is not required for normal
development.

## Project layout

- `src/` contains the native Win32 and WebView2 host and the MD4C integration.
- `assets/` contains the local reader HTML, CSS, and JavaScript.
- `installer/` contains the per-user install and uninstall scripts.
- `tests/` contains PowerShell checks, fixtures, DOM smoke tests, and performance
  measurement helpers.
- `third_party/md4c/` is vendored upstream source. Change it only as part of a
  deliberate dependency update.

## Project conventions

- Keep LeanMark a fast, read-only, offline-capable Markdown viewer.
- Treat Markdown, Mermaid, links, and local resources as untrusted input.
  Preserve the WebView2 navigation, resource, permission, popup, and download
  restrictions unless the change includes a clear security review.
- Use C++17 and follow `.editorconfig`: four spaces for C++ and headers, and two
  spaces for web assets, YAML, Markdown, JSON, and PowerShell.
- Keep dependencies pinned. Update `THIRD_PARTY_NOTICES.md` when a dependency or
  its license changes.
- Add or update a focused fixture or test when behavior changes.

## Validate a change

Run the release build and default checks for code or runtime-asset changes:

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

Describe any skipped check in the pull request. Include screenshots for visible
changes and remove private information from sample Markdown files.

## Submit a pull request

Keep the change focused, explain its user-visible effect, and link the related
issue. The pull request template lists the final review and validation points.

Contributions are submitted under the repository's [MIT License](LICENSE).
