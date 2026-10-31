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

// Page zoom levels shared by every host, as fractions of actual size. They are
// the familiar browser steps, so repeated zooming always lands on round values
// instead of drifting by 0.1 at a time.
constexpr double kZoomLevels[] = {
    0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0};
constexpr double kDefaultZoom = 1.0;

// Returns the next level above (direction > 0) or below (direction < 0) the
// current zoom, staying at the ends of the range. A zero direction resets.
double StepZoom(double current, int direction);

// Snaps a saved or host-reported zoom to the nearest level. Values that are not
// finite or are out of range give the default.
double NormalizeZoom(double value);

// Reader themes. Dim and Dusk are softer dark themes with less contrast than
// Dark. The names are what every host saves and what the reader page uses.
enum class Theme { System, Light, Dark, Dim, Dusk };

struct ThemeColor {
    unsigned char red = 0;
    unsigned char green = 0;
    unsigned char blue = 0;
};

// Reads a saved or page-requested theme name, ignoring ASCII case. Anything
// else, including a name from a later version, gives Theme::System.
Theme ParseTheme(std::string_view name);
const char* ThemeName(Theme theme);

// The theme after this one on the theme button: System, Light, Dark, Dim,
// Dusk, then System again.
Theme NextTheme(Theme theme);

// Whether the window chrome should be dark. systemDark is the platform's own
// dark-mode setting, used only for Theme::System.
bool IsDarkTheme(Theme theme, bool systemDark);

// The page background (--canvas in reader.css) for a theme. Hosts paint it
// before the page draws so a launch shows no white flash.
ThemeColor ThemeCanvas(Theme theme, bool systemDark);

// Width of the reading column. Narrow is the 0.5.0 column and the default;
// the pixel widths live in reader.css. The names are what every host saves and
// what the reader page uses.
enum class TextWidth { Narrow, Wide, Full };
constexpr TextWidth kDefaultTextWidth = TextWidth::Narrow;

// Reads a saved or page-requested width name, ignoring ASCII case. Anything
// else, including a missing value from 0.5.0 or a name from a later version,
// gives kDefaultTextWidth.
TextWidth ParseTextWidth(std::string_view name);
const char* TextWidthName(TextWidth width);

// The width after this one: Narrow, Wide, Full, then Narrow again.
TextWidth NextTextWidth(TextWidth width);

// Appends value to output as the inside of a JSON string literal. Building a
// message in place avoids a temporary copy per field, which matters for the
// rendered HTML of a large document.
void AppendJsonString(std::string& output, std::string_view value);
std::string EscapeJsonString(std::string_view value);

}  // namespace leanmark::core
