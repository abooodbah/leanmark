## Signing and privacy

<!-- signing-status: the release job replaces this line. -->

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
