# LeanMark brand guidelines

These guidelines are the source of truth for LeanMark's app, website, release
notes, screenshots, and launch posts.

## Brand idea

**Promise:** Open the README, not the IDE.

LeanMark gives Windows users a focused way to read local technical Markdown.
It is built for documents, not workspaces: open a file, read it clearly, and
close it when finished.

**Positioning:** LeanMark is an MIT-licensed Markdown viewer for Windows x64
that renders GitHub-flavored Markdown and Mermaid offline through a native C++
host and WebView2.

## Voice

- **Precise:** name the native host and WebView2 renderer separately.
- **Transparent:** show package size beside memory use and test conditions.
- **Practical:** lead with local READMEs and diagrams, not architecture trivia.
- **Open:** invite inspection, issues, and contributions.
- **Calm:** use short, direct sentences and avoid hype.

Use phrases such as "focused viewer," "measured on our test machine," and
"public under the MIT license."

Do not use "ultra-lightweight," "fully native renderer," "zero dependency,"
"blazing fast," "completely secure," or any claim that package size equals
total memory or platform footprint.

## Visual thesis

LeanMark should feel like a well-made reading tool: warm paper, dark ink,
deliberate whitespace, one blue action color, and fine diagram-like lines.
The product itself is the dominant visual.

### Color

| Token | Value | Use |
| --- | --- | --- |
| Paper | #faf9f7 | Page canvas |
| White | #ffffff | Document surface |
| Soft stone | #f4f2ee | Muted surfaces |
| Border | #e8e4dc | Rules and window frames |
| Secondary ink | #5a554c | Supporting copy |
| Ink | #1a1917 | Headings and dark surfaces |
| Action blue | #1d4ed8 | Primary actions and links |
| Focus blue | #3b82f6 | Keyboard focus |
| Warning | #b45309 | Unsigned-build disclosure |

Blue is the only brand accent. Status colors are reserved for status.

### Typography

- IBM Plex Serif Semibold for editorial display headings.
- IBM Plex Sans Regular, Medium, and Semibold for UI and body copy.
- IBM Plex Mono Regular for code, measurements, and Markdown syntax.
- Use the existing 4 px spacing grid and 4-8 px radius family.

### Mark

The LeanMark mark combines a document, a Markdown heading, and a small diagram
connection. Keep clear space equal to one quarter of the mark's width. Do not
stretch it, recolor individual pieces, add effects, or place it on a busy
background.

## Product claims

Approved launch measurements:

- 1.32 MiB compressed v0.1.0 ZIP and 4.11 MiB staged application payload.
- About 321 ms until a simple document became visible on the test machine.
- About 163 MiB peak private memory for the full WebView2 process tree in that
  simple-document test.

Always state that performance varies and that WebView2's platform footprint is
separate from the LeanMark package.

## Project DNA

### Content plan

1. Hero: state the narrow job and offer the official download.
2. Proof: publish measured package, startup, and memory figures together.
3. Product: show a real Markdown and Mermaid document in LeanMark.
4. Architecture: explain the native-host/WebView2 tradeoff plainly.
5. Security: list concrete guards without claiming absolute safety.
6. Community: link source, issues, roadmap, and MIT license.

### Interaction thesis

- Primary actions use a clear 48 px button and visible keyboard focus.
- Motion is limited to short hover/focus feedback and respects reduced motion.
- The site remains fully useful without JavaScript.

### Acceptance notes

- The official download is visible in the first viewport.
- Every visual is authentic or deterministic; no synthetic product artwork.
- The unsigned-build warning is visible before installation instructions.
- Desktop, tablet, mobile, keyboard, reduced-motion, and dark-mode states work.
