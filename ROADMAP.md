# LeanMark roadmap

This roadmap records the next useful improvements under consideration. It is a
direction, not a release promise. Security, correctness, and the focused
read-only experience take priority over adding features.

## 1. Trustworthy release packages

Publish versioned Windows x64 portable archives with SHA-256 checksums, clear
install and uninstall notes, and documented WebView2 requirements. Add code
signing when it becomes sustainable for the project.

## 2. Rendering compatibility baseline

Publish a compact compatibility table for CommonMark, GitHub-style extensions,
and Mermaid. Expand regression fixtures for Unicode and long paths, nested
content, missing local resources, invalid diagrams, and large documents.

## 3. Accessibility verification

Test every release with Windows Narrator, keyboard-only navigation, High
Contrast themes, and 100% through 200% display scaling. Add automated checks for
accessibility behavior that can be tested reliably.

## 4. Windows on ARM64

Add an ARM64 build and test path while preserving the same offline assets,
security restrictions, installer behavior, and release checks as x64.

## 5. Optional Explorer preview

Prototype a read-only Windows Explorer Preview pane integration. It must not
require elevation, silently replace the user's `.md` default application, or
weaken LeanMark's resource and navigation boundaries.

Feature requests and implementation help are welcome through the repository's
issue forms. A proposal should explain the user problem and how it preserves
LeanMark's small, read-only scope.
