# LeanMark per-user installer

These scripts install LeanMark for the current Windows user. They require no
administrator access and never edit or delete Windows UserChoice values.

## Install

Build the x64 Release app, then run this from the repository root:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1

The installer looks first in dist, then common Release output folders including
bin\x64\Release. To choose a portable payload explicitly:

    .\installer\install.ps1 -SourceDirectory 'C:\path\to\payload'

The payload must contain LeanMark.exe and WebView2Loader.dll. Optional assets,
LICENSE, THIRD_PARTY_NOTICES.md, and README.md content is copied when present.
The per-user destination is %LOCALAPPDATA%\Programs\LeanMark.

## Default-app behavior

LeanMark registers .md, .markdown, .mdown, and .mkd through its per-user
capabilities, ProgID, Applications entry, App Paths entry, and each extension's
OpenWithProgids list.

For each extension, install.ps1 checks the protected Explorer UserChoice key.
It writes a direct HKCU\Software\Classes extension default only when UserChoice
does not exist. It then calls SHChangeNotify and asks Windows which executable
is actually effective.

When another application remains the default, an interactive install offers to
open LeanMark's Windows Default Apps page. These switches are also available:

- OpenDefaultAppsSettings: open the settings page automatically when needed.
- Quiet: do not show the interactive settings prompt.

Windows intentionally requires user consent when an explicit default already
exists; the scripts do not bypass that protection.

## Uninstall

Use Settings > Apps > Installed apps > LeanMark, or run:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $env:LOCALAPPDATA\Programs\LeanMark\uninstall.ps1

The uninstaller validates that the recorded location is exactly
%LOCALAPPDATA%\Programs\LeanMark and rejects reparse-point traversal. It
removes LeanMark-specific registry trees, only LeanMark's values from shared
keys, the shortcut only when it still targets this installation, and only
manifest-listed files.

If the manifest is missing or invalid, a narrow list of known LeanMark files is
used. Unknown files and non-empty directories are kept. A prior direct Classes
default is restored only if the current value still equals LeanMark.Markdown.
A later user choice is preserved, and UserChoice is never changed or deleted.
