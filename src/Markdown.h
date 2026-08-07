#pragma once

#include <cstdint>
#include <string>

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

std::wstring Utf8ToWide(const std::string& value);
std::string WideToUtf8(const std::wstring& value);
std::wstring EscapeJsonString(const std::wstring& value);

}  // namespace leanmark
