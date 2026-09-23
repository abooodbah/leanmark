#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace leanmark {

constexpr std::uint64_t kMaximumDocumentBytes = 32ull * 1024ull * 1024ull;

struct RenderedDocument {
    bool ok = false;
    std::wstring path;
    std::wstring directory;
    std::wstring fileName;
    std::wstring error;
    std::string html;
    std::uint64_t sourceBytes = 0;
    bool hasMermaid = false;
};

// Reads one UTF-8 Markdown file and renders safe GFM-compatible HTML with MD4C.
// Raw HTML is deliberately disabled because Markdown files can be untrusted.
RenderedDocument RenderMarkdownFile(const std::wstring& requestedPath);

// Reads a file's raw bytes with the same sharing flags and size limit as
// RenderMarkdownFile, for callers that need the source rather than the HTML.
bool ReadDocumentBytes(
    const std::wstring& path, std::string& bytes, std::wstring& error);

// Resolves a path the way RenderMarkdownFile does, so two spellings of one file
// compare equal.
std::wstring CanonicalPath(const std::wstring& requestedPath);

std::wstring Utf8ToWide(std::string_view value);
std::string WideToUtf8(std::wstring_view value);

}  // namespace leanmark
