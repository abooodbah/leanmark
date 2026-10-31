#!/usr/bin/env bash
# Saves and restores the reader settings through the real GTK/WebKit host.
#
#   Test-LinuxSettings.sh <leanmark executable> <fixture.md>
#
# Each case writes a settings file into a private XDG_CONFIG_HOME, starts the
# host in smoke mode, and passes the theme, width, and zoom the page must show
# in LEANMARK_SMOKE_SETTINGS. The smoke probe then picks Full width and zooms
# in one step, and the host saves them. The host's own smoke check also fails
# when the web view's zoom level is not 1.0.
set -euo pipefail

if (($# != 2)); then
  printf '%s\n' 'Usage: Test-LinuxSettings.sh <leanmark> <fixture.md>' >&2
  exit 2
fi
executable=$1
fixture=$2
config=$(mktemp -d)
trap 'rm -rf "$config"' EXIT
settings="$config/leanmark/settings.ini"

run_case() {
  local name=$1 contents=$2 expected=$3 saved_width=$4 saved_zoom=$5
  mkdir -p "$config/leanmark"
  printf '%b' "$contents" > "$settings"
  if ! XDG_CONFIG_HOME="$config" LEANMARK_SMOKE_SETTINGS="$expected" \
      "$executable" --smoke-test "$fixture"; then
    printf 'FAIL %s: the host did not show %s\n' "$name" "$expected" >&2
    exit 1
  fi
  if ! grep -qx "Width=$saved_width" "$settings" ||
     ! grep -qx "Zoom=$saved_zoom" "$settings"; then
    printf 'FAIL %s: expected Width=%s and Zoom=%s, saved:\n' \
      "$name" "$saved_width" "$saved_zoom" >&2
    cat "$settings" >&2
    exit 1
  fi
  printf 'PASS %s\n' "$name"
}

# A file saved by this version: every setting comes back as saved.
run_case "saved width, zoom, and theme are restored" \
  '[Reader]\nTheme=dusk\nZoom=1.5\nWidth=wide\n' \
  'wide,150,dusk' full 1.75

# A file saved by 0.5.0 has no width: it reads as Narrow and the zoom keeps
# its meaning.
run_case "a 0.5.0 settings file without a width" \
  '[Reader]\nTheme=dark\nZoom=1.25\n' \
  'narrow,125,dark' full 1.5

# A width saved by a later version that this one does not know.
run_case "an unknown saved width" \
  '[Reader]\nTheme=light\nZoom=2\nWidth=huge\n' \
  'narrow,200,light' full 2.5

printf '%s\n' 'LeanMark Linux settings checks passed.'
