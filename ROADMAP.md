# LeanMark roadmap

This roadmap records the next useful improvements under consideration. It is a
direction, not a release promise. Security, correctness, and the focused
read-only experience take priority over adding features.

## 1. Trusted publisher identities

Add Windows Authenticode signing and macOS Developer ID signing/notarization
when sustainable credentials and protected release automation are available.
Retain checksums and explicit trust metadata for every artifact.

## 2. Cross-platform runtime parity

Expand Linux and macOS runtime/security fixtures to match the established
Windows coverage. Publish equivalent startup and full-process memory methods
before making cross-platform efficiency comparisons.

## 3. Rendering compatibility baseline

Publish a compact compatibility table for CommonMark, GitHub-style extensions,
and Mermaid. Expand regression fixtures for Unicode and long paths, nested
content, missing local resources, invalid diagrams, and large documents.

## 4. Accessibility verification

Test every release with Windows Narrator, Linux desktop accessibility tooling,
macOS VoiceOver, keyboard-only navigation, contrast themes, and representative
display scaling. Add reliable automated accessibility checks where possible.

## 5. Additional native architectures

Add Windows ARM64 and Linux ARM64 build/test paths while preserving the same
offline assets, security restrictions, package behavior, and release checks.

## 6. Optional desktop integrations

Prototype a read-only Windows Explorer Preview pane integration. It must not
require elevation, silently replace the user's `.md` default application, or
weaken LeanMark's resource and navigation boundaries.

Feature requests and implementation help are welcome through the repository's
issue forms. A proposal should explain the user problem and how it preserves
LeanMark's small, read-only scope.
