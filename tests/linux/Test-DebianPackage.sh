#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bash tests/linux/Test-DebianPackage.sh <leanmark.deb>" >&2
  exit 2
fi

package=$1
[[ -f "$package" ]] || { echo "Package not found: $package" >&2; exit 1; }

name=$(dpkg-deb -f "$package" Package)
architecture=$(dpkg-deb -f "$package" Architecture)
dependencies=$(dpkg-deb -f "$package" Depends)
contents=$(dpkg-deb -c "$package")

[[ "$name" == "leanmark" ]] || {
  echo "Unexpected Debian package name: $name" >&2
  exit 1
}
[[ "$architecture" == "amd64" ]] || {
  echo "Unexpected Debian architecture: $architecture" >&2
  exit 1
}
grep -Eq 'libgtk-4-[^, ]*' <<<"$dependencies" || {
  echo "GTK 4 runtime dependency was not discovered: $dependencies" >&2
  exit 1
}
grep -Eq 'libwebkitgtk-6\.0-[^, ]*' <<<"$dependencies" || {
  echo "WebKitGTK 6.0 runtime dependency was not discovered: $dependencies" >&2
  exit 1
}

for required in \
  './usr/bin/leanmark' \
  './usr/share/leanmark/assets/reader.html' \
  './usr/share/leanmark/assets/reader.css' \
  './usr/share/leanmark/assets/reader.js' \
  './usr/share/leanmark/assets/vendor/mermaid.min.js' \
  './usr/share/applications/io.github.abooodbah.leanmark.desktop' \
  './usr/share/metainfo/io.github.abooodbah.leanmark.metainfo.xml' \
  './usr/share/icons/hicolor/256x256/apps/io.github.abooodbah.leanmark.png'
do
  grep -Fq "$required" <<<"$contents" || {
    echo "Debian package is missing $required" >&2
    exit 1
  }
done

echo "LeanMark Debian package checks passed."
