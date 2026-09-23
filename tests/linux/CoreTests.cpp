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

std::string Section(const std::string& markdown, long long index) {
    const auto section = leanmark::core::ExtractSection(markdown, index);
    return section.ok ? section.markdown : "<error: " + section.error + ">";
}

std::size_t CountRenderedHeadings(const std::string& html) {
    std::size_t count = 0;
    for (std::size_t at = html.find("<h"); at != std::string::npos;
         at = html.find("<h", at + 2)) {
        const char level = at + 2 < html.size() ? html[at + 2] : '\0';
        if (level >= '1' && level <= '6') {
            ++count;
        }
    }
    return count;
}

void TestSections() {
    const std::string nested =
        "# A\n\nintro\n\n## B\n\nb text\n\n### C\n\nc\n\n## D\n\nd\n\n# E\n";
    const auto headings = leanmark::core::FindHeadings(nested);
    Expect(headings.size() == 5, "every ATX heading should be found");
    Expect(
        headings.size() == 5 && headings[0].level == 1 &&
            headings[1].level == 2 && headings[2].level == 3 &&
            headings[3].level == 2 && headings[4].level == 1,
        "heading levels should come from the parser");
    Expect(
        Section(nested, 1) == "## B\n\nb text\n\n### C\n\nc",
        "a section should own its subsections and stop at a sibling");
    Expect(
        Section(nested, 2) == "### C\n\nc",
        "a deeper section should stop at the next shallower heading");
    Expect(
        Section(nested, 0) == "# A\n\nintro\n\n## B\n\nb text\n\n### C\n\nc"
                              "\n\n## D\n\nd",
        "a top-level section should run to the next top-level heading");
    Expect(Section(nested, 4) == "# E", "the last section should end at EOF");
    Expect(
        Section(nested, -1) == nested.substr(0, nested.size() - 1),
        "a negative index should copy the whole document, trimmed");
    const auto outOfRange = leanmark::core::ExtractSection(nested, 5);
    Expect(
        !outOfRange.ok && outOfRange.headingCount == 5,
        "an index past the last heading must fail and report the count");

    const std::string fenced =
        "# Code\n\n```sh\n# not a heading\n```\n\n# Next\n";
    Expect(
        leanmark::core::FindHeadings(fenced).size() == 2,
        "a hash inside a fenced block is not a heading");
    Expect(
        Section(fenced, 0) == "# Code\n\n```sh\n# not a heading\n```",
        "a section should carry its fenced block intact");

    const std::string setext =
        "Title\n=====\n\nbody\n\nSub\n---\n\nmore\n";
    const auto setextHeadings = leanmark::core::FindHeadings(setext);
    Expect(
        setextHeadings.size() == 2 && setextHeadings[0].level == 1 &&
            setextHeadings[1].level == 2,
        "setext headings should be found with their levels");
    Expect(
        Section(setext, 1) == "Sub\n---\n\nmore",
        "a setext section should start on its text line");
    Expect(
        Section("Line one\nline two\n===\n\nx\n", 0) ==
            "Line one\nline two\n===\n\nx",
        "a multi-line setext heading should start on its first line");

    Expect(
        Section("> # Quoted\n> text\n\n# Next\n", 0) == "> # Quoted\n> text",
        "a heading in a block quote should keep its quote marker");
    Expect(
        Section("- # Listed\n  text\n\n# Next\n", 0) == "- # Listed\n  text",
        "a heading in a list item should keep its list marker");
    Expect(
        Section("   # Indented\n\nx\n", 0) == "   # Indented\n\nx",
        "an indented ATX heading should keep its indentation");
    Expect(
        Section("# `code` first\n\nx\n", 0) == "# `code` first\n\nx",
        "a heading that opens with a code span should be located");
    Expect(
        Section("## **Bold** first\n\nx\n", 0) == "## **Bold** first\n\nx",
        "a heading that opens with emphasis should be located");
    Expect(
        Section("# &amp; entity\n\nx\n", 0) == "# &amp; entity\n\nx",
        "a heading that opens with an entity should be located");

    const std::string empty = "#\n\ntext\n\n# B\n";
    const auto emptyHeadings = leanmark::core::FindHeadings(empty);
    Expect(
        emptyHeadings.size() == 2 &&
            emptyHeadings[0].lineStart == std::string_view::npos,
        "an empty heading should be counted but left unlocated");
    Expect(
        !leanmark::core::ExtractSection(empty, 0).ok,
        "an unlocated heading must fail rather than guess");
    Expect(Section(empty, 1) == "# B", "later headings should still work");
    Expect(
        !leanmark::core::ExtractSection("x\n\n#\n", 0).ok,
        "an unlocated final heading must fail rather than throw");
    Expect(
        !leanmark::core::ExtractSection("# A\n\ntext\n\n#\n", 0).ok,
        "a section whose end cannot be located must fail");

    // MD4C reports a NUL byte as static replacement text that lives outside the
    // input buffer, so the scanner has to skip it and anchor on the next text.
    const std::string nul("# \0x\n\ny\n", 8);
    Expect(
        Section(nul, 0) == std::string("# \0x\n\ny", 7),
        "a heading that opens with a NUL byte should still be located");

    Expect(
        Section("# A\r\n\r\ntext\r\n\r\n## B\r\nb\r\n", 1) == "## B\r\nb",
        "CRLF files should split on the same boundaries");
    const std::string bom = std::string("\xEF\xBB\xBF") + "# A\n\n## B\nx\n";
    Expect(
        Section(bom, 0) == "# A\n\n## B\nx",
        "the BOM should never reach the clipboard");
    Expect(
        leanmark::core::ExtractSection(bom, 0).headingCount == 2,
        "the heading count should ignore the BOM");
    Expect(
        !leanmark::core::ExtractSection(std::string("\xF0\x28\x8C\x28", 4), -1)
             .ok,
        "malformed UTF-8 must not be copied");

    const std::string mixed =
        "# One\n\n> ## Two\n\n- ### Three\n\n```\n# fence\n```\n\n"
        "Four\n----\n\n<h1>raw</h1>\n\n    # indented code\n\n###### Six\n\n"
        "<div>\n# Only a heading when raw HTML is off\n</div>\n";
    const auto rendered = leanmark::core::RenderMarkdownUtf8(mixed);
    Expect(
        rendered.ok &&
            CountRenderedHeadings(rendered.html) ==
                leanmark::core::FindHeadings(mixed).size(),
        "heading i in the source must be heading i in the rendered page");
}

void TestJsonEscaping() {
    const std::string input =
        std::string("\"\\\n\t") + std::string("\xE2\x80\xA8", 3);
    Expect(
        leanmark::core::EscapeJsonString(input) ==
            "\\\"\\\\\\n\\t\\u2028",
        "JSON escaping should cover quotes, slashes, controls, and U+2028");
    Expect(
        leanmark::core::EscapeJsonString(
            std::string("a\x01" "b\r\b\f", 6) +
            std::string("\xE2\x80\xA9", 3) + "tail") ==
            "a\\u0001b\\r\\b\\f\\u2029tail",
        "JSON escaping should keep the text between escapes intact");
    std::string appended = "{\"k\":\"";
    leanmark::core::AppendJsonString(appended, "x\"y");
    Expect(
        appended == "{\"k\":\"x\\\"y",
        "AppendJsonString should extend the existing buffer");
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
    TestSections();
    TestJsonEscaping();
    TestFilesAndPaths();
    if (failures != 0) {
        std::cerr << failures << " portable core assertion(s) failed.\n";
        return 1;
    }
    std::cout << "LeanMark portable core tests passed.\n";
    return 0;
}
