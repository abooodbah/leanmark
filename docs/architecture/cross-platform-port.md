# Cross-platform desktop port

Status: accepted for LeanMark 0.2.0
Date: 2026-08-08

## Context

LeanMark 0.1.0 uses a C++17 Win32 host, MD4C, WebView2, and a local
HTML/CSS/JavaScript reader. The parser and reader experience are product
behavior; Win32 and WebView2 are platform adapters.

A cross-platform release must preserve the properties already tested on
Windows:

- Markdown is read-only and parsed with raw HTML disabled.
- Reader assets and Mermaid stay local.
- Network requests, unexpected navigation, popups, downloads, and permissions
  are denied.
- Local images are limited to the current document directory.
- External HTTP(S) and mail links open only after an explicit click.
- Platform packages stay small by using each operating system's web runtime.

## Decision

LeanMark keeps one portable C++ rendering core and one shared reader UI. Each
operating system receives a thin native host:

| Platform | Native shell | System renderer | Release artifact |
| --- | --- | --- | --- |
| Windows x64 | Win32 C++ | Evergreen WebView2 | ZIP with optional per-user installer |
| Linux x64 | GTK 4 C++ | WebKitGTK 6.0 | Debian package |
| macOS universal | AppKit Objective-C++ | WKWebView | Universal application ZIP |

Electron, Qt WebEngine, and a bundled browser runtime are intentionally
excluded. They would duplicate a browser engine in every download and work
against LeanMark's focused footprint.

## Boundaries

~~~mermaid
flowchart LR
  F[Local Markdown file] --> C[Portable C++ core]
  C -->|safe HTML + metadata| H[Native host]
  H --> R[Shared reader assets]
  R --> W[System web runtime]
  W -->|open, reload, theme, zoom, link, copy-source, tab| H
  H -->|document, empty, error, status, host, copied, tabs| W
~~~

The portable core owns file-size enforcement, UTF-8 validation, MD4C flags,
HTML generation, and Mermaid detection. Hosts own file selection, file-change
observation, theme persistence, external-link dispatch, application lifecycle,
and the web-runtime security policy.

The reader bridge has two equivalent adapters:

- WebView2: $window.chrome.webview__
- WebKitGTK and WKWebView: $window.webkit.messageHandlers.leanmark__

Hosts send data through a single $leanmark-message__ DOM event. No host
injects Markdown source as executable JavaScript; it injects a JSON value as
event detail.

Section copy is answered by the host, not the page. The reader sends the
heading's index and the number of headings it rendered; the host reads the file,
finds the section with the same MD4C parser and flags that produced the page, and
writes the Markdown to the system clipboard. A heading count that no longer
matches means the file changed, so the host shows the new version instead of
copying the wrong section. A host that does not announce `copySource` gets a
copy of the rendered text instead.

On Windows one reader process serves every document as a tab. A later launch
hands its paths to the running window with WM_COPYDATA and exits. Background
tabs keep no HTML or DOM; selecting a tab reads its file again.

## Resource policy

Application assets are exposed from a read-only app origin. Document-relative
images use a separate document origin that is mapped only to the current
document directory. On Windows each open folder gets its own origin,
`d<N>.doc.leanmark.invalid`, answered by the host rather than by a WebView2
folder mapping, because a mapping added after the page loads is not applied
until the next navigation. Host implementations canonicalize every requested
path and reject traversal outside the mapped root.

The reader Content Security Policy remains deny-by-default. Host navigation
delegates allow the reader origin and $about:blank__ only. New windows,
downloads, permission prompts, and unrequested navigation are cancelled.

## Packaging and support

The Linux package targets Ubuntu 24.04 / Debian-compatible x86-64 systems and
declares GTK 4 and WebKitGTK 6.0 runtime dependencies. A dependency-bearing
tarball is not labeled portable or published as a first-release artifact.

The macOS application is a universal Intel/Apple-silicon bundle. Until an Apple
Developer ID is available, CI applies an ad-hoc signature and the release notes
state that the build is not notarized. The project must not describe an
unsigned or unnotarized artifact as trusted by Gatekeeper.

Windows packaging and registration remain unchanged.

## Verification gates

Every pull request must:

1. build the Windows x64, Linux x64, and macOS universal hosts;
2. run portable parser tests on all three operating systems;
3. run the existing Windows security and distribution suite;
4. verify Linux package contents and dynamic dependencies;
5. verify the macOS bundle, both Mach-O architectures, property list, and
   ad-hoc signature; and
6. verify that public documentation names only artifacts the workflow creates.

Tag builds publish every verified artifact plus a SHA-256 sidecar in one GitHub
Release.

## Consequences

Native hosts add some platform-specific code, but keep runtime downloads small
and let each desktop use its own file picker, windowing, accessibility bridge,
and URL handler. Shared parsing and reader assets prevent rendering behavior
from drifting between platforms.

The first cross-platform release does not promise Linux ARM64, a sandboxed Mac
App Store build, code signing/notarization, Windows ARM64, or automatic default
file-association changes on Linux or macOS.
