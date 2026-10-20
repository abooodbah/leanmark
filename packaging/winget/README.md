# winget

LeanMark is published to the Windows Package Manager as
`abooodbah.LeanMark`. The package installs the portable Windows ZIP from the
GitHub release; its manifests live in the community repository,
[microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs), under
`manifests/a/abooodbah/LeanMark/`.

## Automatic submission

When a `v*` tag publishes a release, the `Submit to winget` job in
`.github/workflows/build.yml` updates the previous manifest with the new
version, download URL, and SHA-256, and opens a pull request on
microsoft/winget-pkgs. It needs a repository secret:

- **`WINGET_TOKEN`**: a classic personal access token with the `public_repo`
  scope, from the account that owns (or may create) the winget-pkgs fork the
  pull request comes from.

Without the secret the job only prints a warning; the GitHub release and the
website are unaffected.

## Manual submission

From Windows, with [wingetcreate](https://github.com/microsoft/winget-create):

```powershell
$version = '0.4.2'
wingetcreate update abooodbah.LeanMark `
  --version $version `
  --urls "https://github.com/abooodbah/leanmark/releases/download/v$version/LeanMark-v$version-windows-x64.zip" `
  --submit
```

`wingetcreate update` keeps the existing portable-ZIP layout (the nested
`LeanMark.exe` and its command alias) and computes the new hash itself.

A submitted version becomes installable once the winget-pkgs validation
pipeline and a moderator have accepted the pull request.
