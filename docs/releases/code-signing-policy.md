## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)

The policy covers the Windows executable, `LeanMark.exe`. Only the project's
own executable is signed; third-party files in the package, such as
Microsoft's `WebView2Loader.dll`, are not. The Linux package and the macOS
preview are not covered.

<!-- signing-status: the release job replaces this line. -->

LeanMark is a one-person project, so one person holds every role.

- Committers and reviewers: [abooodbah](https://github.com/abooodbah)
- Approvers: [abooodbah](https://github.com/abooodbah)

### Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

On Windows, LeanMark displays documents through Microsoft's Edge WebView2
runtime, which is not part of LeanMark. That runtime can contact Microsoft
services on its own, as the
[README](https://github.com/abooodbah/leanmark#privacy-and-security) records,
and its network use is governed by the
[Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement).

### Uninstall

On Windows, use Settings > Apps > Installed apps > LeanMark, delete the folder
of a portable copy, or run `winget uninstall abooodbah.LeanMark`. On Linux, run
`sudo apt remove leanmark`. On macOS, move `LeanMark.app` to the Trash.
