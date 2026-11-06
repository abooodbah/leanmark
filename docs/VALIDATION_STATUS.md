# Validation status

**Status date:** 2026-11-06<br>
**Scope:** LeanMark 0.7.0, tested in CI on GitHub runners for Windows,
Linux and macOS, and in a Linux session with the reader in headless Chrome
and the GTK and WebKitGTK host under Xvfb<br>
**Current public release:** LeanMark 0.7.0

## v0.7.0 publication

| Check | Result |
| --- | --- |
| Release pull request | [#33](https://github.com/abooodbah/leanmark/pull/33) |
| Tag | Annotated `v0.7.0` on `5b391584d38683c2aafadaf788e6a09d472eee75`, the merge commit of #33, pushed 2026-11-06. |
| Tag build | [Run 42229623419](https://github.com/abooodbah/leanmark/actions/runs/42229623419) built Windows, Linux and macOS, passed, and published the [release](https://github.com/abooodbah/leanmark/releases/tag/v0.7.0) from `docs/releases/v0.7.0.md`. |
| Assets | `LeanMark-v0.7.0-windows-x64.zip` (1,452,566 bytes), `LeanMark-v0.7.0-linux-x86_64.deb` (1,262,764 bytes), `LeanMark-v0.7.0-macos-universal-preview.zip` (1,368,648 bytes), each with a `.sha256`, and the macOS `.metadata.json`. |
| Checksums | Windows ZIP `333624ddf3005d6b98ee72552607710aa40e0d5f18e807aa49a393fe4b128820`; Linux .deb `960c0592a79c0a91b69cea667900d506066f7d8e03f359c04982f20a462e01f2`; macOS ZIP `fe887b76d2dda188734f1f30d84e06b17f1d1fa2d7dc573b4f648c712514d21d`. The downloaded Windows ZIP matched its `.sha256`. |
| Store package | [Run 42229623420](https://github.com/abooodbah/leanmark/actions/runs/42229623420) passed and uploaded `LeanMark-v0.7.0-store-msix`. |

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
