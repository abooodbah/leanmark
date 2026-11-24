// Checks the interface translations without a browser: both string tables
// have the same keys and placeholders, the Chinese table has no English left
// in it apart from product and key names, a missing key falls back to
// English, the language follows the system unless the reader picked one,
// every visible string in reader.html and every message the Windows host
// sends has a translation, and the host's own dialog strings come in pairs.
//
//   node tests/Test-Localization.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

let failures = 0;
function check(condition, message) {
  if (condition) {
    console.log("PASS " + message);
  } else {
    failures += 1;
    console.error("FAIL " + message);
  }
}

// Names that stay in Latin letters in the Chinese interface: the product,
// the formats and runtimes it names, units, and the names printed on keys.
const LATIN_NAMES = [
  "LeanMark", "Mermaid", "Markdown", "WebView2", "Microsoft Edge", "Windows",
  "UTF-8", "KB", "MB", "Ctrl", "Shift", "Cmd", "Esc", "Enter", "Tab", "Home",
  "End", "Delete", "Page Up", "Page Down", "F1", "F3",
  ".md", ".markdown", ".mdown", ".mkd",
];

function leftoverEnglish(text) {
  let rest = String(text).replace(/\{[a-zA-Z]+\}/g, " ");
  // Longest names first, so "Page Down" goes before "Page" could match.
  [...LATIN_NAMES].sort((a, b) => b.length - a.length).forEach((name) => {
    rest = rest.split(name).join(" ");
  });
  const words = rest.match(/[A-Za-z]{2,}/g);
  return words ? words.join(", ") : "";
}

const hasChinese = (text) => /[一-鿿]/.test(text);
// Japanese labels can be kanji only (設定, 言語), so a string passes with kana
// or kanji; the table as a whole must still be mostly kana, which Chinese
// never has.
const hasJapanese = (text) => /[\u3040-\u30ff一-鿿]/.test(text);
const hasKana = (text) => /[\u3040-\u30ff]/.test(text);
const placeholders = (text) =>
  (String(text).match(/\{[a-zA-Z]+\}/g) || []).sort().join(" ");

// The tables live in reader.js between two marker comments, so the page
// needs no extra file and this test can run them on their own.
const readerSource = read("assets/reader.js");
const begin = readerSource.indexOf("// BEGIN interface strings");
const end = readerSource.indexOf("// END interface strings");
check(begin >= 0 && end > begin,
  "reader.js keeps the interface strings between BEGIN and END markers");
if (begin < 0 || end <= begin) {
  console.error(failures + " localization check(s) failed.");
  process.exit(1);
}
const block = readerSource.slice(begin, end);
const strings = vm.runInNewContext(
  "(function () {\n" + block + "\nreturn interfaceStrings;\n}())", {});

const english = strings.tables.en;
const chinese = strings.tables["zh-CN"];
check(english && chinese && Object.keys(english).length > 50,
  "there is an English and a Simplified Chinese table (" +
  (english ? Object.keys(english).length : 0) + " English strings)");

// 1. The same keys in both tables, with the same placeholders.
const missingInChinese = Object.keys(english).filter((key) => !(key in chinese));
const extraInChinese = Object.keys(chinese).filter((key) => !(key in english));
check(missingInChinese.length === 0,
  "every English key has a Chinese string" +
  (missingInChinese.length ? " (missing: " + missingInChinese.join(", ") + ")" : ""));
check(extraInChinese.length === 0,
  "the Chinese table has no key English lacks" +
  (extraInChinese.length ? " (extra: " + extraInChinese.join(", ") + ")" : ""));
const placeholderDrift = Object.keys(english).filter((key) =>
  key in chinese && placeholders(english[key]) !== placeholders(chinese[key]));
check(placeholderDrift.length === 0,
  "each Chinese string keeps the placeholders of its English one" +
  (placeholderDrift.length ? " (" + placeholderDrift.join(", ") + ")" : ""));

// 2. No English left in the Chinese table.
const untranslated = Object.keys(chinese).filter((key) =>
  leftoverEnglish(chinese[key]) !== "" || !hasChinese(chinese[key]) ||
  chinese[key] === english[key]);
check(untranslated.length === 0,
  "no Chinese string is left in English, apart from product and key names" +
  (untranslated.length
    ? " (" + untranslated.map((key) => key + ": " + chinese[key]).join("; ") + ")"
    : ""));

// 2b. The Japanese table: the same keys and placeholders, nothing left in
// English, and Japanese rather than Chinese text.
const japanese = strings.tables.ja;
check(!!japanese, "there is a Japanese table");
const missingInJapanese = Object.keys(english).filter((key) => !japanese || !(key in japanese));
const extraInJapanese = japanese ? Object.keys(japanese).filter((key) => !(key in english)) : [];
check(missingInJapanese.length === 0 && extraInJapanese.length === 0,
  "the Japanese table has exactly the English keys" +
  (missingInJapanese.length ? " (missing: " + missingInJapanese.join(", ") + ")" : "") +
  (extraInJapanese.length ? " (extra: " + extraInJapanese.join(", ") + ")" : ""));
const japaneseDrift = Object.keys(english).filter((key) =>
  japanese && key in japanese && placeholders(english[key]) !== placeholders(japanese[key]));
check(japaneseDrift.length === 0,
  "each Japanese string keeps the placeholders of its English one" +
  (japaneseDrift.length ? " (" + japaneseDrift.join(", ") + ")" : ""));
const untranslatedJapanese = japanese ? Object.keys(japanese).filter((key) =>
  leftoverEnglish(japanese[key]) !== "" || !hasJapanese(japanese[key]) ||
  japanese[key] === english[key]) : ["(no table)"];
check(untranslatedJapanese.length === 0,
  "no Japanese string is left in English, apart from product and key names" +
  (untranslatedJapanese.length
    ? " (" + untranslatedJapanese.map((key) => key + ": " + (japanese || {})[key]).join("; ") + ")"
    : ""));
const kanaShare = japanese
  ? Object.values(japanese).filter(hasKana).length / Object.keys(japanese).length : 0;
check(kanaShare > 0.6,
  "the Japanese table is written in Japanese, not Chinese (" +
  Math.round(kanaShare * 100) + "% of strings have kana)");
check(strings.text("ja", anyKeyFor()) === (japanese || {})[anyKeyFor()],
  "a key gives the Japanese string when Japanese is chosen");

function anyKeyFor() {
  return Object.keys(english).find((key) => placeholders(english[key]) === "");
}

// 3. Lookup: placeholders filled, a missing key falls back to English, and
// an unknown language uses English.
const anyKey = Object.keys(english).find((key) => placeholders(english[key]) === "");
check(strings.text("en", anyKey) === english[anyKey] &&
  strings.text("zh-CN", anyKey) === chinese[anyKey],
  "a key gives the string of the chosen language");
const savedChinese = chinese[anyKey];
delete chinese[anyKey];
check(strings.text("zh-CN", anyKey) === english[anyKey],
  "a key missing from the Chinese table falls back to English");
chinese[anyKey] = savedChinese;
check(strings.text("fr", anyKey) === english[anyKey],
  "an unknown language falls back to English");
check(strings.text("zh-CN", "no.such.key") === "no.such.key",
  "a key in neither table shows the key rather than nothing");
const withValue = Object.keys(english).find((key) => placeholders(english[key]) !== "");
const filled = strings.text("zh-CN", withValue, { percent: 125, name: "README.md",
  keys: "Ctrl+/", theme: "X", width: "X", size: "1 KB", text: "Setup", alt: "logo",
  level: "100%" });
check(filled.indexOf("{") < 0 && hasChinese(filled),
  "placeholders are filled in (" + withValue + ": " + filled + ")");

// 4. Which language: System follows the system, a choice overrides it.
const resolve = strings.resolve;
["zh-CN", "zh-cn", "zh", "zh-SG", "zh-Hans", "zh-Hans-CN", "zh-Hans-HK",
  "zh_CN.UTF-8", "zh_CN"].forEach((tag) => {
  check(resolve("system", tag) === "zh-CN",
    "a " + tag + " system language picks Simplified Chinese");
});
["en-US", "en", "", "de-DE", "jax", "jv-ID", "zh-TW", "zh-HK", "zh-MO", "zh-Hant",
  "zh-Hant-TW", "zh_TW.UTF-8", "zhx"].forEach((tag) => {
  check(resolve("system", tag) === "en",
    "a '" + tag + "' system language picks English");
});
check(resolve("en", "zh-CN") === "en", "choosing English overrides a Chinese system");
check(resolve("zh-CN", "en-US") === "zh-CN",
  "choosing Simplified Chinese overrides an English system");
["ja", "ja-JP", "JA-jp", "ja_JP.UTF-8", "ja_JP"].forEach((tag) => {
  check(resolve("system", tag) === "ja",
    "a " + tag + " system language picks Japanese");
});
check(resolve("ja", "en-US") === "ja" && resolve("en", "ja-JP") === "en",
  "choosing Japanese or English overrides the system");
check(strings.languages.indexOf("ja") >= 0, "Japanese is one of the interface languages");
check(resolve("fr", "zh-CN") === "zh-CN" && resolve(undefined, "en-US") === "en",
  "an unknown or missing setting follows the system");

// 5. Every visible string in reader.html is marked for translation, and its
// English table entry is the text the page starts with.
const html = read("assets/reader.html");
const body = html.slice(html.indexOf("<body"));
const withoutSvg = body.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const SAME_IN_EVERY_LANGUAGE = new Set(["LeanMark", "LM", "100%", "1:1", "English", "简体中文", "日本語"]);
const collapse = (text) => text.replace(/\s+/g, " ").trim();
const tagPattern = /<([a-z0-9]+)((?:\s+[a-z0-9-]+(?:="[^"]*")?)*)\s*(\/?)>|<\/([a-z0-9]+)>|([^<]+)/gi;
const stack = [];
const unmarkedText = [];
const textDrift = [];
const unmarkedAttributes = [];
let match;
while ((match = tagPattern.exec(withoutSvg))) {
  if (match[1]) {
    const attributes = {};
    (match[2].match(/[a-z0-9-]+(?:="[^"]*")?/gi) || []).forEach((pair) => {
      const equals = pair.indexOf("=");
      attributes[equals < 0 ? pair : pair.slice(0, equals)] =
        equals < 0 ? "" : pair.slice(equals + 2, -1);
    });
    ["title", "aria-label", "placeholder"].forEach((name) => {
      if (attributes[name] === undefined) {
        return;
      }
      const key = attributes["data-i18n-" + name];
      if (!key) {
        unmarkedAttributes.push(name + '="' + attributes[name] + '"');
      } else if (english[key] !== attributes[name]) {
        textDrift.push(key + ' (' + name + ' "' + attributes[name] + '" vs "' + english[key] + '")');
      }
    });
    const voidTag = /^(input|meta|link|br|img)$/i.test(match[1]) || match[3] === "/";
    if (!voidTag) {
      stack.push(attributes);
    }
  } else if (match[4]) {
    stack.pop();
  } else if (match[5]) {
    const text = collapse(match[5]);
    if (!text || SAME_IN_EVERY_LANGUAGE.has(text)) {
      continue;
    }
    const parent = stack[stack.length - 1] || {};
    if (!parent["data-i18n"]) {
      unmarkedText.push(text);
    } else if (english[parent["data-i18n"]] !== text) {
      textDrift.push(parent["data-i18n"] + ' ("' + text + '" vs "' +
        english[parent["data-i18n"]] + '")');
    }
  }
}
check(unmarkedText.length === 0,
  "every visible text in reader.html has a data-i18n key" +
  (unmarkedText.length ? " (" + unmarkedText.join("; ") + ")" : ""));
check(unmarkedAttributes.length === 0,
  "every title, aria-label, and placeholder in reader.html has a data-i18n key" +
  (unmarkedAttributes.length ? " (" + unmarkedAttributes.join("; ") + ")" : ""));
check(textDrift.length === 0,
  "each English table entry matches the text reader.html starts with" +
  (textDrift.length ? " (" + textDrift.join("; ") + ")" : ""));
const htmlKeys = [...body.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]);
const unknownKeys = htmlKeys.filter((key) => !(key in english));
check(htmlKeys.length > 30 && unknownKeys.length === 0,
  "every data-i18n key in reader.html is in the tables" +
  (unknownKeys.length ? " (" + unknownKeys.join(", ") + ")" : ""));

// 6. Messages the Windows host sends in English have a translation. They are
// matched whole, or as a sentence followed by Windows' own error text.
function literals(source, pattern) {
  const found = [];
  for (const call of source.matchAll(pattern)) {
    const parts = [...call[1].matchAll(/L?"((?:[^"\\]|\\.)*)"/g)]
      .map((part) => part[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    if (parts.length) {
      found.push(parts.join(""));
    }
  }
  return found;
}
const literalRun = '((?:\\s*L?"(?:[^"\\\\]|\\\\.)*")+)';
const app = read("src/App.cpp");
const hostMessages = [
  ...literals(app, new RegExp("SendStatus\\(" + literalRun, "g")),
  ...literals(app, new RegExp("SendError\\(\\s*tab,\\s*" + literalRun, "g")),
  ...literals(read("src/Markdown.cpp"), new RegExp("error\\s*=" + literalRun, "g")),
  ...literals(read("src/Markdown.cpp"), new RegExp("\\?\\s*" + literalRun, "g")),
  ...literals(read("src/core/MarkdownCore.cpp"), new RegExp("error\\s*=" + literalRun, "g")),
];
check(hostMessages.length >= 25,
  "found the host's status and error messages (" + hostMessages.length + ")");
const WINDOWS_DETAIL = "Access is denied.";
const untranslatedHost = hostMessages.filter((message) => {
  const sample = message.endsWith(" ") ? message + WINDOWS_DETAIL : message;
  const translated = strings.hostText("zh-CN", sample);
  const own = message.endsWith(" ") ? translated.slice(0, -WINDOWS_DETAIL.length) : translated;
  return translated === sample || !hasChinese(own) || leftoverEnglish(own) !== "" ||
    (message.endsWith(" ") && !translated.endsWith(WINDOWS_DETAIL));
});
check(untranslatedHost.length === 0,
  "every message the Windows host sends has a Chinese translation" +
  (untranslatedHost.length ? " (" + untranslatedHost.join("; ") + ")" : ""));
const untranslatedJapaneseHost = hostMessages.filter((message) => {
  const sample = message.endsWith(" ") ? message + WINDOWS_DETAIL : message;
  const translated = strings.hostText("ja", sample);
  const own = message.endsWith(" ") ? translated.slice(0, -WINDOWS_DETAIL.length) : translated;
  return translated === sample || !hasKana(own) || leftoverEnglish(own) !== "" ||
    (message.endsWith(" ") && !translated.endsWith(WINDOWS_DETAIL));
});
check(untranslatedJapaneseHost.length === 0,
  "every message the Windows host sends has a Japanese translation" +
  (untranslatedJapaneseHost.length ? " (" + untranslatedJapaneseHost.join("; ") + ")" : ""));
check(hostMessages.every((message) => strings.hostText("en", message) === message),
  "host messages are shown unchanged in English");
check(strings.hostText("zh-CN", "A message from a newer host.") === "A message from a newer host.",
  "a host message without a translation is shown as it came");

// 7. The host's own strings (start-up errors, the file dialog) come in
// English and Chinese pairs, and no dialog takes a bare English literal.
const nativePairs = [...app.matchAll(new RegExp(
  "constexpr NativeText k[A-Za-z0-9]+\\s*=\\s*\\{" + literalRun + "\\s*," + literalRun +
  "\\s*," + literalRun + "\\s*\\}",
  "g"))].map((pair) => [literals(pair[1], new RegExp(literalRun, "g")).join(""),
  literals(pair[2], new RegExp(literalRun, "g")).join(""),
  literals(pair[3], new RegExp(literalRun, "g")).join("")]);
check(nativePairs.length >= 6,
  "the Windows host has English, Chinese and Japanese strings for its own text (" +
  nativePairs.length + ")");
const badPairs = nativePairs.filter(([en, zh, ja]) =>
  !en || !hasChinese(zh) || leftoverEnglish(zh) !== "" ||
  !hasKana(ja) || leftoverEnglish(ja) !== "");
check(badPairs.length === 0,
  "each native Chinese and Japanese string is translated" +
  (badPairs.length ? " (" + badPairs.map((pair) => pair[1]).join("; ") + ")" : ""));
const bareDialogText = [
  ...app.matchAll(/MessageBoxW\(([^;]*?)\);/g)].filter((call) => /L"/.test(call[1]));
check(bareDialogText.length === 0 && !/SetTitle\(L"/.test(app) &&
  !/\{L"Markdown files"/.test(app),
  "message boxes and the file dialog take their text from the native table");
const textBody = (app.match(
  /LeanMarkApp::Text\(const NativeText& text\) const \{([\s\S]*?)\r?\n\}/) || [])[1] || "";
check(/"ja"\) == 0\)\s*\{\s*return text\.japanese;/.test(textBody) &&
  /"zh-CN"\) == 0 \? text\.chinese : text\.english;/.test(textBody),
  "the Windows host picks the Japanese and Chinese native strings by interface language");

if (failures) {
  console.error(failures + " localization check(s) failed.");
  process.exit(1);
}
console.log("LeanMark localization checks passed.");
