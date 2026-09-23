# Building LeanMark for macOS

The macOS host is a read-only Objective-C++ AppKit document app using the
system `WKWebView`. It consumes the shared portable Markdown core and the same
pinned offline reader assets as the Windows and Linux builds.

Requirements:

- macOS 12 or later
- Xcode command-line tools with Apple Clang
- CMake 3.24 or later
- Node.js 20 or later

Install the locked build-time assets, configure a Universal 2 build, and run
the static plus real-WebKit checks:

```sh
npm ci --ignore-scripts
cmake -S . -B obj/macos -G Xcode -DCMAKE_BUILD_TYPE=Release
cmake --build obj/macos --config Release
ctest --test-dir obj/macos -C Release --output-on-failure
```

`CMAKE_OSX_ARCHITECTURES` defaults to `arm64;x86_64`. Override it for a local
single-architecture debug build, but the package target intentionally refuses
to label an artifact “universal” unless both slices are present.

Create a deterministic local-testing archive, checksum, and trust metadata:

```sh
cmake --build obj/macos --config Release --target package_macos
```

For version `0.3.0`, the target writes these explicitly preview-labelled files:

- `LeanMark-v0.3.0-macos-universal-preview.zip`
- `LeanMark-v0.3.0-macos-universal-preview.zip.sha256`
- `LeanMark-v0.3.0-macos-universal-preview.zip.metadata.json`

The package target applies an ad-hoc signature with the hardened-runtime flag
and no timestamp authority. It does **not** use Developer ID, contact Apple's
notary service, or staple a ticket. The result is a publishable preview, not a
Gatekeeper-trusted release. The adjacent `.metadata.json` records those facts
explicitly.

To inspect a deliberately unsigned package instead:

```sh
bash macos/scripts/package-macos.sh \
  --app obj/macos/Release/LeanMark.app \
  --version "$(node -p 'require(\"./package.json\").version')" \
  --output release \
  --sign unsigned
```

Developer ID signing and notarization must be added only in a credentialed,
protected release job. If an ad-hoc or unsigned archive is published, label it
as a preview and retain the Gatekeeper warning and trust metadata.
