# LeanMark progress

Work log for LeanMark desktop 0.7.0. It is updated with every merge.

Status date: 2026-11-05. Main was 0.6.0 plus a Store listing commit (c12805a)
when this round started.

## Done

- Read README.md, CHANGELOG.md, ROADMAP.md, docs/, tests/README.md, every
  workflow, and the reader, host and test sources.
- Efficiency review (below), with numbers from release builds.
- Checked the shared design items against 0.6.0 (below).
- Step 1: this file, merged in #26.
- Step 2: the Compare launch time workflow builds v0.4.2 and later tags as
  they are and measures memory with an 8 MiB file and the size of each
  build, merged in #27. Run 41982450100 is its A/A check.

- Step 3: the current-section highlight in "On this page", merged in #28.

- Resize fix (reported by the LeanMark Android agent): a resize into or
  out of the compact layout was laid out twice since 0.6.0. Merged in #29.
- Step 4: heading ids in linear time, merged in #30 (open script on the
  8 MiB file 1,001 to 493 ms).
- Step 5: the Linux host no longer sends the theme back, merged in #31
  (4 to 2 diagram renders per theme change on showcase.md).
- Step 6: no redraw when the diagram colours stay, merged in #32 (System to
  Light: 2 renders and 52 to 74 ms, to none and 1 ms).
- Step 7: no design gaps needed code.

## In progress

- Step 8: release 0.7.0 (branch `release/v0.7.0`).

## Remaining

See the plan below. Every step is one branch and one pull request.

## Known gaps

- This session runs Linux only. Windows numbers (start time, memory, size)
  come from CI runs. Windows memory with a large file has not been measured
  by any workflow so far; step 2 of the plan adds that.
- macOS numbers are not measured. CI builds and smoke tests macOS, but no
  workflow times it.
- The Linux numbers come from a 4-core shared machine under Xvfb with
  software rendering. They compare builds measured the same way, side by
  side, not absolute speed on a desktop.
- This session cannot create tags: a tag push gets HTTP 403 and the tag API
  is refused. Steps 9 and 10 (tag, release, Store package, post-release
  update) are left for the owner, with the commands in the report.
- `docs/VALIDATION_STATUS.md` does not exist in this repository. The
  post-release pull request creates it with the published facts of 0.7.0,
  in the form LeanDoc and LeanRows use.
- `CITATION.cff` does not exist in this repository. It is not created.

## Plan

1. This file: review, plan and highlight look.
2. Measurement tooling. The Compare launch time workflow cannot build
   v0.4.2 or later, because those tags already contain the test hook and the
   step that adds it fails. Build such tags as they are, so v0.6.0 can be
   compared with a branch. Add peak working set and private memory with a
   generated 8 MiB document, and the size of each build's files, to the same
   run.
3. Feature: highlight the current section in "On this page" and keep it in
   view. Tests first. Look and behaviour below, for LeanDoc desktop and both
   Android apps to copy.
4. Efficiency: heading ids in linear time (row 1 of the review).
5. Efficiency: the Linux host stops sending each theme change back to the
   page (row 2).
6. Efficiency: no Mermaid redraw when a theme change keeps the diagram
   colours (row 3).
7. Design gaps: none found that need code (below). If a later step finds
   one, it gets its own pull request here.
8. Release 0.7.0: version files, CHANGELOG.md, README.md and
   docs/releases/v0.7.0.md, following the 0.5.0 and 0.6.0 pattern.
9. Annotated tag v0.7.0. The tag build publishes the GitHub release. Then
   the Store package workflow for the tag.
10. Post-release: site/, store/listing.md and a new
    docs/VALIDATION_STATUS.md with the published facts. Then stop.

## Efficiency review

What runs on open, scroll, find, zoom, text width (LeanMark has no other
views) and theme switch, what is kept, dead code, dependencies and size.

How it was measured:

- Reader page: the staged assets of a Linux Release build of main, served on
  loopback and driven in headless Chrome over DevTools with a stand-in host,
  as `tests/Invoke-ReaderBrowserSmoke.mjs` does. Window 1200 by 900.
- Large file: README.md and tests/fixtures/showcase.md repeated 326 times,
  8,401,346 bytes. It renders to 10.1 MB of HTML with 11,410 h2 and h3
  headings, 978 Mermaid blocks (50 drawn) and 535,090 DOM nodes.
- Linux host: Release build, one Xvfb display, own D-Bus session. Memory is
  the PSS of the host and every child process, from `/proc/<pid>/smaps_rollup`.
- Windows and package sizes: the published v0.6.0 assets.

| # | Place | What it costs | Measured (main) | Proposed fix | Decision |
| ---: | --- | --- | --- | --- | --- |
| 1 | `slugifyHeading` in reader.js, on open | Each repeated heading text probes `-2`, `-3`, and so on from the start, so a text seen n times costs n squared lookups | 702 ms of a 1,224 ms open script on the large file (326 copies of each heading) | Remember the next free suffix per heading text; same ids | Fix (step 4) |
| 2 | Linux host, `theme\|` message | The host sends the theme back, so the page draws every Mermaid diagram a second time. Two quick theme changes can also flash the older theme | showcase.md: 4 diagram renders instead of 2, 117 and 163 ms instead of 78 and 61 ms (two theme steps, page timed with a stand-in host that answers as the Linux host does) | Do not send it back; the page already shows it, as on Windows and macOS | Fix (step 5) |
| 3 | `applyTheme` in reader.js, theme switch | Every theme change redraws all diagrams, also when the diagram colours stay the same (System to Light on a light system) | showcase.md: 2 renders, 78 ms, for no visible change | Redraw only when the Mermaid settings change | Fix (step 6) |
| 4 | `updateSearch` in reader.js, find | Each search walks every text node and lower-cases it again | Large file: 236 ms for a word with 326 matches; 19 ms for "the", which stops at the 2,000-match cap. Already waits for a 120 ms pause in typing | Reuse the previous matches when the query only grows, or keep lower-cased text per node (more memory) | For the owner to decide |
| 5 | Layout of a very large page, on open, zoom and width | The browser lays out the whole document each time | Large file: 5.5 s layout after open, 4.2 and 4.8 s per zoom step, 1.2 s per width step | `content-visibility: auto` on top-level blocks. It changes scroll height estimates, anchor jumps and find, and WebKit on macOS 12 to 14 lacks it | For the owner to decide |
| 6 | Scroll handler in reader.js | Reading progress once per frame | 11 ms script, 19 ms layout, 21 ms style over 80 wheel steps on the large file | None needed. The highlight adds a binary search per frame; step 3 measures it | No change |
| 7 | Windows host file watch | `PollActiveTab` reads the file's stamp every 500 ms while a tab is open | Not measured: needs Windows | A change notification (`ReadDirectoryChangesW`) instead of a timer | For the owner to decide |
| 8 | CSS zoom fallback (`data-zoom-fallback`) | A `transform: scale` path for engines without CSS `zoom`. WebView2, WebKitGTK and WKWebView all have `zoom`, so it never runs and is not tested | About 20 lines of CSS and JS | Remove it | For the owner to decide |
| 9 | Theme token blocks in reader.css | Each block also matches `.theme-swatch[data-swatch=...]`. Since 0.6.0 the dots use fixed colours, so these selectors do nothing | 4 selectors | Remove them; the colour values stay | For the owner to decide (other apps copy these blocks) |
| 10 | Package size | mermaid.min.js is 3,566,058 of the 3,784,151 bytes of reader assets | Windows ZIP 1,449,935 bytes; LeanMark.exe 457,216; files 4,465,090. Linux .deb 1,258,692. macOS ZIP 1,361,748 | A smaller Mermaid build drops diagram types | For the owner to decide |
| 11 | Memory with the large file | DOM and layout of 535,090 nodes; the JS heap is small | Linux: peak PSS 1,410 MiB, 1,350 MiB after 30 s, 8 processes. JS heap 5.6 MiB in Chrome | None in this round | No change |
| 12 | Dependencies | Four build-time packages: Mermaid and three IBM Plex font packages. Each staged file is used | None unused | None | No change |
| 13 | Dead code in the hosts | None found. Background tabs already keep no page (0.3.0); hosts release the HTML once sent (0.4.0) | | | No change |

Rows 1 to 3 are clear wins and get their own pull requests with before and
after numbers. The rest are listed for the owner.

## Design items in 0.6.0

| Item | In 0.6.0 | Note |
| --- | --- | --- |
| Five themes: System, Light, Dark, Dim, Dusk | Yes | Token values in assets/reader.css. Not changed in this round. |
| Theme button with a coloured dot | Yes | White, black, grey blue, amber; System is half white, half black. |
| Tooltip and accessible name that name the theme | Yes | "Theme: Dusk (Ctrl+Shift+T)", "Theme: System (Dark)". |
| Settings button and panel: theme, zoom, text width | Yes | Beside the document; covers the window at 560 px and below. |
| Every keyboard shortcut in the panel | Yes | Built from the tables the key handlers use; macOS adds its menu keys. |
| Ctrl+/ or F1 opens it, Escape closes it | Yes | Also Cmd+, on macOS. |
| Windows high contrast keeps system colours | Yes | `forced-colors` rules for the toolbar, tabs, panel and dots. |

Below 760 px the theme button is hidden to fit the toolbar, as in 0.5.0;
the theme is then changed in the settings panel or with Ctrl+Shift+T. This
is left as it is.

## Highlight look

For LeanMark desktop, LeanDoc desktop, LeanMark Android and LeanDoc Android.
The entry for the section being read carries `aria-current="location"`. The
look uses theme tokens that already exist, so it needs no new colours.

```css
.outline a {
  display: block;
  padding: 5px var(--space-2) 5px var(--space-3); /* 5px 8px 5px 12px */
  border-radius: var(--radius-sm);                /* 4px */
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
  text-decoration: none;
}

.outline a[data-level="3"] {
  padding-left: calc(var(--space-3) + var(--space-4)); /* 28px */
}

.outline a[aria-current="location"] {
  background: var(--surface-muted);
  box-shadow: inset 2px 0 0 var(--link);
  color: var(--text-primary);
}

@media (forced-colors: active) {
  .outline a[aria-current="location"] {
    text-decoration: underline;
  }
}
```

The "On this page" label gets the same 12 px left padding, so it lines up
with the entries.

The font weight does not change (it stays 400, like the other entries).
An earlier draft used 500, as LeanDoc 0.1.4 does. A weight change makes the
browser lay the page out again each time the current entry changes: on the
8 MiB test file, 80 wheel steps cost 1,022 ms of layout instead of 18 ms.
Background, bar and text colour change only paint.

Token values per theme. System uses Light or Dark, as the system does.

| Theme | Background `--surface-muted` | Text `--text-primary` | Bar `--link` | Other entries `--text-secondary` | Text contrast | Bar contrast |
| --- | --- | --- | --- | --- | ---: | ---: |
| Light | `#f4f2ee` | `#1a1917` | `#1d4ed8` | `#5a554c` | 15.71 | 5.99 |
| Dark | `#2b2924` | `#faf9f7` | `#60a5fa` | `#d5cfc3` | 13.81 | 5.71 |
| Dim | `#2d3035` | `#c8ccd2` | `#86aee6` | `#9ea4ac` | 8.21 | 5.81 |
| Dusk | `#322c25` | `#d4c8b4` | `#e0a86e` | `#a99c87` | 8.35 | 6.56 |

Contrast is WCAG 2, against the highlight background. Text needs 4.5 to 1
and the bar, a non-text mark, 3 to 1. `--accent-500` is not used for the bar
because it is the same blue in every theme and falls to about 2 to 1 in the
three dark themes.

Behaviour, matched to LeanDoc's `updateOutlineCurrent`. The code is in
assets/reader.js: `updateOutlineCurrent`, `setOutlineCurrent`,
`keepOutlineEntryInView`, `pinOutline` and `handleScroll`.

- The reading line is the bottom of the toolbar plus 25% of the height below
  it, and at least 48 px.
- The current entry is the last one whose heading top is at or above the
  line (a binary search over the headings). When none is, or the page is at
  the top, it is the first entry. Exactly one entry is current.
- After a click in the outline, the clicked entry stays current, even when
  its heading is too near the end to reach the line. It lets go once the
  page moves more than half a window height, or on wheel, touch, pointer
  or key input.
- When the current entry changes and is outside the outline's visible part,
  the outline scrolls so the entry sits a third of the way down. The outline
  does not move otherwise. When the outline column appears again (a wider
  window, a lower zoom), its current entry is brought into view the same
  way. Under document zoom, the outline's own size converts between screen
  pixels and its scroll position.
- While the outline is hidden (narrow window), the current section is still
  tracked.
- Updates run at most once per frame, from the scroll event.
- Stale highlight after a jump: the current section is computed once more
  120 ms after the last scroll event (on the next frame). Layout that
  settles just after a long jump moves headings without another scroll
  event; in LeanDoc that is `content-visibility: auto`. LeanMark does not
  use `content-visibility`, but its images load lazily and Mermaid diagrams
  draw after the page, which can move headings at any time with no scroll
  at all. So LeanMark also computes it again when the article's size
  changes (a `ResizeObserver` on the article). Both are tested: content that
  grows after a jump with no scroll event, and a shift just after scrolling
  that leaves the size alone.
- A new document starts with its first entry current.

## Measured numbers

Main (0.6.0 code), from the review above. Later rows are added with each
merge.

Step 3, the highlight, against main, measured the same way on both:

| What | Main | Branch | Where it came from |
| --- | ---: | ---: | --- |
| Windows, simple.md, document ready, median of 8 | 578.0 ms | 574.0 ms | launch-time run 41987604628 |
| Windows, showcase.md, document ready, median of 8 | 760.8 ms | 745.0 ms | same run |
| Windows, 8 MiB file, peak working set, median of 3 | 1,759.9 MiB | 1,761.4 MiB | same run |
| Windows, 8 MiB file, peak private, median of 3 | 1,575.0 MiB | 1,575.3 MiB | same run |
| Windows LeanMark.exe | 457,216 bytes | 457,216 bytes | same run |
| Windows files in dist | 4,439,728 bytes | 4,446,204 bytes | same run |
| Linux, simple.md, start to smoke-test exit, median of 20 | 515.6 ms | 518.6 ms | local, Release, Xvfb |
| Linux, 8 MiB file, peak PSS in 30 s, median of 3 | 1,414.9 MiB | 1,410.8 MiB | local, Release, Xvfb |
| Linux binary, stripped | 338,224 bytes | 342,320 bytes | local |
| Reader, 8 MiB file, 80 wheel steps: script | 21.3 ms | 51.3 ms | local, headless Chrome, median of 3 |
| Same: layout | 17.3 ms | 17.3 ms | same |
| Same: style | 18.0 ms | 65.0 ms | same |
| reader.js, bytes and gzip | 72,002 / 17,466 | 77,696 / 19,080 | |
| reader.css, bytes and gzip | 30,590 / 7,265 | 31,372 / 7,514 | |

The scroll rows are higher because the highlight is new work: a binary
search over 11,410 headings each frame, and a style pass each time the
current entry moves. It adds about 1 ms of main-thread time per wheel step on
this file, which has a far longer outline than real documents. Without the
attribute change (tried, not kept) style time is 18.8 ms, as on main.

| What | Main | Where it came from |
| --- | ---: | --- |
| Linux, simple.md, start to smoke-test exit | 654 ms median (n=6, trial) | local, Release, Xvfb |
| Linux, 8 MiB file, peak PSS in 30 s | 1,410 MiB | local, Release, Xvfb |
| Reader, 8 MiB file, open script | 827 ms | local, headless Chrome |
| Windows LeanMark.exe | 457,216 bytes | v0.6.0 release ZIP |
| Windows ZIP | 1,449,935 bytes | v0.6.0 release |

Resize fix, 1 MiB file (README and showcase repeated, 1,056,611 bytes) in
headless Chrome, window resize to the next two frames, median of 5, second
of two alternating runs:

| Resize | Main | Branch | Layout passes, main and branch |
| --- | ---: | ---: | --- |
| 700 to 1000 px | 1,264 ms | 1,006 ms | 3 and 2 |
| 1000 to 700 px | 1,375 ms | 962 ms | 3 and 2 |
| 1000 to 1300 px | 416 ms | 430 ms | 3 and 3 |
| 1300 to 1000 px | 530 ms | 562 ms | 3 and 3 |
| 1000 to 1100 px | 177 ms | 166 ms | 2 and 2 |

Release 0.7.0 against v0.6.0:

| What | v0.6.0 | 0.7.0 | Where it came from |
| --- | ---: | ---: | --- |
| Windows, simple.md, document ready | 572.0 ms | 573.3 ms | launch-time run 42178492623 |
| Windows, showcase.md, document ready | 712.0 ms | 700.9 ms | same run |
| Windows, 8 MiB file, peak working set | 1,759.0 MiB | 1,779.8 MiB | same run |
| Windows LeanMark.exe | 457,216 bytes | 457,216 bytes | same run |
| Windows files in dist | 4,439,728 bytes | 4,448,263 bytes | same run |
| Linux, simple.md, start, median of 20 | 422.1 ms | 421.5 ms | local, Release, Xvfb |
| Linux, 8 MiB file, peak PSS, median of 3 | 1,408.5 MiB | 1,343.1 MiB | local, Release, Xvfb |

Test counts on main after this round: `ctest` 8 of 8 on Linux (7 before);
the reader browser test has 194 checks (137 before); macOS CTest 4 tests
(3 before); the core tests are unchanged (8 groups, 82 `Expect` calls).

Test counts on main at the start: `ctest` 7 of 7 on Linux; the reader browser test has
137 checks; the core tests run 8 groups with 82 `Expect` calls.
