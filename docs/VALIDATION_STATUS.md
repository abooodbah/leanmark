# Validation status

**Status date:** 2026-11-06<br>
**Scope:** LeanMark 0.7.0, tested in CI on GitHub runners for Windows,
Linux and macOS, and in a Linux session with the reader in headless Chrome
and the GTK and WebKitGTK host under Xvfb<br>
**Current public release:** LeanMark 0.7.0, once the owner has pushed the
tag (see below)

## v0.7.0 publication

| Check | Result |
| --- | --- |
| Release pull request | [#33](https://github.com/abooodbah/leanmark/pull/33) |
| Tag | To be pushed by the owner: annotated `v0.7.0` on the merge commit of #33. The build session could not create tags. |
| Tag build | Not run yet. `build.yml` builds Windows, Linux and macOS and publishes the release from `docs/releases/v0.7.0.md`. |
| Assets | Expected: `LeanMark-v0.7.0-windows-x64.zip`, `LeanMark-v0.7.0-linux-x86_64.deb`, `LeanMark-v0.7.0-macos-universal-preview.zip`, each with a `.sha256`, and the macOS `.metadata.json`. |
| Checksums | To be filled in from the published `.sha256` files. |
| Store package | `store-msix.yml` runs on the tag push and uploads `LeanMark-v0.7.0-store-msix`. Not run yet. |

## Test state

| Area | State | Evidence |
| --- | --- | --- |
| Reader page | Passed | `tests/Invoke-ReaderBrowserSmoke.mjs`, 194 checks, Chrome on Linux (with and without reduced motion) and Edge on Windows in CI |
| Linux host | Passed | `ctest` 8 of 8: core, source policy, three host smoke tests (one on `tests/fixtures/long-outline.md`), settings, two reader runs |
| macOS host | Passed in CI | CTest 4 of 4, including `LeanMarkMacWebKitOutline` |
| Windows host | Passed in CI | `tests/Test-LeanMark.ps1` static and package checks, downloaded install, Edge reader test. WebView2 not driven by hand for 0.7.0. |
| Outline highlight in five themes | Passed | Browser test and the WebKit probe on Linux and macOS check the tokens per theme |

## Measurements, 0.7.0 against 0.6.0

| What | 0.6.0 | 0.7.0 | Where |
| --- | ---: | ---: | --- |
| Windows, simple.md, document ready | 572.0 ms | 573.3 ms | launch-time run 42178492623 |
| Windows, showcase.md, document ready | 712.0 ms | 700.9 ms | same run |
| Windows, 8 MiB file, peak working set | 1,759.0 MiB | 1,779.8 MiB | same run |
| Windows LeanMark.exe | 457,216 bytes | 457,216 bytes | same run |
| Linux, simple.md, start | 422.1 ms | 421.5 ms | session, Release, Xvfb |
| Linux, 8 MiB file, peak PSS | 1,408.5 MiB | 1,343.1 MiB | session, Release, Xvfb |

macOS was not timed.
