#include "MarkdownCore.h"

#include <algorithm>
#include <fstream>
#include <limits>
#include <utility>

#include "md4c-html.h"

namespace leanmark::core {
namespace {

// Shared by the renderer and the heading scanner. If the two passes parsed with
// different flags, heading i in the source would stop being heading i on screen.
constexpr unsigned kParserFlags = MD_DIALECT_GITHUB | MD_FLAG_NOHTML;

void AppendRenderedHtml(const MD_CHAR* text, MD_SIZE size, void* userData) {
    auto* output = static_cast<std::string*>(userData);
    output->append(text, size);
}

bool HasUtf8Bom(std::string_view bytes) {
    return bytes.size() >= 3 &&
           static_cast<unsigned char>(bytes[0]) == 0xEF &&
           static_cast<unsigned char>(bytes[1]) == 0xBB &&
           static_cast<unsigned char>(bytes[2]) == 0xBF;
}

bool IsContinuationByte(unsigned char value) {
    return (value & 0xC0) == 0x80;
}

bool IsValidUtf8(std::string_view value) {
    std::size_t index = 0;
    while (index < value.size()) {
        const auto first = static_cast<unsigned char>(value[index]);
        if (first <= 0x7F) {
            ++index;
            continue;
        }

        std::size_t length = 0;
        std::uint32_t codePoint = 0;
        std::uint32_t minimum = 0;
        if (first >= 0xC2 && first <= 0xDF) {
            length = 2;
            codePoint = first & 0x1F;
            minimum = 0x80;
        } else if (first >= 0xE0 && first <= 0xEF) {
            length = 3;
            codePoint = first & 0x0F;
            minimum = 0x800;
        } else if (first >= 0xF0 && first <= 0xF4) {
            length = 4;
            codePoint = first & 0x07;
            minimum = 0x10000;
        } else {
            return false;
        }

        if (index + length > value.size()) {
            return false;
        }
        for (std::size_t offset = 1; offset < length; ++offset) {
            const auto continuation =
                static_cast<unsigned char>(value[index + offset]);
            if (!IsContinuationByte(continuation)) {
                return false;
            }
            codePoint = (codePoint << 6) | (continuation & 0x3F);
        }

        if (codePoint < minimum || codePoint > 0x10FFFF ||
            (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
            return false;
        }
        index += length;
    }
    return true;
}

std::filesystem::path CanonicalPath(
    const std::filesystem::path& requestedPath) {
    std::error_code error;
    auto absolute = std::filesystem::absolute(requestedPath, error);
    if (error) {
        absolute = requestedPath;
        error.clear();
    }

    const auto canonical = std::filesystem::weakly_canonical(absolute, error);
    return error ? absolute.lexically_normal() : canonical;
}

std::string LowercaseAscii(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](char character) {
        const auto byte = static_cast<unsigned char>(character);
        return byte >= 'A' && byte <= 'Z'
                   ? static_cast<char>(byte - 'A' + 'a')
                   : character;
    });
    return value;
}

struct HeadingScan {
    const MD_CHAR* base = nullptr;
    std::size_t size = 0;
    std::vector<MarkdownHeading> headings;
    bool inHeading = false;
    bool located = false;
};

int ScanEnterBlock(MD_BLOCKTYPE type, void* detail, void* userData) {
    if (type == MD_BLOCK_H) {
        auto* scan = static_cast<HeadingScan*>(userData);
        MarkdownHeading heading;
        heading.level = static_cast<const MD_BLOCK_H_DETAIL*>(detail)->level;
        scan->headings.push_back(heading);
        scan->inHeading = true;
        scan->located = false;
    }
    return 0;
}

int ScanLeaveBlock(MD_BLOCKTYPE type, void*, void* userData) {
    if (type == MD_BLOCK_H) {
        static_cast<HeadingScan*>(userData)->inHeading = false;
    }
    return 0;
}

int ScanSpan(MD_SPANTYPE, void*, void*) {
    return 0;
}

// MD4C hands ordinary text, entities, and code spans to this callback as
// pointers into the input buffer. Only replacement text (spaces, line breaks,
// the NUL substitute) comes from static strings outside it. The first in-buffer
// pointer inside a heading therefore sits on that heading's source line.
int ScanText(MD_TEXTTYPE, const MD_CHAR* text, MD_SIZE, void* userData) {
    auto* scan = static_cast<HeadingScan*>(userData);
    if (!scan->inHeading || scan->located) {
        return 0;
    }
    const auto address = reinterpret_cast<std::uintptr_t>(text);
    const auto begin = reinterpret_cast<std::uintptr_t>(scan->base);
    if (address < begin || address >= begin + scan->size) {
        return 0;
    }
    auto offset = static_cast<std::size_t>(address - begin);
    while (offset > 0 && scan->base[offset - 1] != '\n') {
        --offset;
    }
    scan->headings.back().lineStart = offset;
    scan->located = true;
    return 0;
}

std::string_view WithoutBom(std::string_view bytes) {
    if (HasUtf8Bom(bytes)) {
        bytes.remove_prefix(3);
    }
    return bytes;
}

std::string_view TrimTrailingWhitespace(std::string_view value) {
    while (!value.empty() &&
           (value.back() == '\n' || value.back() == '\r' ||
            value.back() == ' ' || value.back() == '\t')) {
        value.remove_suffix(1);
    }
    return value;
}

}  // namespace

RenderResult RenderMarkdownUtf8(std::string_view markdown) {
    RenderResult result;
    markdown = WithoutBom(markdown);

    if (!IsValidUtf8(markdown)) {
        result.error =
            "This file is not valid UTF-8. Convert it to UTF-8, then open it "
            "again.";
        return result;
    }
    if (markdown.size() > std::numeric_limits<MD_SIZE>::max()) {
        result.error = "LeanMark could not parse this Markdown document.";
        return result;
    }

    const int renderStatus = md_html(
        markdown.data(),
        static_cast<MD_SIZE>(markdown.size()),
        AppendRenderedHtml,
        &result.html,
        kParserFlags,
        MD_HTML_FLAG_SKIP_UTF8_BOM);
    if (renderStatus != 0) {
        result.error = "LeanMark could not parse this Markdown document.";
        result.html.clear();
        return result;
    }

    result.hasMermaid =
        result.html.find("language-mermaid") != std::string::npos;
    result.ok = true;
    return result;
}

bool ReadDocumentFile(
    const std::filesystem::path& path,
    std::string& bytes,
    std::string& error) {
    bytes.clear();
    std::error_code code;
    const auto status = std::filesystem::status(path, code);
    if (code || !std::filesystem::exists(status)) {
        error = "LeanMark could not find this file.";
        return false;
    }
    if (std::filesystem::is_directory(status)) {
        error = "That path is a folder, not a Markdown file.";
        return false;
    }
    if (!std::filesystem::is_regular_file(status)) {
        error = "LeanMark can only read regular Markdown files.";
        return false;
    }

    const auto fileSize = std::filesystem::file_size(path, code);
    if (code) {
        error = "LeanMark could not measure this file.";
        return false;
    }
    if (static_cast<std::uint64_t>(fileSize) > kMaximumDocumentBytes) {
        error =
            "This file is larger than LeanMark's 32 MB safety limit. Open it "
            "in an editor if you need to inspect the raw text.";
        return false;
    }

    std::ifstream input(path, std::ios::binary);
    if (!input) {
        error = "LeanMark could not read this file.";
        return false;
    }

    bytes.resize(static_cast<std::size_t>(fileSize));
    if (!bytes.empty()) {
        input.read(bytes.data(), static_cast<std::streamsize>(bytes.size()));
        const auto bytesRead = input.gcount();
        if (bytesRead < 0 || (input.bad() && bytesRead == 0)) {
            bytes.clear();
            error = "LeanMark could not finish reading this file.";
            return false;
        }
        bytes.resize(static_cast<std::size_t>(bytesRead));
    }
    return true;
}

FileRenderResult RenderMarkdownFile(
    const std::filesystem::path& requestedPath) {
    FileRenderResult result;
    result.path = CanonicalPath(requestedPath);
    result.directory = result.path.parent_path();

    std::string markdown;
    if (!ReadDocumentFile(result.path, markdown, result.error)) {
        return result;
    }
    result.sourceBytes = static_cast<std::uint64_t>(markdown.size());

    auto rendered = RenderMarkdownUtf8(markdown);
    result.ok = rendered.ok;
    result.error = std::move(rendered.error);
    result.html = std::move(rendered.html);
    result.hasMermaid = rendered.hasMermaid;
    return result;
}

bool IsSupportedMarkdownPath(const std::filesystem::path& path) {
    const std::string extension = LowercaseAscii(path.extension().string());
    return extension == ".md" || extension == ".markdown" ||
           extension == ".mdown" || extension == ".mkd";
}

std::vector<MarkdownHeading> FindHeadings(std::string_view markdown) {
    if (markdown.size() > std::numeric_limits<MD_SIZE>::max()) {
        return {};
    }
    HeadingScan scan;
    scan.base = markdown.data();
    scan.size = markdown.size();

    MD_PARSER parser = {};
    parser.abi_version = 0;
    parser.flags = kParserFlags;
    parser.enter_block = ScanEnterBlock;
    parser.leave_block = ScanLeaveBlock;
    parser.enter_span = ScanSpan;
    parser.leave_span = ScanSpan;
    parser.text = ScanText;
    if (md_parse(markdown.data(), static_cast<MD_SIZE>(markdown.size()),
                 &parser, &scan) != 0) {
        return {};
    }
    return std::move(scan.headings);
}

SectionResult ExtractSection(std::string_view markdown, long long headingIndex) {
    SectionResult result;
    markdown = WithoutBom(markdown);
    if (!IsValidUtf8(markdown)) {
        result.error = "This file is not valid UTF-8.";
        return result;
    }

    const auto headings = FindHeadings(markdown);
    result.headingCount = headings.size();
    if (headingIndex < 0) {
        result.markdown = std::string(TrimTrailingWhitespace(markdown));
        result.ok = true;
        return result;
    }
    if (static_cast<unsigned long long>(headingIndex) >= headings.size()) {
        result.error = "That section is no longer in the file.";
        return result;
    }

    const auto index = static_cast<std::size_t>(headingIndex);
    const MarkdownHeading& heading = headings[index];
    if (heading.lineStart == std::string_view::npos) {
        result.error = "That heading has no text to locate it by.";
        return result;
    }

    // A section owns its subsections, so it runs until the next heading of the
    // same or a higher level rather than simply the next heading.
    std::size_t end = markdown.size();
    for (std::size_t next = index + 1; next < headings.size(); ++next) {
        if (headings[next].level <= heading.level) {
            if (headings[next].lineStart == std::string_view::npos) {
                result.error = "The end of that section could not be located.";
                return result;
            }
            end = headings[next].lineStart;
            break;
        }
    }

    result.markdown = std::string(TrimTrailingWhitespace(
        markdown.substr(heading.lineStart, end - heading.lineStart)));
    result.ok = true;
    return result;
}

bool IsPathWithin(
    const std::filesystem::path& root,
    const std::filesystem::path& candidate) {
    std::error_code rootError;
    std::error_code candidateError;
    const auto canonicalRoot = std::filesystem::canonical(root, rootError);
    const auto canonicalCandidate =
        std::filesystem::canonical(candidate, candidateError);
    if (rootError || candidateError) {
        return false;
    }

    auto rootPart = canonicalRoot.begin();
    auto candidatePart = canonicalCandidate.begin();
    for (; rootPart != canonicalRoot.end(); ++rootPart, ++candidatePart) {
        if (candidatePart == canonicalCandidate.end() ||
            *rootPart != *candidatePart) {
            return false;
        }
    }
    return true;
}

void AppendJsonString(std::string& output, std::string_view value) {
    static constexpr char kHex[] = "0123456789abcdef";
    // Characters that need no escaping are copied a run at a time rather than
    // one push_back each; rendered HTML is almost entirely such runs.
    std::size_t runStart = 0;
    for (std::size_t index = 0; index < value.size(); ++index) {
        const auto character = static_cast<unsigned char>(value[index]);
        char control[] = "\\u0000";
        const char* replacement = nullptr;
        std::size_t consumed = 1;
        switch (character) {
            case '"':
                replacement = "\\\"";
                break;
            case '\\':
                replacement = "\\\\";
                break;
            case '\b':
                replacement = "\\b";
                break;
            case '\f':
                replacement = "\\f";
                break;
            case '\n':
                replacement = "\\n";
                break;
            case '\r':
                replacement = "\\r";
                break;
            case '\t':
                replacement = "\\t";
                break;
            default:
                if (character < 0x20) {
                    control[4] = kHex[(character >> 4) & 0xF];
                    control[5] = kHex[character & 0xF];
                    replacement = control;
                } else if (
                    character == 0xE2 && index + 2 < value.size() &&
                    static_cast<unsigned char>(value[index + 1]) == 0x80 &&
                    (static_cast<unsigned char>(value[index + 2]) == 0xA8 ||
                     static_cast<unsigned char>(value[index + 2]) == 0xA9)) {
                    replacement =
                        static_cast<unsigned char>(value[index + 2]) == 0xA8
                            ? "\\u2028"
                            : "\\u2029";
                    consumed = 3;
                }
                break;
        }
        if (replacement == nullptr) {
            continue;
        }
        output.append(value.data() + runStart, index - runStart);
        output += replacement;
        index += consumed - 1;
        runStart = index + 1;
    }
    output.append(value.data() + runStart, value.size() - runStart);
}

std::string EscapeJsonString(std::string_view value) {
    std::string output;
    output.reserve(value.size() + 16);
    AppendJsonString(output, value);
    return output;
}

}  // namespace leanmark::core
