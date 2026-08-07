# LeanMark

LeanMark is a fast, read-only Markdown viewer for Windows. It gives ordinary
Markdown files a clean reading surface, renders Mermaid diagrams locally, and
avoids the editor panes, extensions, and project indexing that make a full IDE
unnecessarily heavy for simple reading.

The native host is C++17. It compiles the small MD4C parser directly into the
executable and reuses the Evergreen WebView2 runtime already shared by Windows.
There is no Electron, .NET, Rust, Node.js, or network dependency at runtime.

## What it does

- Renders CommonMark and GitHub-style tables, task lists, autolinks, and
  strikethrough.
- Renders fenced Mermaid diagrams offline and only loads Mermaid when a
  document actually contains a diagram.
- Displays relative local images, blocks remote images, and opens web links in
  the normal browser after an explicit click.
- Provides instant find, an automatic outline for longer documents, reading
  progress, print support, reader zoom, and system/light/dark themes.
- Watches the open file and refreshes after a save while preserving the
  approximate reading position.
- Opens relative Markdown links inside LeanMark.
- Uses a 32 MB input limit and keeps the last complete view if a file is caught
  mid-save.

## Install on this computer

Build and install for the current Windows user:

~~~powershell
.\scripts\build.ps1 -Configuration Release
.\installer\install.ps1 -OpenDefaultAppsSettings
~~~

The installer copies the portable release to
<code>%LOCALAPPDATA%\Programs\LeanMark</code>, adds LeanMark to Open With and
Windows Default Apps, and creates a Start menu shortcut. It never edits or
deletes Windows' protected <code>UserChoice</code> value.

On a machine that has no existing explicit Markdown choice, the per-user
association can take effect immediately. Otherwise Windows opens its Default
Apps page so the user can confirm LeanMark for <code>.md</code>. This one-time
confirmation is a Windows security requirement.

To remove it:

~~~powershell
.\installer\uninstall.ps1
~~~

Uninstall removes only LeanMark-owned files, shortcuts, and registry entries.
It preserves every other Markdown handler and any Windows UserChoice.

## Everyday use

Double-click an <code>.md</code> file or choose Open in LeanMark. The reader
also accepts <code>.markdown</code>, <code>.mdown</code>, and <code>.mkd</code>.

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

Mermaid uses the familiar fenced syntax:

~~~mermaid
flowchart LR
    File[Markdown file] --> Parse[Native MD4C parser]
    Parse --> Read[LeanMark reading surface]
    Parse --> Diagram[Local Mermaid renderer]
    Diagram --> Read
~~~

## Build from source

Requirements:

- Windows 10 or 11, x64
- Visual Studio 2022 Build Tools with the MSVC v143 toolset
- Node.js 20 or newer for build-time assets only
- Evergreen WebView2 Runtime

Run:

~~~powershell
.\scripts\build.ps1
~~~

The deterministic build restores pinned packages, compiles the native Release
binary, and creates <code>dist\</code>. Only the WebView2 loader, three
hand-authored reader files, one Mermaid browser bundle, five font files, and
the license documents are staged. The rest of <code>node_modules</code> is
never shipped.

The source is intentionally organized by responsibility:

- <code>src/main.cpp</code> parses Windows arguments safely and starts one
  reader window per document.
- <code>src/App.cpp</code> owns the native window, WebView2 hardening, file
  picker, live reload, themes, zoom, and safe link routing.
- <code>src/Markdown.cpp</code> performs bounded UTF-8 file reading and safe
  GFM-to-HTML rendering.
- <code>assets/reader.js</code> handles the document outline, find ranges,
  local-image rewriting, and lazy Mermaid rendering.
- <code>assets/reader.css</code> is the content-first light/dark reading
  system.
- <code>installer/</code> contains a per-user installer and safe uninstaller.
- <code>tests/</code> contains fixtures, security invariants, and resource
  measurement helpers.

Comments explain the Windows, security, and rendering decisions that are not
obvious from the code itself. Straightforward assignments are intentionally
left uncluttered.

## Privacy and security

Markdown files are treated as untrusted input:

- MD4C runs with raw HTML disabled.
- The reader page has a strict Content Security Policy.
- The app origin and the current document-image folder are separate virtual
  hosts.
- Remote images, custom URL schemes, downloads, popups, permissions, and
  in-reader external navigation are blocked.
- Mermaid runs with <code>securityLevel: "strict"</code>.
- External HTTP, HTTPS, and mail links are handed to Windows only after a
  click. No command shell is involved.

The application does not send document contents anywhere and works offline.

## Efficiency expectations

LeanMark's own native executable and assets are small. WebView2 still launches
sandboxed renderer/GPU child processes, so its total working set is larger
than a custom text-only control. That is the practical tradeoff that provides
high-quality tables, selectable text, accessibility, images, printing, and
Mermaid diagrams while remaining materially leaner than opening a full VS
Code session. See the measured release figures in the project handoff or run
the scripts under <code>tests\</code> on your own hardware.

## License

LeanMark is free to use, modify, and redistribute under the MIT License. See
[LICENSE](LICENSE). Bundled dependencies retain their own permissive licenses;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
