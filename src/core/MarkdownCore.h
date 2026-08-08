#pragma once

#include <cstdint>
#include <filesystem>
#include <string>
#include <string_view>

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

bool IsSupportedMarkdownPath(const std::filesystem::path& path);

// Returns true only when both paths exist and the canonical candidate is the
// canonical root itself or one of its descendants. Component comparison avoids
// prefix mistakes such as treating /notes-archive as a child of /notes.
bool IsPathWithin(
    const std::filesystem::path& root,
    const std::filesystem::path& candidate);

std::string EscapeJsonString(std::string_view value);

}  // namespace leanmark::core
