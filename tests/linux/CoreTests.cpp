#include "core/MarkdownCore.h"

#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>

namespace {

class TemporaryDirectory final {
public:
    TemporaryDirectory() {
        const auto unique = std::chrono::steady_clock::now()
                                .time_since_epoch()
                                .count();
        path = std::filesystem::temp_directory_path() /
               ("leanmark-core-tests-" + std::to_string(unique));
        std::filesystem::create_directories(path);
    }

    ~TemporaryDirectory() {
        std::error_code ignored;
        std::filesystem::remove_all(path, ignored);
    }

    std::filesystem::path path;
};

int failures = 0;

void Expect(bool condition, const char* message) {
    if (!condition) {
        ++failures;
        std::cerr << "FAIL: " << message << '\n';
    }
}

void WriteFile(
    const std::filesystem::path& path,
    const std::string& contents) {
    std::ofstream output(path, std::ios::binary);
    output.write(contents.data(), static_cast<std::streamsize>(contents.size()));
}

void TestRenderer() {
    const auto rendered = leanmark::core::RenderMarkdownUtf8(
        "# Portable\n\n- [x] GFM\n\n```mermaid\ngraph LR\nA-->B\n```\n");
    Expect(rendered.ok, "valid UTF-8 Markdown should render");
    Expect(
        rendered.html.find("<h1>Portable</h1>") != std::string::npos,
        "heading output should be present");
    Expect(rendered.hasMermaid, "Mermaid fences should be detected");

    const auto rawHtml = leanmark::core::RenderMarkdownUtf8(
        "# Safe\n\n<script>globalThis.leanmarkSentinel = true</script>\n");
    Expect(rawHtml.ok, "raw HTML fixture should still parse");
    Expect(
        rawHtml.html.find("<script") == std::string::npos &&
            rawHtml.html.find("</script") == std::string::npos,
        "raw HTML tags must be omitted by MD_FLAG_NOHTML");

    const auto bom = leanmark::core::RenderMarkdownUtf8(
        std::string("\xEF\xBB\xBF") + "# BOM\n");
    Expect(
        bom.ok && bom.html.find("<h1>BOM</h1>") != std::string::npos,
        "an optional UTF-8 BOM should be accepted");

    const std::string malformed("\xF0\x28\x8C\x28", 4);
    const auto invalid = leanmark::core::RenderMarkdownUtf8(malformed);
    Expect(!invalid.ok, "malformed UTF-8 must fail closed");
    Expect(
        invalid.error.find("not valid UTF-8") != std::string::npos,
        "malformed UTF-8 should have an actionable error");
}

void TestJsonEscaping() {
    const std::string input =
        std::string("\"\\\n\t") + std::string("\xE2\x80\xA8", 3);
    Expect(
        leanmark::core::EscapeJsonString(input) ==
            "\\\"\\\\\\n\\t\\u2028",
        "JSON escaping should cover quotes, slashes, controls, and U+2028");
}

void TestFilesAndPaths() {
    TemporaryDirectory temporary;
    const auto notes = temporary.path / "notes";
    const auto outside = temporary.path / "outside";
    std::filesystem::create_directories(notes / "assets");
    std::filesystem::create_directories(outside);

    const auto markdownPath = notes / "example.MARKDOWN";
    WriteFile(markdownPath, "# File\n");
    const auto rendered = leanmark::core::RenderMarkdownFile(markdownPath);
    Expect(rendered.ok, "a regular Markdown file should render");
    Expect(
        rendered.sourceBytes == 7,
        "the portable file adapter should report the bytes actually read");
    Expect(
        leanmark::core::IsSupportedMarkdownPath(markdownPath),
        "supported Markdown extensions should be case-insensitive");
    Expect(
        !leanmark::core::IsSupportedMarkdownPath(notes / "example.html"),
        "non-Markdown extensions should be rejected");

    const auto localImage = notes / "assets" / "local.svg";
    const auto outsideImage = outside / "outside.svg";
    WriteFile(localImage, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    WriteFile(outsideImage, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
    Expect(
        leanmark::core::IsPathWithin(notes, localImage),
        "a canonical child should remain inside its document root");
    Expect(
        !leanmark::core::IsPathWithin(notes, outsideImage),
        "a sibling path must not pass document-root containment");

    std::error_code symlinkError;
    const auto escapingLink = notes / "assets" / "escape.svg";
    std::filesystem::create_symlink(outsideImage, escapingLink, symlinkError);
    if (!symlinkError) {
        Expect(
            !leanmark::core::IsPathWithin(notes, escapingLink),
            "a symlink escaping the document root must be rejected");
    }

    const auto oversized = notes / "oversized.md";
    {
        std::ofstream output(oversized, std::ios::binary);
        output.seekp(
            static_cast<std::streamoff>(
                leanmark::core::kMaximumDocumentBytes));
        output.put('x');
    }
    const auto tooLarge = leanmark::core::RenderMarkdownFile(oversized);
    Expect(!tooLarge.ok, "a file above 32 MiB must be rejected");
    Expect(
        tooLarge.error.find("32 MB safety limit") != std::string::npos,
        "the file-size error should name the safety limit");
}

}  // namespace

int main() {
    TestRenderer();
    TestJsonEscaping();
    TestFilesAndPaths();
    if (failures != 0) {
        std::cerr << failures << " portable core assertion(s) failed.\n";
        return 1;
    }
    std::cout << "LeanMark portable core tests passed.\n";
    return 0;
}
