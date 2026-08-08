#include "MarkdownCore.h"

#include <algorithm>
#include <fstream>
#include <limits>
#include <utility>

#include "md4c-html.h"

namespace leanmark::core {
namespace {

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

}  // namespace

RenderResult RenderMarkdownUtf8(std::string_view markdown) {
    RenderResult result;
    if (HasUtf8Bom(markdown)) {
        markdown.remove_prefix(3);
    }

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

    const unsigned parserFlags = MD_DIALECT_GITHUB | MD_FLAG_NOHTML;
    const int renderStatus = md_html(
        markdown.data(),
        static_cast<MD_SIZE>(markdown.size()),
        AppendRenderedHtml,
        &result.html,
        parserFlags,
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

FileRenderResult RenderMarkdownFile(
    const std::filesystem::path& requestedPath) {
    FileRenderResult result;
    result.path = CanonicalPath(requestedPath);
    result.directory = result.path.parent_path();

    std::error_code error;
    const auto status = std::filesystem::status(result.path, error);
    if (error || !std::filesystem::exists(status)) {
        result.error = "LeanMark could not find this file.";
        return result;
    }
    if (std::filesystem::is_directory(status)) {
        result.error = "That path is a folder, not a Markdown file.";
        return result;
    }
    if (!std::filesystem::is_regular_file(status)) {
        result.error = "LeanMark can only read regular Markdown files.";
        return result;
    }

    const auto fileSize = std::filesystem::file_size(result.path, error);
    if (error) {
        result.error = "LeanMark could not measure this file.";
        return result;
    }
    result.sourceBytes = static_cast<std::uint64_t>(fileSize);
    if (result.sourceBytes > kMaximumDocumentBytes) {
        result.error =
            "This file is larger than LeanMark's 32 MB safety limit. Open it "
            "in an editor if you need to inspect the raw text.";
        return result;
    }

    std::ifstream input(result.path, std::ios::binary);
    if (!input) {
        result.error = "LeanMark could not read this file.";
        return result;
    }

    std::string markdown(static_cast<std::size_t>(result.sourceBytes), '\0');
    if (!markdown.empty()) {
        input.read(markdown.data(), static_cast<std::streamsize>(markdown.size()));
        const auto bytesRead = input.gcount();
        if (bytesRead < 0 || (input.bad() && bytesRead == 0)) {
            result.error = "LeanMark could not finish reading this file.";
            return result;
        }
        markdown.resize(static_cast<std::size_t>(bytesRead));
        result.sourceBytes = static_cast<std::uint64_t>(markdown.size());
    }

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

std::string EscapeJsonString(std::string_view value) {
    static constexpr char kHex[] = "0123456789abcdef";
    std::string output;
    output.reserve(value.size() + 16);

    for (std::size_t index = 0; index < value.size(); ++index) {
        const auto character = static_cast<unsigned char>(value[index]);
        switch (character) {
            case '"':
                output += "\\\"";
                break;
            case '\\':
                output += "\\\\";
                break;
            case '\b':
                output += "\\b";
                break;
            case '\f':
                output += "\\f";
                break;
            case '\n':
                output += "\\n";
                break;
            case '\r':
                output += "\\r";
                break;
            case '\t':
                output += "\\t";
                break;
            default:
                if (character < 0x20) {
                    output += "\\u00";
                    output += kHex[(character >> 4) & 0xF];
                    output += kHex[character & 0xF];
                } else if (
                    character == 0xE2 && index + 2 < value.size() &&
                    static_cast<unsigned char>(value[index + 1]) == 0x80 &&
                    (static_cast<unsigned char>(value[index + 2]) == 0xA8 ||
                     static_cast<unsigned char>(value[index + 2]) == 0xA9)) {
                    output += static_cast<unsigned char>(value[index + 2]) == 0xA8
                                  ? "\\u2028"
                                  : "\\u2029";
                    index += 2;
                } else {
                    output.push_back(static_cast<char>(character));
                }
                break;
        }
    }
    return output;
}

}  // namespace leanmark::core
