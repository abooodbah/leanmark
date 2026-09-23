#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace leanmark::core {

constexpr std::uint64_t kMaximumDocumentBytes =
    32ull * 1024ull * 1024ull;

struct RenderResult {
    bool ok = false;
    std::string error;
    std::string html;
    bool hasMermaid = false;
};

struct FileRenderResult {
    bool ok = false;
    std::filesystem::path path;
    std::filesystem::path directory;
    std::string error;
    std::string html;
    std::uint64_t sourceBytes = 0;
    bool hasMermaid = false;
};

// Validates UTF-8, removes an optional BOM, and renders GFM-compatible HTML.
// Raw HTML is deliberately disabled because Markdown files can be untrusted.
RenderResult RenderMarkdownUtf8(std::string_view markdown);

// Portable file adapter used by non-Windows hosts. Windows keeps its explicit
// FILE_SHARE_* read path and delegates the bytes to RenderMarkdownUtf8().
FileRenderResult RenderMarkdownFile(
    const std::filesystem::path& requestedPath);

// Reads a regular file within the 32 MiB limit. RenderMarkdownFile uses it, and
// hosts use it to copy a section from the file rather than from the page.
bool ReadDocumentFile(
    const std::filesystem::path& path,
    std::string& bytes,
    std::string& error);

bool IsSupportedMarkdownPath(const std::filesystem::path& path);

struct MarkdownHeading {
    unsigned level = 0;
    // Byte offset of the source line that holds the heading, or npos when the
    // heading has no text to anchor it (for example a bare "##").
    std::size_t lineStart = std::string_view::npos;
};

// Headings in document order, found with the same parser and flags the renderer
// uses, so entry i is always the i-th <h1>..<h6> in RenderMarkdownUtf8() output.
// A separate line scanner would disagree with it on fences, containers, and
// setext underlines.
std::vector<MarkdownHeading> FindHeadings(std::string_view markdown);

struct SectionResult {
    bool ok = false;
    std::string error;
    std::string markdown;
    std::size_t headingCount = 0;
};

// Returns the Markdown source of one section: the heading's line through to the
// next heading of the same or a higher level. A negative index returns the whole
// document. The input is the raw file bytes; the BOM is dropped and the result is
// trimmed of trailing whitespace.
SectionResult ExtractSection(std::string_view markdown, long long headingIndex);

// Returns true only when both paths exist and the canonical candidate is the
// canonical root itself or one of its descendants. Component comparison avoids
// prefix mistakes such as treating /notes-archive as a child of /notes.
bool IsPathWithin(
    const std::filesystem::path& root,
    const std::filesystem::path& candidate);

// Appends value to output as the inside of a JSON string literal. Building a
// message in place avoids a temporary copy per field, which matters for the
// rendered HTML of a large document.
void AppendJsonString(std::string& output, std::string_view value);
std::string EscapeJsonString(std::string_view value);

}  // namespace leanmark::core
