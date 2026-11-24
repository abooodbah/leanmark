(function () {
  "use strict";

  // BEGIN interface strings
  // The interface in English and Simplified Chinese. English is the fallback
  // for any key the other table lacks. reader.html starts in English and marks
  // each string with data-i18n (text) or data-i18n-<attribute>. Keys stay
  // ASCII; {name} placeholders are filled by text(). tests/Test-Localization.mjs
  // runs this block on its own, so it uses nothing from the page.
  var interfaceStrings = (function () {
    var tables = {
      en: {
        "app.currentDocument": "Current document",
        "app.tagline": "Lightweight Markdown reader",
        "app.couldNotOpen": "Could not open this document",
        "toolbar.label": "Reader controls",
        "find.label": "Find in document",
        "find.placeholder": "Find",
        "find.pressEnter": "Enter",
        "copy.button": "Copy",
        "copy.copied": "Copied",
        "copy.documentTitle": "Copy the whole document (Ctrl+Shift+C)",
        "copy.documentKeys": "Copy the whole document ({keys})",
        "copy.documentMarkdownKeys": "Copy the whole document as Markdown ({keys})",
        "copy.section": "Copy this section",
        "copy.sectionMarkdown": "Copy this section as Markdown",
        "copy.sectionLabel": "Copy section: {text}",
        "copy.documentAsMarkdown": "Document copied as Markdown.",
        "copy.sectionAsMarkdown": "Section copied as Markdown.",
        "copy.documentAsText": "Document copied as text.",
        "copy.sectionAsText": "Section copied as text.",
        "copy.failed": "LeanMark could not copy to the clipboard.",
        "settings.buttonLabel": "Settings and keyboard shortcuts",
        "settings.buttonTitle": "Settings and shortcuts (Ctrl+/)",
        "settings.buttonKeys": "Settings and shortcuts ({keys})",
        "settings.title": "Settings",
        "settings.close": "Close settings",
        "settings.theme": "Theme",
        "settings.textWidth": "Text width",
        "settings.language": "Language",
        "settings.shortcuts": "Keyboard shortcuts",
        "language.system": "System",
        "theme.system": "System",
        "theme.light": "Light",
        "theme.dark": "Dark",
        "theme.dim": "Dim",
        "theme.dusk": "Dusk",
        "theme.systemShown": "System ({theme})",
        "theme.buttonLabel": "Theme: {theme}. Activate to change theme.",
        "theme.buttonTitle": "Theme: {theme} ({keys})",
        "width.narrow": "Narrow",
        "width.wide": "Wide",
        "width.full": "Full",
        "width.fullWindow": "Full window",
        "width.indicator": "Text width: {width}",
        "open.button": "Open",
        "open.markdownFile": "Open a Markdown file",
        "tabs.label": "Open documents",
        "tabs.close": "Close (Ctrl+W)",
        "tabs.closeName": "Close {name}",
        "progress.label": "Reading progress",
        "outline.label": "Document outline",
        "outline.title": "On this page",
        "state.emptyTitle": "Read Markdown without opening an editor.",
        "state.emptyMessage": "Open a local Markdown file to begin. Diagrams render privately on this computer.",
        "state.emptyMessageShort": "Open a local Markdown file to begin.",
        "state.errorTitle": "This document could not be opened.",
        "state.errorMessage": "Check the file and try again.",
        "doc.untitled": "Untitled",
        "doc.watching": "{size} · Watching for changes",
        "image.alt": "Image",
        "image.unavailable": "Image unavailable — {alt}",
        "image.remoteBlocked": "Remote image blocked — {alt}",
        "image.invalidPath": "Image path is invalid — {alt}",
        "figure.expand": "Expand",
        "figure.expandImage": "Expand image",
        "figure.expandDiagram": "Expand diagram",
        "table.scrollable": "Scrollable table",
        "diagram.label": "Mermaid diagram",
        "diagram.limitTitle": "Diagram limit reached",
        "diagram.limitDetail": "LeanMark renders at most 50 diagrams in one document.",
        "diagram.tooLargeTitle": "Diagram is too large",
        "diagram.tooLargeDetail": "The Mermaid source exceeds LeanMark's 100 KB diagram limit.",
        "diagram.failedTitle": "Diagram could not be rendered",
        "diagram.failedDetail": "Check the Mermaid syntax in this fenced code block.",
        "diagram.unavailableTitle": "Diagrams are unavailable",
        "diagram.unavailableDetail": "LeanMark could not load its local Mermaid renderer.",
        "viewer.diagram": "Diagram",
        "viewer.zoomOutTitle": "Zoom out (−)",
        "viewer.zoomInTitle": "Zoom in (+)",
        "viewer.fit": "Fit",
        "viewer.fitTitle": "Fit to window (0)",
        "viewer.actualTitle": "Actual size (1)",
        "viewer.stageLabel": "Use the arrow keys to pan, plus and minus to zoom, and Escape to close.",
        "viewer.fitted": "Fit to window",
        "viewer.actual": "Actual size",
        "zoom.label": "Zoom",
        "zoom.in": "Zoom in",
        "zoom.out": "Zoom out",
        "zoom.reset": "Reset",
        "zoom.level": "Zoom {level}",
        "close.label": "Close",
        "close.escTitle": "Close (Esc)",
        "group.reader": "Reader",
        "group.settings": "Settings panel",
        "group.tabs": "Tabs",
        "group.find": "Find box",
        "group.tabStrip": "Tab strip",
        "group.figure": "Expanded figure",
        "group.menu": "Menu",
        "shortcut.find": "Find in the document",
        "shortcut.nextMatch": "Next match",
        "shortcut.previousMatch": "Previous match",
        "shortcut.reload": "Reload the document",
        "shortcut.theme": "Change the theme",
        "shortcut.width": "Change the text width",
        "shortcut.copy": "Copy the whole document",
        "shortcut.settings": "Settings and shortcuts",
        "shortcut.closeSettings": "Close the settings panel",
        "shortcut.nextTab": "Next tab",
        "shortcut.previousTab": "Previous tab",
        "shortcut.closeTab": "Close the tab",
        "shortcut.tabByPosition": "Go to a tab by position",
        "shortcut.lastTab": "Go to the last tab",
        "shortcut.clearSearch": "Clear the search",
        "shortcut.firstTab": "First tab",
        "shortcut.finalTab": "Last tab",
        "shortcut.closeFigure": "Close the figure",
        "shortcut.fitWindow": "Fit to the window",
        "shortcut.pan": "Pan, faster with Shift",
        "shortcut.moveControls": "Move between its controls",
        "key.rightArrow": "Right arrow",
        "key.leftArrow": "Left arrow",
        "key.arrows": "Arrow keys",
        "key.tabNumbers": "Ctrl+1 to Ctrl+8"
      },
      "zh-CN": {
        "app.currentDocument": "当前文档",
        "app.tagline": "轻量的 Markdown 阅读器",
        "app.couldNotOpen": "无法打开此文档",
        "toolbar.label": "阅读器工具栏",
        "find.label": "在文档中查找",
        "find.placeholder": "查找",
        "find.pressEnter": "按 Enter",
        "copy.button": "复制",
        "copy.copied": "已复制",
        "copy.documentTitle": "复制整个文档 (Ctrl+Shift+C)",
        "copy.documentKeys": "复制整个文档 ({keys})",
        "copy.documentMarkdownKeys": "以 Markdown 格式复制整个文档 ({keys})",
        "copy.section": "复制此章节",
        "copy.sectionMarkdown": "以 Markdown 格式复制此章节",
        "copy.sectionLabel": "复制章节：{text}",
        "copy.documentAsMarkdown": "已将文档复制为 Markdown。",
        "copy.sectionAsMarkdown": "已将章节复制为 Markdown。",
        "copy.documentAsText": "已将文档复制为纯文本。",
        "copy.sectionAsText": "已将章节复制为纯文本。",
        "copy.failed": "LeanMark 无法复制到剪贴板。",
        "settings.buttonLabel": "设置和键盘快捷键",
        "settings.buttonTitle": "设置和快捷键 (Ctrl+/)",
        "settings.buttonKeys": "设置和快捷键 ({keys})",
        "settings.title": "设置",
        "settings.close": "关闭设置",
        "settings.theme": "主题",
        "settings.textWidth": "文本宽度",
        "settings.language": "语言",
        "settings.shortcuts": "键盘快捷键",
        "language.system": "跟随系统",
        "theme.system": "跟随系统",
        "theme.light": "浅色",
        "theme.dark": "深色",
        "theme.dim": "暗淡",
        "theme.dusk": "暮色",
        "theme.systemShown": "跟随系统（{theme}）",
        "theme.buttonLabel": "主题：{theme}。按下可切换主题。",
        "theme.buttonTitle": "主题：{theme} ({keys})",
        "width.narrow": "窄",
        "width.wide": "宽",
        "width.full": "铺满",
        "width.fullWindow": "铺满窗口",
        "width.indicator": "文本宽度：{width}",
        "open.button": "打开",
        "open.markdownFile": "打开 Markdown 文件",
        "tabs.label": "已打开的文档",
        "tabs.close": "关闭 (Ctrl+W)",
        "tabs.closeName": "关闭 {name}",
        "progress.label": "阅读进度",
        "outline.label": "文档大纲",
        "outline.title": "本页内容",
        "state.emptyTitle": "无需打开编辑器即可阅读 Markdown。",
        "state.emptyMessage": "打开一个本地 Markdown 文件即可开始。图表只在这台电脑上渲染。",
        "state.emptyMessageShort": "打开一个本地 Markdown 文件即可开始。",
        "state.errorTitle": "无法打开此文档。",
        "state.errorMessage": "请检查文件后重试。",
        "doc.untitled": "未命名",
        "doc.watching": "{size} · 正在监视更改",
        "image.alt": "图片",
        "image.unavailable": "图片不可用：{alt}",
        "image.remoteBlocked": "已阻止远程图片：{alt}",
        "image.invalidPath": "图片路径无效：{alt}",
        "figure.expand": "展开",
        "figure.expandImage": "展开图片",
        "figure.expandDiagram": "展开图表",
        "table.scrollable": "可滚动的表格",
        "diagram.label": "Mermaid 图表",
        "diagram.limitTitle": "已达到图表数量上限",
        "diagram.limitDetail": "LeanMark 在一个文档中最多渲染 50 个图表。",
        "diagram.tooLargeTitle": "图表过大",
        "diagram.tooLargeDetail": "Mermaid 源代码超出了 LeanMark 的 100 KB 图表上限。",
        "diagram.failedTitle": "无法渲染图表",
        "diagram.failedDetail": "请检查此代码块中的 Mermaid 语法。",
        "diagram.unavailableTitle": "图表不可用",
        "diagram.unavailableDetail": "LeanMark 无法加载本地的 Mermaid 渲染器。",
        "viewer.diagram": "图表",
        "viewer.zoomOutTitle": "缩小 (−)",
        "viewer.zoomInTitle": "放大 (+)",
        "viewer.fit": "适应",
        "viewer.fitTitle": "适应窗口 (0)",
        "viewer.actualTitle": "实际大小 (1)",
        "viewer.stageLabel": "使用方向键平移，加号和减号缩放，Esc 键关闭。",
        "viewer.fitted": "适应窗口",
        "viewer.actual": "实际大小",
        "zoom.label": "缩放",
        "zoom.in": "放大",
        "zoom.out": "缩小",
        "zoom.reset": "重置",
        "zoom.level": "缩放 {level}",
        "close.label": "关闭",
        "close.escTitle": "关闭 (Esc)",
        "group.reader": "阅读器",
        "group.settings": "设置面板",
        "group.tabs": "标签页",
        "group.find": "查找框",
        "group.tabStrip": "标签栏",
        "group.figure": "放大查看",
        "group.menu": "菜单",
        "shortcut.find": "在文档中查找",
        "shortcut.nextMatch": "下一个匹配项",
        "shortcut.previousMatch": "上一个匹配项",
        "shortcut.reload": "重新加载文档",
        "shortcut.theme": "切换主题",
        "shortcut.width": "切换文本宽度",
        "shortcut.copy": "复制整个文档",
        "shortcut.settings": "设置和快捷键",
        "shortcut.closeSettings": "关闭设置面板",
        "shortcut.nextTab": "下一个标签页",
        "shortcut.previousTab": "上一个标签页",
        "shortcut.closeTab": "关闭标签页",
        "shortcut.tabByPosition": "按位置切换标签页",
        "shortcut.lastTab": "切换到最后一个标签页",
        "shortcut.clearSearch": "清除查找",
        "shortcut.firstTab": "第一个标签页",
        "shortcut.finalTab": "最后一个标签页",
        "shortcut.closeFigure": "关闭放大查看",
        "shortcut.fitWindow": "适应窗口",
        "shortcut.pan": "平移，按住 Shift 可加快",
        "shortcut.moveControls": "在各个控件之间移动",
        "key.rightArrow": "右方向键",
        "key.leftArrow": "左方向键",
        "key.arrows": "方向键",
        "key.tabNumbers": "Ctrl+1 至 Ctrl+8"
      }
    };

    // Status and error messages the hosts send in English, keyed by that
    // English. A message that starts with a key and a space is that sentence
    // followed by Windows' own error text, which Windows has already put in
    // the user's language.
    var hostMessages = {
      "zh-CN": {
        "LeanMark only reloads Markdown files.": "LeanMark 只会重新加载 Markdown 文件。",
        "LeanMark opens .md, .markdown, .mdown, and .mkd files.": "LeanMark 可以打开 .md、.markdown、.mdown 和 .mkd 文件。",
        "The file is still changing or cannot be read. Keeping the last complete view and trying again.": "文件仍在更改或无法读取。将保留上一次的完整内容并重试。",
        "Windows could not open the file picker.": "Windows 无法打开文件选择器。",
        "The file was moved or deleted. The last complete view is still shown.": "文件已被移动或删除。仍显示上一次的完整内容。",
        "Windows could not open that link.": "Windows 无法打开该链接。",
        "That local link is not a valid UTF-8 path.": "该本地链接不是有效的 UTF-8 路径。",
        "Absolute local links are blocked for safety.": "为安全起见，已阻止绝对路径的本地链接。",
        "LeanMark opens local Markdown links only. Images still display inside the document.": "LeanMark 只打开指向本地 Markdown 文件的链接。图片仍会显示在文档中。",
        "That linked Markdown file could not be found.": "找不到链接的 Markdown 文件。",
        "Open a document before copying.": "请先打开文档再复制。",
        "The file was moved or deleted, so there is nothing to copy.": "文件已被移动或删除，没有可复制的内容。",
        "The file changed on disk, so LeanMark reloaded it. Copy again to get the current text.": "文件已在磁盘上更改，LeanMark 已重新加载。请再次复制以获取最新内容。",
        "Windows could not open the clipboard. Try again in a moment.": "Windows 无法打开剪贴板。请稍后重试。",
        "Windows could not describe the error.": "Windows 无法描述此错误。",
        "LeanMark could not find this file.": "LeanMark 找不到此文件。",
        "That path is a folder, not a Markdown file.": "该路径是文件夹，不是 Markdown 文件。",
        "LeanMark can only read regular Markdown files.": "LeanMark 只能读取普通的 Markdown 文件。",
        "LeanMark could not read this file.": "LeanMark 无法读取此文件。",
        "LeanMark could not measure this file.": "LeanMark 无法获取此文件的大小。",
        "LeanMark could not finish reading this file.": "LeanMark 未能读完此文件。",
        "This file is larger than LeanMark's 32 MB safety limit. Open it in an editor if you need to inspect the raw text.": "此文件超过了 LeanMark 的 32 MB 安全上限。如需查看原始文本，请在编辑器中打开。",
        "This file is not valid UTF-8. Convert it to UTF-8, then open it again.": "此文件不是有效的 UTF-8 编码。请将其转换为 UTF-8 后再打开。",
        "This file is not valid UTF-8.": "此文件不是有效的 UTF-8 编码。",
        "LeanMark could not parse this Markdown document.": "LeanMark 无法解析此 Markdown 文档。",
        "That section is no longer in the file.": "文件中已没有该章节。",
        "That heading has no text to locate it by.": "该标题没有可用于定位的文字。",
        "The end of that section could not be located.": "无法找到该章节的结尾。"
      }
    };

    var languages = ["en", "zh-CN"];

    function normalizeSetting(setting) {
      return setting === "en" || setting === "zh-CN" ? setting : "system";
    }

    // The same rule as SystemInterfaceLanguage in src/core: Simplified
    // Chinese tags pick Chinese; Traditional Chinese keeps English for now.
    function systemLanguage(tag) {
      var lower = String(tag || "").split(/[.@]/)[0].replace(/_/g, "-").toLowerCase();
      if (lower !== "zh" && lower.indexOf("zh-") !== 0) {
        return "en";
      }
      var rest = "-" + lower.slice(2) + "-";
      if (rest.indexOf("-hant-") >= 0) {
        return "en";
      }
      if (rest.indexOf("-hans-") >= 0) {
        return "zh-CN";
      }
      if (/-(tw|hk|mo)-/.test(rest)) {
        return "en";
      }
      return "zh-CN";
    }

    function resolve(setting, systemTag) {
      var chosen = normalizeSetting(setting);
      return chosen === "system" ? systemLanguage(systemTag) : chosen;
    }

    function text(language, key, values) {
      var table = tables[language] || tables.en;
      var value = Object.prototype.hasOwnProperty.call(table, key)
        ? table[key]
        : Object.prototype.hasOwnProperty.call(tables.en, key) ? tables.en[key] : key;
      return values
        ? value.replace(/\{([a-zA-Z]+)\}/g, function (whole, name) {
          return Object.prototype.hasOwnProperty.call(values, name)
            ? String(values[name])
            : whole;
        })
        : value;
    }

    function hostText(language, message) {
      var table = hostMessages[language];
      message = String(message || "");
      if (!table) {
        return message;
      }
      if (Object.prototype.hasOwnProperty.call(table, message)) {
        return table[message];
      }
      for (var english in table) {
        if (Object.prototype.hasOwnProperty.call(table, english) &&
            message.indexOf(english + " ") === 0) {
          return table[english] + message.slice(english.length + 1);
        }
      }
      return message;
    }

    return {
      languages: languages,
      tables: tables,
      normalizeSetting: normalizeSetting,
      resolve: resolve,
      text: text,
      hostText: hostText
    };
  }());
  // END interface strings

  var webView2Bridge = window.chrome && window.chrome.webview;
  var webKitBridge = window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.leanmark;
  var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  var headingSelector = "h1, h2, h3, h4, h5, h6";
  var elements = {
    article: document.getElementById("article"),
    chrome: document.querySelector(".chrome"),
    copyButton: document.getElementById("copyButton"),
    fileName: document.getElementById("fileName"),
    languageGroup: document.getElementById("languageGroup"),
    fileMeta: document.getElementById("fileMeta"),
    findCount: document.getElementById("findCount"),
    findInput: document.getElementById("findInput"),
    liveStatus: document.getElementById("liveStatus"),
    mainContent: document.getElementById("mainContent"),
    openButton: document.getElementById("openButton"),
    outline: document.getElementById("outline"),
    outlineList: document.getElementById("outlineList"),
    progress: document.getElementById("readingProgress"),
    readerPane: document.getElementById("readerPane"),
    settingsButton: document.getElementById("settingsButton"),
    settingsClose: document.getElementById("settingsClose"),
    settingsPanel: document.getElementById("settingsPanel"),
    settingsZoomIn: document.getElementById("settingsZoomIn"),
    settingsZoomOut: document.getElementById("settingsZoomOut"),
    settingsZoomReset: document.getElementById("settingsZoomReset"),
    settingsZoomValue: document.getElementById("settingsZoomValue"),
    shortcutList: document.getElementById("shortcutList"),
    stateMessage: document.getElementById("stateMessage"),
    stateOpenButton: document.getElementById("stateOpenButton"),
    statePane: document.getElementById("statePane"),
    stateTitle: document.getElementById("stateTitle"),
    status: document.getElementById("statusToast"),
    tabStrip: document.getElementById("tabStrip"),
    themeButton: document.getElementById("themeButton"),
    themeLabel: document.getElementById("themeLabel"),
    themeSwatch: document.getElementById("themeSwatch"),
    viewer: document.getElementById("figureViewer"),
    viewerCanvas: document.getElementById("viewerCanvas"),
    viewerLevel: document.getElementById("viewerLevel"),
    viewerStage: document.getElementById("viewerStage"),
    viewerTitle: document.getElementById("viewerTitle"),
    zoomIndicator: document.getElementById("zoomIndicator")
  };

  var currentPath = "";
  var currentTheme = "system";
  var currentWidth = "narrow";
  // The document zoom as a fraction. The host owns the level and saves it;
  // its web view stays at 100% so the toolbar and tabs keep their size.
  var zoomLevel = 1;
  var supportsCssZoom = !!(window.CSS && CSS.supports && CSS.supports("zoom", "2"));
  // Shortcuts a host handles itself, such as menu items on macOS.
  var hostShortcuts = [];
  var hostIsMac = false;
  var settingsReturnFocus = null;
  var searchRanges = [];
  var currentSearchIndex = -1;
  var toastTimer = 0;
  var mermaidLoader = null;
  var diagramGeneration = 0;
  // The Mermaid colours the diagrams on the page were drawn with, so a theme
  // change that keeps them (System to Light on a light system, or the same
  // theme again) leaves the diagrams alone.
  var drawnDiagramLook = "";
  // Relative images resolve against the folder host the native side names for
  // the document on screen. With no valid host they show as unavailable.
  var documentAssetBase = "";
  // Hosts that can read the file answer copy requests with the exact Markdown
  // source. Other hosts fall back to the rendered text.
  var hostCopiesSource = false;
  var hostHasTabs = false;
  var tabs = [];
  var activeTabId = 0;
  var displayedTabId = 0;
  var focusTabAfterRender = false;
  var savedScroll = new Map();
  var copyRequests = new Map();
  var nextCopyRequest = 0;
  var renderedHeadingCount = 0;
  var progressFrame = 0;
  var settleTimer = 0;
  // "On this page": one entry per h2 and h3, in document order. The entry
  // for the section being read carries aria-current="location".
  var outlineEntries = [];
  var currentOutlineIndex = -1;
  // After a click in the outline: { index, scrollY }, scrollY null until the
  // link's own jump has happened.
  var pinnedOutline = null;
  // Set when the outline column appears, so its current entry is shown.
  var outlineNeedsReveal = false;
  // compact, regular, or wide, from the width left for the zoomed document.
  var currentLayout = "";
  var searchTimer = 0;
  var zoomIndicatorTimer = 0;
  var wheelZoomDelta = 0;
  var wheelZoomTime = 0;
  // Zoom steps for an expanded figure, as fractions of its natural size. Page
  // zoom uses the hosts' own ladder; these reach further because a diagram is
  // often far larger or smaller than the window.
  var viewerLevels = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
  var viewerPadding = 24;
  var viewerState = null;
  // The interface language, "en" or "zh-CN". The Windows host names it in the
  // page address so the first paint is already in it; other hosts leave it to
  // the browser's language. A host that saves a choice reports it with the
  // system language, which shows the Language group in the settings panel.
  var language = initialLanguage();
  var languageSetting = "system";
  var hostSystemLanguage = "";
  // What the state pane and the file line show, kept so a language change can
  // write them again.
  var stateView = { kind: "empty", message: "", fileName: "" };
  var documentView = { fileName: "", sourceBytes: 0 };

  function initialLanguage() {
    var requested = "";
    try {
      requested = new URLSearchParams(window.location.search).get("lang") || "";
    } catch (_error) {
      requested = "";
    }
    return interfaceStrings.languages.indexOf(requested) >= 0
      ? requested
      : interfaceStrings.resolve("system", navigator.language);
  }

  function t(key, values) {
    return interfaceStrings.text(language, key, values);
  }

  function systemLanguageTag() {
    return hostSystemLanguage || navigator.language || "";
  }

  function post(message) {
    if (webView2Bridge) {
      webView2Bridge.postMessage(message);
    } else if (webKitBridge) {
      webKitBridge.postMessage(message);
    }
  }

  function selectDocumentAssetBase(candidate) {
    if (!candidate) {
      return "";
    }
    try {
      var parsed = new URL(candidate);
      // Windows maps each open folder to https://d<N>.doc.leanmark.invalid/;
      // the WebKit hosts use their confined leanmark-doc: scheme.
      if ((parsed.protocol === "https:" &&
           /^d[1-9][0-9]{0,9}\.doc\.leanmark\.invalid$/.test(parsed.hostname) &&
           parsed.href === "https://" + parsed.hostname + "/") ||
          (parsed.protocol === "leanmark-doc:" &&
           parsed.hostname === "document")) {
        return parsed.href;
      }
    } catch (_error) {
      // A host-provided base still passes through this fail-closed allowlist.
    }
    return "";
  }

  // The theme button's order. Dim and Dusk are the softer dark themes.
  var themeCycle = ["system", "light", "dark", "dim", "dusk"];

  function effectiveDarkTheme() {
    return currentTheme === "dark" ||
      (currentTheme === "system" && systemTheme.matches);
  }

  // Dim and Dusk draw diagrams with their own tokens, so a diagram's boxes
  // and labels are as soft as the page around it. Mermaid's base theme needs
  // plain hex colours, which these tokens are.
  function diagramTheme() {
    if (currentTheme !== "dim" && currentTheme !== "dusk") {
      return { theme: effectiveDarkTheme() ? "dark" : "neutral" };
    }
    var style = getComputedStyle(document.documentElement);
    var token = function (name) {
      return style.getPropertyValue(name).trim();
    };
    return {
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: token("--canvas"),
        mainBkg: token("--surface-muted"),
        primaryColor: token("--surface-muted"),
        primaryTextColor: token("--text-primary"),
        primaryBorderColor: token("--text-disabled"),
        nodeBorder: token("--text-disabled"),
        secondaryColor: token("--surface"),
        tertiaryColor: token("--code-canvas"),
        lineColor: token("--text-secondary"),
        textColor: token("--text-primary"),
        titleColor: token("--text-primary"),
        clusterBkg: token("--surface"),
        clusterBorder: token("--border"),
        edgeLabelBackground: token("--canvas"),
        noteBkgColor: token("--surface"),
        noteTextColor: token("--text-primary"),
        noteBorderColor: token("--border")
      }
    };
  }

  // The theme whose colours are on screen: System shows Light or Dark.
  function shownTheme(theme) {
    return theme === "system" ? (systemTheme.matches ? "dark" : "light") : theme;
  }

  // "Dusk", or "System (Dark)" so the name never depends on colour alone.
  function themeDisplayName(theme) {
    return theme === "system"
      ? t("theme.systemShown", { theme: t("theme." + shownTheme(theme)) })
      : t("theme." + theme);
  }

  function applyTheme(theme, rerenderDiagrams) {
    currentTheme = themeCycle.indexOf(theme) > 0 ? theme : "system";
    if (currentTheme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", currentTheme);
    }
    // The dot has one fixed colour per theme (see .theme-swatch in the CSS).
    elements.themeLabel.textContent = t("theme." + currentTheme);
    elements.themeSwatch.dataset.swatch = currentTheme;
    var name = themeDisplayName(currentTheme);
    elements.themeButton.setAttribute(
      "aria-label", t("theme.buttonLabel", { theme: name }));
    elements.themeButton.title =
      t("theme.buttonTitle", { theme: name, keys: shortcutKeys("theme") });
    updateSettingsPanel();

    if (rerenderDiagrams && elements.article.querySelector(".diagram") &&
        JSON.stringify(diagramTheme()) !== drawnDiagramLook) {
      renderDiagrams();
    }
  }

  function cycleTheme() {
    chooseTheme(themeCycle[(themeCycle.indexOf(currentTheme) + 1) % themeCycle.length]);
  }

  function chooseTheme(theme) {
    applyTheme(theme, true);
    post("theme|" + currentTheme);
  }

  // Width of the reading column; the widths themselves are in reader.css.
  var widthCycle = ["narrow", "wide", "full"];

  function applyWidth(width) {
    var ratio = scrollRatio();
    currentWidth = widthCycle.indexOf(width) >= 0 ? width : "narrow";
    document.documentElement.dataset.width = currentWidth;
    updateLayout();
    scrollToRatio(ratio);
    updateSettingsPanel();
  }

  function chooseWidth(width) {
    applyWidth(width);
    post("width|" + currentWidth);
    showIndicator(t("width.indicator", { width: t("width." + currentWidth) }));
  }

  function cycleWidth() {
    chooseWidth(widthCycle[(widthCycle.indexOf(currentWidth) + 1) % widthCycle.length]);
  }

  // Zooms the document area only. CSS zoom keeps layout, find, the outline,
  // and anchors in step; engines without it get a scale transform.
  function applyZoom(percent) {
    var level = Number(percent) / 100;
    if (!Number.isFinite(level) || level < 0.25 || level > 5) {
      level = 1;
    }
    var ratio = scrollRatio();
    zoomLevel = level;
    var root = document.documentElement;
    root.style.setProperty("--reader-zoom", String(level));
    root.dataset.zoom = String(Math.round(level * 100));
    if (supportsCssZoom) {
      root.removeAttribute("data-zoom-fallback");
    } else {
      root.setAttribute("data-zoom-fallback", "");
    }
    updateLayout();
    scrollToRatio(ratio);
    updateSettingsPanel();
  }

  // The layout follows the width left for the document once it is zoomed and
  // the settings panel has taken its place, as the window width did when the
  // whole page was zoomed.
  function updateLayout() {
    var panelOpen = !!elements.settingsPanel && !elements.settingsPanel.hidden;
    var panelWidth = panelOpen ? elements.settingsPanel.getBoundingClientRect().width : 0;
    var available = (window.innerWidth - panelWidth) / zoomLevel;
    var layout = available >= 1180 ? "wide" : available <= 760 ? "compact" : "regular";
    var root = document.documentElement;
    // At 100% with the panel closed the window width decides, and the media
    // query in reader.css already gives the compact layout below 761 px. The
    // resize event comes after the browser has laid the page out at the new
    // size, so setting the attribute here for compact laid it out a second
    // time (0.6.0). Wide still needs the attribute: a media query for it
    // would restyle the whole page.
    if (zoomLevel === 1 && !panelOpen && layout !== "wide") {
      if (root.hasAttribute("data-layout")) {
        root.removeAttribute("data-layout");
      }
    } else if (root.dataset.layout !== layout) {
      root.dataset.layout = layout;
    }
    if (layout !== currentLayout) {
      currentLayout = layout;
      outlineNeedsReveal = layout === "wide";
    }
    // Headings move with the layout, so the current section may change.
    scheduleReadingProgress();
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 1024) {
      return String(bytes || 0) + " B";
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
    }
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function scrollRatio() {
    var available = document.documentElement.scrollHeight - window.innerHeight;
    return available > 0 ? window.scrollY / available : 0;
  }

  function scrollToRatio(ratio) {
    var available = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, available * ratio));
  }

  // Background tabs keep no DOM. Only their reading position survives, so
  // returning to a tab lands where the reader left it.
  function rememberScroll() {
    if (displayedTabId && !elements.readerPane.hidden) {
      savedScroll.set(displayedTabId, scrollRatio());
    }
  }

  function showReader() {
    elements.statePane.hidden = true;
    elements.readerPane.hidden = false;
    elements.copyButton.disabled = false;
  }

  // kind is "empty", "emptyShort" (tests), or "error" with the host's message.
  function renderStateText() {
    var error = stateView.kind === "error";
    elements.stateTitle.textContent = t(error ? "state.errorTitle" : "state.emptyTitle");
    elements.stateMessage.textContent = error
      ? (stateView.message
        ? interfaceStrings.hostText(language, stateView.message)
        : t("state.errorMessage"))
      : t(stateView.kind === "emptyShort" ? "state.emptyMessageShort" : "state.emptyMessage");
    elements.fileName.textContent = stateView.fileName || "LeanMark";
    elements.fileMeta.textContent = stateView.fileName
      ? t("app.couldNotOpen")
      : t("app.tagline");
  }

  function showState(kind, message, fileName) {
    rememberScroll();
    closeViewer(false);
    clearSearch();
    currentPath = "";
    displayedTabId = 0;
    elements.readerPane.hidden = true;
    elements.statePane.hidden = false;
    elements.copyButton.disabled = true;
    stateView = { kind: kind, message: message || "", fileName: fileName || "" };
    renderStateText();
    elements.progress.style.width = "0";
    elements.progress.setAttribute("aria-valuenow", "0");
    document.documentElement.dataset.renderState = "ready";
  }

  function blockedImageText(note) {
    return t(note.key, { alt: note.alt || t("image.alt") });
  }

  function replaceImageWithMessage(image, key, alt) {
    var replacement = document.createElement("span");
    replacement.className = "blocked-image";
    replacement.setAttribute("role", "note");
    replacement._leanmarkNote = { key: key, alt: alt };
    replacement.textContent = blockedImageText(replacement._leanmarkNote);
    image.replaceWith(replacement);
  }

  var expandIcon = "M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10";

  // The frame holds a figure and its expand button side by side, so the button
  // stays in the corner when a wide diagram scrolls inside its figure. The
  // button shows once the figure has something to expand (data-expandable).
  function createFigureFrame(content, kind) {
    var frame = document.createElement(kind === "image" ? "span" : "div");
    frame.className = "figure-frame figure-frame-" + kind;
    content.replaceWith(frame);
    frame.appendChild(content);

    var button = document.createElement("button");
    button.type = "button";
    button.className = "expand-figure";
    button.title = t("figure.expand");
    button.setAttribute(
      "aria-label",
      t(kind === "image" ? "figure.expandImage" : "figure.expandDiagram")
    );
    var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", expandIcon);
    icon.appendChild(path);
    button.appendChild(icon);
    frame.appendChild(button);
    return frame;
  }

  // Only an image that stands alone in its paragraph, optionally inside one
  // link, is treated as a figure. Inline images such as badges keep their
  // place in the line.
  function standaloneImageBlock(image) {
    var block = image;
    if (block.parentElement && block.parentElement.tagName === "A" &&
        block.parentElement.childNodes.length === 1) {
      block = block.parentElement;
    }
    var paragraph = block.parentElement;
    if (!paragraph || paragraph.tagName !== "P") {
      return null;
    }
    for (var node = paragraph.firstChild; node; node = node.nextSibling) {
      if (node !== block &&
          !(node.nodeType === Node.TEXT_NODE && !node.nodeValue.trim())) {
        return null;
      }
    }
    return block;
  }

  function makeImageExpandable(image) {
    var block = standaloneImageBlock(image);
    if (!block) {
      return;
    }
    var frame = createFigureFrame(block, "image");
    function ready() {
      // Icons and spacers are not worth a viewer.
      if (image.isConnected && image.naturalWidth >= 48 && image.naturalHeight >= 24) {
        frame.dataset.expandable = "";
      }
    }
    if (image.complete && image.naturalWidth) {
      ready();
    } else {
      image.addEventListener("load", ready, { once: true });
    }
  }

  function prepareImages() {
    elements.article.querySelectorAll("img").forEach(function (image) {
      var source = (image.getAttribute("src") || "").trim();
      var alt = image.getAttribute("alt") || "";
      if (!source) {
        replaceImageWithMessage(image, "image.unavailable", alt);
        return;
      }

      if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(source)) {
        makeImageExpandable(image);
        return;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.indexOf("//") === 0) {
        replaceImageWithMessage(image, "image.remoteBlocked", alt);
        return;
      }
      if (!documentAssetBase) {
        replaceImageWithMessage(image, "image.unavailable", alt);
        return;
      }

      try {
        var normalized = source.replace(/\\/g, "/");
        image.src = new URL(normalized, documentAssetBase).href;
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", function () {
          if (image.isConnected) {
            replaceImageWithMessage(image, "image.unavailable", alt);
          }
        }, { once: true });
        makeImageExpandable(image);
      } catch (_error) {
        replaceImageWithMessage(image, "image.invalidPath", alt);
      }
    });
  }

  function prepareLinks() {
    // Clicks are handled once on the article, not with a listener per link.
    elements.article.querySelectorAll("a[href]").forEach(function (link) {
      var href = (link.getAttribute("href") || "").trim();
      link.removeAttribute("target");
      link.removeAttribute("download");
      if (/^https?:/i.test(href)) {
        link.rel = "noopener noreferrer";
      }
    });
  }

  function linkTarget(event) {
    var link = event.target && event.target.closest
      ? event.target.closest("a[href]")
      : null;
    if (!link || !elements.article.contains(link)) {
      return "";
    }
    var href = (link.getAttribute("href") || "").trim();
    return href && href.charAt(0) !== "#" ? href : "";
  }

  function handleArticleClick(event) {
    var expand = event.target && event.target.closest
      ? event.target.closest(".expand-figure")
      : null;
    if (expand && elements.article.contains(expand)) {
      event.preventDefault();
      openViewer(expand.parentElement);
      return;
    }
    var copy = event.target && event.target.closest
      ? event.target.closest(".copy-section")
      : null;
    if (copy && elements.article.contains(copy)) {
      event.preventDefault();
      copySection(Number(copy.dataset.heading), copy);
      return;
    }
    var href = linkTarget(event);
    if (!href) {
      return;
    }
    event.preventDefault();
    var newTab = hostHasTabs && (event.ctrlKey || event.metaKey);
    post((newTab ? "open-link-tab|" : "open-link|") + href);
  }

  function handleArticleAuxClick(event) {
    var href = hostHasTabs && event.button === 1 ? linkTarget(event) : "";
    if (href) {
      event.preventDefault();
      post("open-link-tab|" + href);
    }
  }

  function wrapTables() {
    elements.article.querySelectorAll("table").forEach(function (table) {
      if (table.parentElement &&
          table.parentElement.classList.contains("table-scroll")) {
        return;
      }
      var wrapper = document.createElement("div");
      wrapper.className = "table-scroll";
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", t("table.scrollable"));
      wrapper.tabIndex = 0;
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });
  }

  // lastSuffix holds, per heading text, the suffix last tried for it. Every
  // id up to that one is taken, so the next copy starts there instead of at
  // -2 again: n copies of one heading cost n lookups, not n squared. The ids
  // are the same as before.
  function slugifyHeading(text, usedSlugs, lastSuffix) {
    var base = text
      .toLocaleLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";
    var slug = base;
    var suffix = lastSuffix.get(base) || 1;
    while (usedSlugs.has(slug)) {
      suffix += 1;
      slug = base + "-" + suffix;
    }
    lastSuffix.set(base, suffix);
    usedSlugs.add(slug);
    return slug;
  }

  // One pass over the headings gives each an id, builds the outline from the
  // second and third levels, and adds the copy buttons. The icon is drawn in
  // CSS, so a button adds no text: outline labels, anchors, and search all see
  // the heading unchanged.
  function prepareHeadings() {
    var usedSlugs = new Set();
    var lastSuffix = new Map();
    var headings = elements.article.querySelectorAll(headingSelector);
    var copyTitle = t(hostCopiesSource ? "copy.sectionMarkdown" : "copy.section");
    var outline = document.createDocumentFragment();
    outlineEntries = [];
    currentOutlineIndex = -1;
    releaseOutlinePin();
    renderedHeadingCount = headings.length;

    headings.forEach(function (heading, index) {
      var text = heading.textContent || "";
      heading.id = slugifyHeading(text, usedSlugs, lastSuffix);
      if (heading.tagName === "H2" || heading.tagName === "H3") {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#" + heading.id;
        link.dataset.level = heading.tagName.slice(1);
        link.dataset.index = String(outlineEntries.length);
        link.textContent = text;
        item.appendChild(link);
        outline.appendChild(item);
        outlineEntries.push({ link: link, heading: heading });
      }
      text = text.trim();
      if (text) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "copy-section";
        button.dataset.heading = String(index);
        button.title = copyTitle;
        button.setAttribute("aria-label", t("copy.sectionLabel", { text: text }));
        heading.appendChild(button);
      }
    });

    // The wide layout has side columns only for a document with an outline;
    // without one the text keeps the single column (reader.css).
    if (outlineEntries.length < 2) {
      outlineEntries = [];
      elements.outlineList.replaceChildren();
      elements.outline.hidden = true;
      elements.readerPane.removeAttribute("data-outline");
      return;
    }
    elements.outlineList.replaceChildren(outline);
    elements.outline.hidden = false;
    elements.readerPane.setAttribute("data-outline", "");
  }

  function prepareDiagrams() {
    var blocks = Array.from(
      elements.article.querySelectorAll("pre > code.language-mermaid")
    );
    blocks.forEach(function (code, index) {
      var pre = code.parentElement;
      var figure = document.createElement("figure");
      figure.className = "diagram";
      figure.setAttribute("aria-label", t("diagram.label"));
      if (index >= 50) {
        // No source is kept, so renderDiagrams leaves this message in place.
        renderDiagramError(figure, "diagram.limitTitle", "diagram.limitDetail");
      } else {
        figure._leanmarkSource = code.textContent || "";
      }
      pre.replaceWith(figure);
      createFigureFrame(figure, "diagram");
    });
  }

  function setExpandable(figure, expandable) {
    var frame = figure.parentElement;
    if (frame && frame.classList.contains("figure-frame")) {
      if (expandable) {
        frame.dataset.expandable = "";
      } else {
        frame.removeAttribute("data-expandable");
      }
    }
  }

  function loadMermaid() {
    if (window.mermaid) {
      return Promise.resolve(window.mermaid);
    }
    if (mermaidLoader) {
      return mermaidLoader;
    }

    mermaidLoader = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "/vendor/mermaid.min.js";
      script.addEventListener("load", function () {
        if (window.mermaid) {
          resolve(window.mermaid);
        } else {
          reject(new Error("Mermaid did not initialize."));
        }
      }, { once: true });
      script.addEventListener("error", function () {
        reject(new Error("The local Mermaid bundle could not be loaded."));
      }, { once: true });
      document.head.appendChild(script);
    });
    return mermaidLoader;
  }

  var katexLoader = null;

  // KaTeX is only fetched when the document has math, like Mermaid.
  function loadKatex() {
    if (window.katex) {
      return Promise.resolve(window.katex);
    }
    if (katexLoader) {
      return katexLoader;
    }
    katexLoader = new Promise(function (resolve, reject) {
      var style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = "/vendor/katex/katex.min.css";
      document.head.appendChild(style);
      var script = document.createElement("script");
      script.src = "/vendor/katex/katex.min.js";
      script.addEventListener("load", function () {
        if (window.katex) {
          resolve(window.katex);
        } else {
          reject(new Error("KaTeX did not initialize."));
        }
      }, { once: true });
      script.addEventListener("error", function () {
        reject(new Error("The local KaTeX bundle could not be loaded."));
      }, { once: true });
      document.head.appendChild(script);
    });
    return katexLoader;
  }

  async function renderMath() {
    var equations = Array.from(elements.article.querySelectorAll("x-equation"));
    if (!equations.length) {
      return;
    }
    document.documentElement.dataset.mathState = "loading";
    try {
      var katex = await loadKatex();
      equations.forEach(function (equation) {
        var source = equation.textContent || "";
        // A formula KaTeX cannot read keeps its source, in the theme's
        // danger colour, and the rest of the page still renders.
        katex.render(source, equation, {
          displayMode: equation.getAttribute("type") === "display",
          throwOnError: false,
          errorColor: "var(--danger-500)",
          trust: false,
          maxExpand: 1000
        });
      });
      document.documentElement.dataset.mathState = "ready";
    } catch (error) {
      // The raw TeX stays readable when the bundle cannot load.
      document.documentElement.dataset.mathState = "failed";
    }
  }

  // The keys stay on the figure so a language change can write it again.
  function renderDiagramError(figure, titleKey, detailKey) {
    setExpandable(figure, false);
    figure.className = "diagram diagram-error";
    figure.replaceChildren();
    figure._leanmarkError = [titleKey, detailKey];
    var heading = document.createElement("strong");
    heading.textContent = t(titleKey);
    var message = document.createElement("span");
    message.textContent = t(detailKey);
    figure.append(heading, message);
  }

  async function renderDiagrams() {
    var figures = Array.from(elements.article.querySelectorAll(".diagram"))
      .filter(function (figure) {
        return typeof figure._leanmarkSource === "string";
      });
    var generation = ++diagramGeneration;
    closeViewer(false);
    if (!figures.length) {
      document.documentElement.dataset.renderState = "ready";
      return;
    }

    document.documentElement.dataset.renderState = "diagrams";
    try {
      var mermaid = await loadMermaid();
      if (generation !== diagramGeneration) {
        return;
      }
      var diagramLook = diagramTheme();
      drawnDiagramLook = JSON.stringify(diagramLook);
      var diagramConfig = {
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: diagramLook.theme,
        fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
      };
      if (diagramLook.themeVariables) {
        diagramConfig.themeVariables = diagramLook.themeVariables;
      }
      mermaid.initialize(diagramConfig);

      for (var index = 0; index < figures.length; index += 1) {
        var figure = figures[index];
        var source = figure._leanmarkSource;
        if (source.length > 100000) {
          renderDiagramError(figure, "diagram.tooLargeTitle", "diagram.tooLargeDetail");
          continue;
        }
        try {
          var rendered = await mermaid.render(
            "leanmark-diagram-" + generation + "-" + index,
            source
          );
          if (generation !== diagramGeneration || !figure.isConnected) {
            return;
          }
          figure.className = "diagram";
          figure._leanmarkError = null;
          figure.innerHTML = rendered.svg;
          var svg = figure.querySelector("svg");
          if (svg) {
            svg.setAttribute("role", "img");
            svg.setAttribute("aria-label", t("diagram.label"));
            svg.removeAttribute("height");
            setExpandable(figure, true);
          }
          if (typeof rendered.bindFunctions === "function") {
            rendered.bindFunctions(figure);
          }
        } catch (_diagramError) {
          renderDiagramError(figure, "diagram.failedTitle", "diagram.failedDetail");
        }
      }
    } catch (_loadError) {
      figures.forEach(function (figure) {
        renderDiagramError(figure, "diagram.unavailableTitle", "diagram.unavailableDetail");
      });
    }
    if (generation === diagramGeneration) {
      document.documentElement.dataset.renderState = "ready";
    }
  }

  function renderDocument(data) {
    var tabId = Number(data.tabId) || 0;
    var sameDocument = !!currentPath && currentPath === data.path &&
      tabId === displayedTabId;
    var keepPosition = sameDocument;
    var ratio = sameDocument ? scrollRatio() : 0;
    if (tabId !== displayedTabId) {
      rememberScroll();
      if (savedScroll.has(tabId)) {
        ratio = savedScroll.get(tabId);
        savedScroll.delete(tabId);
        keepPosition = true;
      }
    }
    // A followed link replaces the document in the same tab: start at the top.

    closeViewer(false);
    clearSearch();
    diagramGeneration += 1;
    drawnDiagramLook = "";
    displayedTabId = tabId;
    currentPath = data.path || "";
    documentAssetBase = selectDocumentAssetBase(data.documentBaseUrl);
    applyTheme(data.theme || currentTheme, false);
    documentView = { fileName: data.fileName || "", sourceBytes: data.sourceBytes };
    renderDocumentLine();
    elements.fileName.title = data.path || "";
    elements.article.innerHTML = data.html || "";

    prepareImages();
    prepareLinks();
    wrapTables();
    prepareHeadings();
    prepareDiagrams();
    renderMath();
    showReader();
    document.documentElement.dataset.renderState =
      data.hasMermaid ? "diagrams" : "ready";

    requestAnimationFrame(function () {
      if (keepPosition) {
        scrollToRatio(ratio);
      } else {
        window.scrollTo(0, 0);
      }
      updateReadingProgress();
      updateOutlineCurrent();
    });

    if (data.hasMermaid) {
      renderDiagrams().then(function () {
        if (keepPosition) {
          scrollToRatio(ratio);
        }
        updateReadingProgress();
        updateOutlineCurrent();
      });
    }
  }

  // Rendered-text copy for hosts that cannot read the source file. It follows
  // the same rule as the native copy: the heading through the next heading of
  // the same or a higher level.
  function renderedSectionText(index) {
    if (index < 0) {
      return elements.article.innerText.trim();
    }
    var heading = elements.article.querySelectorAll(headingSelector)[index];
    if (!heading) {
      return "";
    }
    var level = Number(heading.tagName.charAt(1));
    var parts = [heading.innerText];
    for (var node = heading.nextElementSibling; node; node = node.nextElementSibling) {
      if (/^H[1-6]$/.test(node.tagName) && Number(node.tagName.charAt(1)) <= level) {
        break;
      }
      parts.push(node.innerText);
    }
    return parts.join("\n\n").trim();
  }

  function copyWithCommand(text) {
    var copied = false;
    function fill(event) {
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
      copied = true;
    }
    document.addEventListener("copy", fill);
    try {
      document.execCommand("copy");
    } finally {
      document.removeEventListener("copy", fill);
    }
    return copied ? Promise.resolve() : Promise.reject(new Error("Copy failed."));
  }

  function writeClipboardText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyWithCommand(text);
      });
    }
    return copyWithCommand(text);
  }

  function announce(message) {
    elements.liveStatus.textContent = "";
    window.setTimeout(function () {
      elements.liveStatus.textContent = message;
    }, 30);
  }

  function confirmCopy(button, index) {
    var what = index < 0 ? "copy.document" : "copy.section";
    announce(t(what + (hostCopiesSource ? "AsMarkdown" : "AsText")));
    if (!button || !button.isConnected) {
      return;
    }
    button.dataset.copied = "true";
    if (button === elements.copyButton) {
      button.textContent = t("copy.copied");
    }
    window.setTimeout(function () {
      button.removeAttribute("data-copied");
      if (button === elements.copyButton) {
        button.textContent = t("copy.button");
      }
    }, 1500);
  }

  function copySection(index, button) {
    if (elements.readerPane.hidden || !Number.isInteger(index)) {
      return;
    }
    if (hostCopiesSource) {
      nextCopyRequest += 1;
      copyRequests.set(nextCopyRequest, { button: button, index: index });
      post("copy-source|" + nextCopyRequest + "|" + displayedTabId + "|" +
        index + "|" + renderedHeadingCount);
      return;
    }
    writeClipboardText(renderedSectionText(index)).then(function () {
      confirmCopy(button, index);
    }, function () {
      showStatus(t("copy.failed"), "error");
    });
  }

  function tabLabel(tab, duplicateNames) {
    if (!duplicateNames.has(tab.name.toLocaleLowerCase())) {
      return tab.name;
    }
    // Several README.md tabs are told apart by their folder name.
    var parts = tab.path.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? tab.name + " · " + parts[parts.length - 2] : tab.name;
  }

  function renderTabs() {
    var visible = tabs.length > 1;
    elements.tabStrip.hidden = !visible;
    if (visible) {
      document.documentElement.setAttribute("data-tabs", "");
    } else {
      document.documentElement.removeAttribute("data-tabs");
    }

    var seen = new Set();
    var duplicates = new Set();
    tabs.forEach(function (tab) {
      var key = tab.name.toLocaleLowerCase();
      if (seen.has(key)) {
        duplicates.add(key);
      }
      seen.add(key);
    });

    var fragment = document.createDocumentFragment();
    tabs.forEach(function (tab) {
      var selected = tab.id === activeTabId;
      var item = document.createElement("div");
      item.className = "tab";
      item.setAttribute("role", "tab");
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.setAttribute("aria-controls", "readerPane");
      item.tabIndex = selected ? 0 : -1;
      item.dataset.tabId = String(tab.id);
      item.title = tab.path;
      var label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tabLabel(tab, duplicates);
      var close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.tabIndex = -1;
      close.title = t("tabs.close");
      close.setAttribute("aria-label", t("tabs.closeName", { name: tab.name }));
      item.append(label, close);
      fragment.appendChild(item);
    });
    elements.tabStrip.replaceChildren(fragment);

    var current = elements.tabStrip.querySelector('[aria-selected="true"]');
    if (visible && current) {
      current.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (focusTabAfterRender) {
        current.focus();
      }
    }
    focusTabAfterRender = false;
  }

  function receiveTabs(data) {
    var nextActive = Number(data.active) || 0;
    if (nextActive !== activeTabId) {
      rememberScroll();
    }
    tabs = (Array.isArray(data.tabs) ? data.tabs.slice(0, 1000) : [])
      .map(function (tab) {
        return {
          id: Number(tab && tab.id) || 0,
          name: String((tab && tab.name) || "Untitled"),
          path: String((tab && tab.path) || "")
        };
      })
      .filter(function (tab) {
        return tab.id > 0;
      });
    activeTabId = nextActive;
    var openIds = new Set(tabs.map(function (tab) { return tab.id; }));
    savedScroll.forEach(function (_ratio, id) {
      if (!openIds.has(id)) {
        savedScroll.delete(id);
      }
    });
    renderTabs();
  }

  function tabIdFrom(target) {
    var tab = target && target.closest ? target.closest(".tab") : null;
    return tab ? Number(tab.dataset.tabId) || 0 : 0;
  }

  function selectTab(id, moveFocus) {
    if (!id || id === activeTabId) {
      return;
    }
    focusTabAfterRender = !!moveFocus;
    post("tab-activate|" + id);
  }

  function closeTab(id) {
    if (id) {
      post("tab-close|" + id);
    }
  }

  function cycleTab(direction) {
    if (tabs.length < 2) {
      return;
    }
    var index = tabs.findIndex(function (tab) {
      return tab.id === activeTabId;
    });
    var next = (Math.max(0, index) + direction + tabs.length) % tabs.length;
    selectTab(tabs[next].id, false);
  }

  function clearSearch() {
    if (window.CSS && CSS.highlights) {
      CSS.highlights.delete("leanmark-find");
      CSS.highlights.delete("leanmark-find-current");
    }
    searchRanges = [];
    currentSearchIndex = -1;
    elements.findCount.textContent = "";
  }

  function updateSearch() {
    clearSearch();
    var query = elements.findInput.value.trim().toLocaleLowerCase();
    if (!query || elements.readerPane.hidden) {
      return;
    }
    if (!window.Highlight || !CSS.highlights) {
      elements.findCount.textContent = t("find.pressEnter");
      return;
    }

    var walker = document.createTreeWalker(
      elements.article,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          var parent = node.parentElement;
          if (!parent || !node.nodeValue.trim() ||
              parent.closest("svg, script, style, .diagram, .katex-mathml")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    var node;
    while ((node = walker.nextNode()) && searchRanges.length < 2000) {
      var haystack = node.nodeValue.toLocaleLowerCase();
      var start = 0;
      while ((start = haystack.indexOf(query, start)) !== -1 &&
             searchRanges.length < 2000) {
        var range = new Range();
        range.setStart(node, start);
        range.setEnd(node, start + query.length);
        searchRanges.push(range);
        start += Math.max(1, query.length);
      }
    }

    var allMatches = new Highlight();
    searchRanges.forEach(function (range) {
      allMatches.add(range);
    });
    CSS.highlights.set("leanmark-find", allMatches);
    if (searchRanges.length) {
      selectSearchResult(0);
    } else {
      elements.findCount.textContent = "0";
    }
  }

  function selectSearchResult(index) {
    if (!searchRanges.length) {
      return;
    }
    currentSearchIndex =
      (index + searchRanges.length) % searchRanges.length;
    var range = searchRanges[currentSearchIndex];
    var current = new Highlight();
    current.add(range);
    CSS.highlights.set("leanmark-find-current", current);
    elements.findCount.textContent =
      String(currentSearchIndex + 1) + "/" + String(searchRanges.length);
    var target = range.startContainer.parentElement;
    if (target) {
      target.scrollIntoView({ block: "center" });
    }
  }

  function moveSearch(direction) {
    if (searchTimer) {
      window.clearTimeout(searchTimer);
      searchTimer = 0;
      updateSearch();
      // The new search already selected its first match.
      if (searchRanges.length && direction > 0) {
        return;
      }
    }
    if (!elements.findInput.value.trim()) {
      elements.findInput.focus();
      return;
    }
    if (!searchRanges.length) {
      if (!window.Highlight || !CSS.highlights) {
        window.find(
          elements.findInput.value,
          false,
          direction < 0,
          true,
          false,
          false,
          false
        );
      }
      return;
    }
    selectSearchResult(currentSearchIndex + direction);
  }

  function showStatus(message, tone) {
    window.clearTimeout(toastTimer);
    elements.status.textContent = message;
    elements.status.dataset.tone = tone || "info";
    elements.status.hidden = false;
    toastTimer = window.setTimeout(function () {
      elements.status.hidden = true;
    }, tone === "warning" || tone === "error" ? 8000 : 5000);
  }

  function updateReadingProgress() {
    var available = document.documentElement.scrollHeight - window.innerHeight;
    var percent = available <= 0
      ? 100
      : Math.max(0, Math.min(100, window.scrollY / available * 100));
    elements.progress.style.width = percent.toFixed(2) + "%";
    elements.progress.setAttribute("aria-valuenow", String(Math.round(percent)));
  }

  // The current section, as in LeanDoc's outline: the last heading at or
  // above the reading line, a quarter of the way down the page below the
  // toolbar (at least 48 px), or the first entry at the top of the page.
  // Headings are in document order, so a binary search finds it.
  function updateOutlineCurrent() {
    if (!outlineEntries.length || elements.readerPane.hidden) {
      return;
    }
    if (pinnedOutline) {
      if (pinnedOutline.scrollY === null ||
          Math.abs(window.scrollY - pinnedOutline.scrollY) <= window.innerHeight / 2) {
        return;
      }
      releaseOutlinePin();
    }
    var toolbar = elements.chrome.getBoundingClientRect().bottom;
    var line = toolbar + Math.max(48, (window.innerHeight - toolbar) * 0.25);
    var low = 0;
    var high = outlineEntries.length - 1;
    var found = 0;
    while (low <= high) {
      var middle = (low + high) >> 1;
      if (outlineEntries[middle].heading.getBoundingClientRect().top <= line) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    setOutlineCurrent(window.scrollY <= 1 ? 0 : found);
  }

  function setOutlineCurrent(index) {
    var entry = outlineEntries[index];
    if (index !== currentOutlineIndex) {
      var previous = outlineEntries[currentOutlineIndex];
      if (previous) {
        previous.link.removeAttribute("aria-current");
      }
      currentOutlineIndex = index;
      if (entry) {
        entry.link.setAttribute("aria-current", "location");
        keepOutlineEntryInView(entry.link);
      }
    } else if (entry && outlineNeedsReveal) {
      keepOutlineEntryInView(entry.link);
    }
    outlineNeedsReveal = false;
  }

  // An outline taller than its column scrolls on its own. When the current
  // entry is outside its visible part, scroll it a third of the way down;
  // otherwise leave the outline where the reader put it. Rectangles are on
  // screen, scrollTop is in the outline's own pixels, and the two differ by
  // the document zoom, so the outline's own size converts between them.
  function keepOutlineEntryInView(link) {
    var outline = elements.outline;
    if (outline.hidden || outline.scrollHeight <= outline.clientHeight) {
      return;
    }
    var box = outline.getBoundingClientRect();
    var scale = box.height / outline.clientHeight || 1;
    var rect = link.getBoundingClientRect();
    var top = (rect.top - box.top) / scale;
    var bottom = (rect.bottom - box.top) / scale;
    if (top < 0 || bottom > outline.clientHeight) {
      outline.scrollTop = Math.max(0, outline.scrollTop + top - outline.clientHeight / 3);
    }
  }

  // A clicked entry stays current, even when its heading is too near the end
  // to reach the reading line, until the page moves more than half a window
  // or the reader uses the wheel, touch, a pointer, or a key.
  var unpinEvents = ["wheel", "touchstart", "pointerdown", "keydown"];

  function pinOutline(index) {
    releaseOutlinePin();
    setOutlineCurrent(index);
    pinnedOutline = { index: index, scrollY: null };
    unpinEvents.forEach(function (type) {
      window.addEventListener(type, releaseOutlinePin, { capture: true, passive: true });
    });
    // The link's jump to its heading runs after this click handler.
    requestAnimationFrame(function () {
      if (pinnedOutline && pinnedOutline.scrollY === null) {
        pinnedOutline.scrollY = window.scrollY;
      }
    });
  }

  function releaseOutlinePin() {
    if (!pinnedOutline) {
      return;
    }
    pinnedOutline = null;
    unpinEvents.forEach(function (type) {
      window.removeEventListener(type, releaseOutlinePin, { capture: true, passive: true });
    });
    scheduleReadingProgress();
  }

  function showIndicator(text) {
    window.clearTimeout(zoomIndicatorTimer);
    elements.zoomIndicator.textContent = text;
    elements.zoomIndicator.hidden = false;
    announce(text);
    zoomIndicatorTimer = window.setTimeout(function () {
      elements.zoomIndicator.hidden = true;
    }, 1200);
  }

  function showZoomLevel(percent) {
    if (!Number.isFinite(percent) || percent <= 0) {
      return;
    }
    showIndicator(t("zoom.level", { level: String(Math.round(percent)) + "%" }));
  }

  function zoomPage(action) {
    post("zoom|" + action);
  }

  // Ctrl+wheel and trackpad pinch in the viewer arrive as many small wheel
  // events. Collect them so one notch or a short pinch moves one zoom step.
  // The page itself has no wheel listener: a blocking one would make every
  // scroll wait for the main thread.
  function wheelZoomDirection(event) {
    var now = event.timeStamp || Date.now();
    if (now - wheelZoomTime > 300) {
      wheelZoomDelta = 0;
    }
    wheelZoomTime = now;
    var scale = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    wheelZoomDelta += event.deltaY * scale;
    if (Math.abs(wheelZoomDelta) < 50) {
      return 0;
    }
    var direction = wheelZoomDelta < 0 ? 1 : -1;
    wheelZoomDelta = 0;
    return direction;
  }

  function figureNaturalSize(content) {
    var rect = content.getBoundingClientRect();
    var width = 0;
    var height = 0;
    if (content.tagName === "IMG") {
      width = content.naturalWidth;
      height = content.naturalHeight;
    } else if (content.viewBox && content.viewBox.baseVal) {
      width = content.viewBox.baseVal.width;
      height = content.viewBox.baseVal.height;
    }
    if (!(width > 0 && height > 0)) {
      width = rect.width;
      height = rect.height;
    }
    return { width: Math.max(1, width), height: Math.max(1, height), rect: rect };
  }

  function viewerFitScale() {
    var state = viewerState;
    // offsetWidth and offsetHeight include any scrollbars, which a zoomed
    // figure shows and a fitted one does not.
    var availableWidth = elements.viewerStage.offsetWidth - viewerPadding * 2;
    var availableHeight = elements.viewerStage.offsetHeight - viewerPadding * 2;
    var fit = Math.min(
      availableWidth / state.width,
      availableHeight / state.height
    );
    // Vector figures stay sharp when enlarged; photos and screenshots are not
    // blown up past their own pixels unless the reader zooms in on purpose.
    fit = Math.min(fit, state.vector ? 4 : 1);
    return Math.max(viewerLevels[0], fit);
  }

  function setViewerScale(scale, mode, focusX, focusY) {
    var state = viewerState;
    if (!state) {
      return;
    }
    var stage = elements.viewerStage;
    scale = Math.min(viewerLevels[viewerLevels.length - 1],
      Math.max(viewerLevels[0], scale));
    if (focusX === undefined) {
      focusX = stage.clientWidth / 2;
      focusY = stage.clientHeight / 2;
    }
    // Keep the point under the pointer (or the middle of the view) in place.
    var canvas = elements.viewerCanvas;
    var pointX = (stage.scrollLeft + focusX - canvas.offsetLeft - viewerPadding) /
      state.scale;
    var pointY = (stage.scrollTop + focusY - canvas.offsetTop - viewerPadding) /
      state.scale;

    state.scale = scale;
    state.mode = mode;
    // The canvas is a plain block sized here, and the figure fills it, so the
    // scrollable area never depends on how an engine sizes an outer <svg>.
    canvas.style.width = state.width * scale + viewerPadding * 2 + "px";
    canvas.style.height = state.height * scale + viewerPadding * 2 + "px";
    stage.scrollLeft = pointX * scale + canvas.offsetLeft + viewerPadding - focusX;
    stage.scrollTop = pointY * scale + canvas.offsetTop + viewerPadding - focusY;

    elements.viewerLevel.textContent = String(Math.round(scale * 100)) + "%";
    elements.viewer.dataset.mode = mode;
  }

  function stepViewerZoom(direction, focusX, focusY) {
    var state = viewerState;
    if (!state) {
      return;
    }
    var next = state.scale;
    if (direction > 0) {
      next = viewerLevels.find(function (level) {
        return level > state.scale + 0.001;
      }) || viewerLevels[viewerLevels.length - 1];
    } else {
      for (var index = viewerLevels.length - 1; index >= 0; index -= 1) {
        if (viewerLevels[index] < state.scale - 0.001) {
          next = viewerLevels[index];
          break;
        }
      }
    }
    setViewerScale(next, "zoom", focusX, focusY);
    announce(t("zoom.level", { level: elements.viewerLevel.textContent }));
  }

  function viewerAction(action, focusX, focusY) {
    if (action === "in") {
      stepViewerZoom(1, focusX, focusY);
    } else if (action === "out") {
      stepViewerZoom(-1, focusX, focusY);
    } else if (action === "fit" || action === "reset") {
      setViewerScale(viewerFitScale(), "fit");
      announce(t("viewer.fitted"));
    } else if (action === "actual") {
      setViewerScale(1, "actual", focusX, focusY);
      announce(t("viewer.actual"));
    } else if (action === "close") {
      closeViewer(true);
    }
  }

  // The figure itself moves into the viewer and back, rather than a copy: a
  // large diagram is not duplicated, and Mermaid's ids and styles stay unique.
  function openViewer(frame) {
    var content = frame.querySelector(".diagram > svg") ||
      frame.querySelector("img");
    if (!content || viewerState) {
      return;
    }
    var size = figureNaturalSize(content);
    var placeholder = document.createElement("span");
    placeholder.className = "viewer-placeholder";
    placeholder.style.width = size.rect.width + "px";
    placeholder.style.height = size.rect.height + "px";
    var isImage = content.tagName === "IMG";

    viewerState = {
      content: content,
      placeholder: placeholder,
      returnFocus: frame.querySelector(".expand-figure"),
      savedStyle: content.getAttribute("style"),
      width: size.width,
      height: size.height,
      vector: !isImage || /\.svg(?:[?#]|$)/i.test(content.getAttribute("src") || ""),
      scale: 1,
      mode: "fit",
      drag: null
    };
    content.replaceWith(placeholder);
    elements.viewerCanvas.style.padding = viewerPadding + "px";
    elements.viewerCanvas.appendChild(content);
    // The figure fills the canvas that setViewerScale sizes. The saved style
    // attribute is put back on close.
    content.style.maxWidth = "none";
    content.style.maxHeight = "none";
    content.style.width = "100%";
    content.style.height = "100%";
    content.style.margin = "0";
    elements.viewerTitle.textContent = isImage
      ? (content.getAttribute("alt") || t("image.alt"))
      : t("viewer.diagram");
    elements.viewer.hidden = false;
    setViewerScale(viewerFitScale(), "fit");
    elements.viewerStage.focus({ preventScroll: true });
  }

  function closeViewer(restoreFocus) {
    var state = viewerState;
    if (!state) {
      return;
    }
    viewerState = null;
    elements.viewerCanvas.style.width = "";
    elements.viewerCanvas.style.height = "";
    var content = state.content;
    if (state.savedStyle === null) {
      content.removeAttribute("style");
    } else {
      content.setAttribute("style", state.savedStyle);
    }
    if (state.placeholder.isConnected) {
      state.placeholder.replaceWith(content);
    } else {
      content.remove();
    }
    elements.viewer.hidden = true;
    if (restoreFocus && state.returnFocus && state.returnFocus.isConnected) {
      state.returnFocus.focus({ preventScroll: true });
    }
  }

  function viewerFocusables() {
    return Array.from(elements.viewer.querySelectorAll("button"))
      .concat([elements.viewerStage]);
  }

  function panViewer(event) {
    var pan = event.shiftKey ? 240 : 60;
    if (event.key === "ArrowLeft") {
      elements.viewerStage.scrollLeft -= pan;
    } else if (event.key === "ArrowRight") {
      elements.viewerStage.scrollLeft += pan;
    } else if (event.key === "ArrowUp") {
      elements.viewerStage.scrollTop -= pan;
    } else {
      elements.viewerStage.scrollTop += pan;
    }
  }

  function handleViewerKey(event) {
    var handled = true;
    var shortcut = findShortcut(viewerShortcuts, event);
    if (shortcut) {
      shortcut.run(event);
    } else if ((event.key === "Enter" || event.key === " ") &&
               document.activeElement && document.activeElement.tagName === "BUTTON") {
      handled = false;
    } else {
      // Reader shortcuts such as find or tab switching wait until the viewer
      // is closed; letting them act behind a modal view would be confusing.
      handled = event.ctrlKey || event.metaKey || event.key === "F3";
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function stagePoint(event) {
    var rect = elements.viewerStage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  elements.viewer.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-action]") : null;
    if (button) {
      viewerAction(button.dataset.action);
    }
  });
  // The stage contains its own scrolling (overscroll-behavior); a wheel over
  // the toolbar must not scroll the hidden page either. This listener exists
  // only on the viewer, so it never delays scrolling the page itself.
  elements.viewer.addEventListener("wheel", function (event) {
    if (!elements.viewerStage.contains(event.target)) {
      event.preventDefault();
    }
  }, { passive: false });
  elements.viewerStage.addEventListener("wheel", function (event) {
    if (!viewerState || !(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    var direction = wheelZoomDirection(event);
    if (direction) {
      var point = stagePoint(event);
      stepViewerZoom(direction, point.x, point.y);
    }
  }, { passive: false });
  elements.viewerStage.addEventListener("pointerdown", function (event) {
    if (!viewerState || event.button !== 0) {
      return;
    }
    viewerState.drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      onBackdrop: event.target === elements.viewerStage ||
        event.target === elements.viewerCanvas
    };
    elements.viewerStage.setPointerCapture(event.pointerId);
  });
  elements.viewerStage.addEventListener("pointermove", function (event) {
    var drag = viewerState && viewerState.drag;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) {
      return;
    }
    drag.moved = true;
    elements.viewer.setAttribute("data-dragging", "");
    elements.viewerStage.scrollLeft -= dx;
    elements.viewerStage.scrollTop -= dy;
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  function endViewerDrag(event) {
    var drag = viewerState && viewerState.drag;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    viewerState.drag = null;
    elements.viewer.removeAttribute("data-dragging");
    // A plain click on the dark backdrop closes the viewer, like a lightbox.
    if (event.type === "pointerup" && !drag.moved && drag.onBackdrop) {
      closeViewer(true);
    }
  }
  // An expanded figure has left the document, so put it back before printing.
  window.addEventListener("beforeprint", function () {
    closeViewer(false);
  });
  elements.viewerStage.addEventListener("pointerup", endViewerDrag);
  elements.viewerStage.addEventListener("pointercancel", endViewerDrag);
  elements.viewerStage.addEventListener("dblclick", function (event) {
    if (!viewerState || event.target === elements.viewerStage) {
      return;
    }
    var point = stagePoint(event);
    viewerAction(viewerState.mode === "fit" ? "actual" : "fit", point.x, point.y);
  });

  function handleNativeMessage(event) {
    var data = event.data || {};
    if (data.type === "document") {
      renderDocument(data);
    } else if (data.type === "tabs") {
      receiveTabs(data);
    } else if (data.type === "copied") {
      var request = copyRequests.get(Number(data.requestId));
      copyRequests.delete(Number(data.requestId));
      if (request && data.ok === true) {
        confirmCopy(request.button, request.index);
      }
    } else if (data.type === "host") {
      // A host that saves a language reports it; the page may already show it
      // from its address, and then nothing is translated again.
      if (typeof data.language === "string") {
        languageSetting = interfaceStrings.normalizeSetting(data.language);
        hostSystemLanguage = typeof data.systemLanguage === "string"
          ? data.systemLanguage.slice(0, 40)
          : "";
        elements.languageGroup.hidden = false;
        applyLanguage(interfaceStrings.resolve(languageSetting, systemLanguageTag()));
      }
      hostCopiesSource = data.copySource === true;
      hostHasTabs = data.tabs === true;
      hostIsMac = data.platform === "macos";
      hostShortcuts = (Array.isArray(data.shortcuts) ? data.shortcuts.slice(0, 100) : [])
        .filter(function (entry) {
          return entry && typeof entry.keys === "string" && typeof entry.label === "string" &&
            entry.keys.length <= 40 && entry.label.length <= 80;
        })
        .map(function (entry) {
          return { keys: entry.keys, label: entry.label };
        });
      updateHostTitles();
      // The saved zoom and width arrive before the first document, so it is
      // laid out once at its final size.
      if (data.zoom !== undefined) {
        applyZoom(data.zoom);
      }
      if (data.width !== undefined) {
        applyWidth(String(data.width));
      }
      applyTheme(currentTheme, false);
    } else if (data.type === "empty") {
      applyTheme(data.theme || "system", false);
      showState("empty", "", "");
    } else if (data.type === "error") {
      applyTheme(data.theme || currentTheme, false);
      showState("error", data.message || "", data.fileName || "");
    } else if (data.type === "status") {
      showStatus(interfaceStrings.hostText(language, data.message || ""), data.tone || "info");
    } else if (data.type === "theme") {
      applyTheme(data.value || "system", true);
    } else if (data.type === "zoom") {
      applyZoom(Number(data.percent));
      showZoomLevel(Number(data.percent));
    } else if (data.type === "width") {
      applyWidth(String(data.value || ""));
    } else if (data.type === "command") {
      // Native menu commands (macOS View menu).
      if (data.name === "settings") {
        openSettings(false);
      } else if (data.name === "width") {
        cycleWidth();
      }
    } else if (data.type === "zoom-command") {
      // A native menu command (macOS View menu) zooms whatever is in front.
      var action = data.action === "in" || data.action === "out"
        ? data.action
        : "reset";
      if (viewerState) {
        viewerAction(action);
      } else {
        zoomPage(action);
      }
    }
  }

  elements.openButton.addEventListener("click", function () {
    post("open-file");
  });
  elements.stateOpenButton.addEventListener("click", function () {
    post("open-file");
  });
  elements.copyButton.addEventListener("click", function () {
    copySection(-1, elements.copyButton);
  });
  elements.themeButton.addEventListener("click", cycleTheme);
  elements.settingsButton.addEventListener("click", function () {
    if (elements.settingsPanel.hidden) {
      openSettings(true);
    } else {
      closeSettings(true);
    }
  });
  elements.settingsClose.addEventListener("click", function () {
    closeSettings(true);
  });
  elements.settingsPanel.addEventListener("change", function (event) {
    var input = event.target;
    if (input.name === "settings-theme") {
      chooseTheme(input.value);
    } else if (input.name === "settings-width") {
      chooseWidth(input.value);
    } else if (input.name === "settings-language") {
      chooseLanguage(input.value);
    }
  });
  elements.settingsZoomIn.addEventListener("click", function () {
    zoomPage("in");
  });
  elements.settingsZoomOut.addEventListener("click", function () {
    zoomPage("out");
  });
  elements.settingsZoomReset.addEventListener("click", function () {
    zoomPage("reset");
  });
  elements.article.addEventListener("click", handleArticleClick);
  // The link itself still jumps to its heading.
  elements.outlineList.addEventListener("click", function (event) {
    var link = event.target && event.target.closest
      ? event.target.closest("a[data-index]")
      : null;
    var entry = link ? outlineEntries[Number(link.dataset.index)] : null;
    if (entry && entry.link === link) {
      pinOutline(Number(link.dataset.index));
    }
  });
  elements.article.addEventListener("auxclick", handleArticleAuxClick);
  elements.tabStrip.addEventListener("click", function (event) {
    var id = tabIdFrom(event.target);
    if (!id) {
      return;
    }
    if (event.target.closest(".tab-close")) {
      closeTab(id);
    } else {
      selectTab(id, false);
    }
  });
  elements.tabStrip.addEventListener("mousedown", function (event) {
    if (event.button === 1) {
      event.preventDefault();
    }
  });
  elements.tabStrip.addEventListener("auxclick", function (event) {
    var id = event.button === 1 ? tabIdFrom(event.target) : 0;
    if (id) {
      event.preventDefault();
      closeTab(id);
    }
  });
  elements.tabStrip.addEventListener("keydown", function (event) {
    var id = tabIdFrom(event.target);
    var index = tabs.findIndex(function (tab) {
      return tab.id === id;
    });
    if (index < 0) {
      return;
    }
    var shortcut = findShortcut(tabStripShortcuts, event);
    if (shortcut) {
      event.preventDefault();
      shortcut.run(event, id, index);
    }
  });
  // Each search walks the whole article, so wait for a pause in typing.
  // Enter and F3 run a pending search at once.
  elements.findInput.addEventListener("input", function () {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      searchTimer = 0;
      updateSearch();
    }, 120);
  });
  elements.findInput.addEventListener("keydown", function (event) {
    var shortcut = findShortcut(findShortcuts, event);
    if (shortcut) {
      event.preventDefault();
      shortcut.run(event);
    }
  });

  // Keyboard shortcuts. Each table is what its key handler acts on and what
  // the settings panel lists, so the list cannot drift from the keys. keys is
  // the label in Windows and Linux terms; macOS shows Cmd for Ctrl.
  function isControl(event) {
    return event.ctrlKey || event.metaKey;
  }

  function keyName(event) {
    // Chromium sends keydown without a key for autofill; ignore those.
    return typeof event.key === "string" ? event.key.toLocaleLowerCase() : "";
  }

  function plainControl(letter) {
    return function (event) {
      return isControl(event) && !event.altKey && keyName(event) === letter;
    };
  }

  function isZoomInKey(event) {
    return event.key === "+" || event.key === "=" || event.key === "Add";
  }

  function isZoomOutKey(event) {
    return event.key === "-" || event.key === "_" || event.key === "Subtract";
  }

  function tabsAvailable() {
    return hostHasTabs;
  }

  var readerShortcuts = [
    { id: "open", group: "group.reader", keys: "Ctrl+O", label: "open.markdownFile",
      match: plainControl("o"), run: function () { post("open-file"); } },
    { id: "find", group: "group.reader", keys: "Ctrl+F", label: "shortcut.find",
      match: plainControl("f"),
      run: function () {
        elements.findInput.focus();
        elements.findInput.select();
      } },
    { id: "find-next", group: "group.reader", keys: "F3", label: "shortcut.nextMatch",
      match: function (event) { return event.key === "F3" && !event.shiftKey; },
      run: function () { moveSearch(1); } },
    { id: "find-previous", group: "group.reader", keys: "Shift+F3", label: "shortcut.previousMatch",
      match: function (event) { return event.key === "F3" && event.shiftKey; },
      run: function () { moveSearch(-1); } },
    { id: "reload", group: "group.reader", keys: "Ctrl+R", label: "shortcut.reload",
      match: plainControl("r"), run: function () { post("reload"); } },
    { id: "theme", group: "group.reader", keys: "Ctrl+Shift+T", label: "shortcut.theme",
      match: function (event) {
        return isControl(event) && event.shiftKey && keyName(event) === "t";
      },
      run: cycleTheme },
    { id: "width", group: "group.reader", keys: "Ctrl+Shift+L",
      label: "shortcut.width",
      match: function (event) {
        return isControl(event) && event.shiftKey && !event.altKey && keyName(event) === "l";
      },
      run: cycleWidth },
    { id: "copy", group: "group.reader", keys: "Ctrl+Shift+C",
      label: "shortcut.copy",
      match: function (event) {
        return isControl(event) && event.shiftKey && keyName(event) === "c";
      },
      run: function () { copySection(-1, elements.copyButton); } },
    { id: "zoom-in", group: "group.reader", keys: "Ctrl++", label: "zoom.in",
      match: function (event) { return isControl(event) && !event.altKey && isZoomInKey(event); },
      run: function () { zoomPage("in"); } },
    { id: "zoom-out", group: "group.reader", keys: "Ctrl+-", label: "zoom.out",
      match: function (event) { return isControl(event) && !event.altKey && isZoomOutKey(event); },
      run: function () { zoomPage("out"); } },
    { id: "zoom-reset", group: "group.reader", keys: "Ctrl+0", label: "viewer.actual",
      match: function (event) { return isControl(event) && !event.altKey && event.key === "0"; },
      run: function () { zoomPage("reset"); } },
    { id: "settings", group: "group.reader", keys: "Ctrl+/", label: "shortcut.settings",
      match: function (event) { return isControl(event) && !event.altKey && event.key === "/"; },
      run: function () { openSettings(false); } },
    { id: "settings-help", group: "group.reader", keys: "F1", label: "shortcut.settings",
      match: function (event) { return event.key === "F1" && !isControl(event) && !event.altKey; },
      run: function () { openSettings(false); } },
    { id: "settings-close", group: "group.settings", keys: "Esc",
      label: "shortcut.closeSettings",
      match: function (event) {
        return event.key === "Escape" && !elements.settingsPanel.hidden;
      },
      run: function () { closeSettings(true); } },
    { id: "tab-next", group: "group.tabs", keys: "Ctrl+Tab", label: "shortcut.nextTab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && event.key === "Tab" && tabs.length > 1;
      },
      run: function () { cycleTab(1); } },
    { id: "tab-previous", group: "group.tabs", keys: "Ctrl+Shift+Tab", label: "shortcut.previousTab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && event.shiftKey && event.key === "Tab" && tabs.length > 1;
      },
      run: function () { cycleTab(-1); } },
    { id: "tab-page-down", group: "group.tabs", keys: "Ctrl+Page Down", label: "shortcut.nextTab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && event.key === "PageDown" && tabs.length > 1;
      },
      run: function () { cycleTab(1); } },
    { id: "tab-page-up", group: "group.tabs", keys: "Ctrl+Page Up", label: "shortcut.previousTab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && event.key === "PageUp" && tabs.length > 1;
      },
      run: function () { cycleTab(-1); } },
    { id: "tab-close", group: "group.tabs", keys: "Ctrl+W", label: "shortcut.closeTab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && !event.altKey &&
          keyName(event) === "w" && activeTabId;
      },
      run: function () { closeTab(activeTabId); } },
    { id: "tab-number", group: "group.tabs", keys: "Ctrl+1 to Ctrl+8",
      label: "shortcut.tabByPosition", available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && !event.altKey &&
          /^[1-8]$/.test(event.key) && tabs.length > 1;
      },
      run: function (event) {
        var target = tabs[Number(event.key) - 1];
        if (target) {
          selectTab(target.id, false);
        }
      } },
    { id: "tab-last", group: "group.tabs", keys: "Ctrl+9", label: "shortcut.lastTab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && !event.altKey &&
          event.key === "9" && tabs.length > 1;
      },
      run: function () { selectTab(tabs[tabs.length - 1].id, false); } }
  ];

  var findShortcuts = [
    { group: "group.find", keys: "Enter", label: "shortcut.nextMatch",
      match: function (event) { return event.key === "Enter" && !event.shiftKey; },
      run: function () { moveSearch(1); } },
    { group: "group.find", keys: "Shift+Enter", label: "shortcut.previousMatch",
      match: function (event) { return event.key === "Enter" && event.shiftKey; },
      run: function () { moveSearch(-1); } },
    { group: "group.find", keys: "Esc", label: "shortcut.clearSearch",
      match: function (event) { return event.key === "Escape"; },
      run: function () {
        elements.findInput.value = "";
        clearSearch();
        elements.article.focus();
      } }
  ];

  var tabStripShortcuts = [
    { group: "group.tabStrip", keys: "Right arrow", label: "shortcut.nextTab", available: tabsAvailable,
      match: function (event) { return event.key === "ArrowRight"; },
      run: function (_event, _id, index) { selectTab(tabs[(index + 1) % tabs.length].id, true); } },
    { group: "group.tabStrip", keys: "Left arrow", label: "shortcut.previousTab", available: tabsAvailable,
      match: function (event) { return event.key === "ArrowLeft"; },
      run: function (_event, _id, index) {
        selectTab(tabs[(index - 1 + tabs.length) % tabs.length].id, true);
      } },
    { group: "group.tabStrip", keys: "Home", label: "shortcut.firstTab", available: tabsAvailable,
      match: function (event) { return event.key === "Home"; },
      run: function () { selectTab(tabs[0].id, true); } },
    { group: "group.tabStrip", keys: "End", label: "shortcut.finalTab", available: tabsAvailable,
      match: function (event) { return event.key === "End"; },
      run: function () { selectTab(tabs[tabs.length - 1].id, true); } },
    { group: "group.tabStrip", keys: "Delete", label: "shortcut.closeTab", available: tabsAvailable,
      match: function (event) { return event.key === "Delete"; },
      run: function (_event, id) { closeTab(id); } }
  ];

  var viewerShortcuts = [
    { group: "group.figure", keys: "Esc", label: "shortcut.closeFigure",
      match: function (event) { return event.key === "Escape"; },
      run: function () { closeViewer(true); } },
    { group: "group.figure", keys: "+", label: "zoom.in", match: isZoomInKey,
      run: function () { viewerAction("in"); } },
    { group: "group.figure", keys: "-", label: "zoom.out", match: isZoomOutKey,
      run: function () { viewerAction("out"); } },
    { group: "group.figure", keys: "0", label: "shortcut.fitWindow",
      match: function (event) { return event.key === "0"; },
      run: function () { viewerAction("fit"); } },
    { group: "group.figure", keys: "1", label: "viewer.actual",
      match: function (event) { return event.key === "1" && !isControl(event); },
      run: function () { viewerAction("actual"); } },
    { group: "group.figure", keys: "Arrow keys", label: "shortcut.pan",
      match: function (event) {
        return /^Arrow(Left|Right|Up|Down)$/.test(event.key);
      },
      run: panViewer },
    { group: "group.figure", keys: "Tab", label: "shortcut.moveControls",
      match: function (event) { return event.key === "Tab"; },
      run: function (event) {
        // Keep focus inside the dialog.
        var focusables = viewerFocusables();
        var index = focusables.indexOf(document.activeElement);
        var next = (index + (event.shiftKey ? -1 : 1) + focusables.length) %
          focusables.length;
        focusables[next].focus();
      } }
  ];

  function findShortcut(table, event) {
    for (var index = 0; index < table.length; index += 1) {
      if (table[index].match(event)) {
        return table[index];
      }
    }
    return null;
  }

  // Keys named in words are translated; the rest are printed on the keys.
  var keyNames = {
    "Right arrow": "key.rightArrow",
    "Left arrow": "key.leftArrow",
    "Arrow keys": "key.arrows",
    "Ctrl+1 to Ctrl+8": "key.tabNumbers"
  };

  function formatKeys(keys) {
    var text = keyNames[keys] ? t(keyNames[keys]) : keys;
    return hostIsMac ? text.replace(/\bCtrl\+/g, "Cmd+") : text;
  }

  function shortcutKeys(id) {
    var entry = readerShortcuts.find(function (shortcut) {
      return shortcut.id === id;
    });
    return entry ? formatKeys(entry.keys) : "";
  }

  // Every shortcut this window acts on, in the order the panel shows them.
  // Shortcuts the host adds, such as macOS menu items, follow, without the
  // ones the page already lists.
  function listedShortcuts() {
    var listed = [];
    [readerShortcuts, findShortcuts, tabStripShortcuts, viewerShortcuts]
      .forEach(function (table) {
        table.forEach(function (entry) {
          if (!entry.available || entry.available()) {
            listed.push({
              group: t(entry.group),
              keys: formatKeys(entry.keys),
              label: t(entry.label)
            });
          }
        });
      });
    var seen = new Set(listed.map(function (entry) { return entry.keys; }));
    hostShortcuts.forEach(function (entry) {
      if (!seen.has(entry.keys)) {
        seen.add(entry.keys);
        listed.push({ group: t("group.menu"), keys: entry.keys, label: entry.label });
      }
    });
    return listed;
  }

  function renderShortcutList() {
    var fragment = document.createDocumentFragment();
    var currentGroup = "";
    var list = null;
    listedShortcuts().forEach(function (entry) {
      if (entry.group !== currentGroup) {
        currentGroup = entry.group;
        var heading = document.createElement("h4");
        heading.textContent = entry.group;
        list = document.createElement("dl");
        fragment.appendChild(heading);
        fragment.appendChild(list);
      }
      var row = document.createElement("div");
      row.className = "shortcut-row";
      var keys = document.createElement("dt");
      var kbd = document.createElement("kbd");
      kbd.textContent = entry.keys;
      keys.appendChild(kbd);
      var label = document.createElement("dd");
      label.textContent = entry.label;
      row.appendChild(keys);
      row.appendChild(label);
      list.appendChild(row);
    });
    elements.shortcutList.replaceChildren(fragment);
  }

  // The settings panel sits beside the document, below the toolbar. It is
  // not modal: the reader keeps working, and Esc returns focus.
  function updateSettingsPanel() {
    if (!elements.settingsPanel) {
      return;
    }
    elements.settingsPanel.querySelectorAll('input[name="settings-theme"]')
      .forEach(function (input) {
        input.checked = input.value === currentTheme;
      });
    elements.settingsPanel.querySelectorAll('input[name="settings-width"]')
      .forEach(function (input) {
        input.checked = input.value === currentWidth;
      });
    elements.settingsPanel.querySelectorAll('input[name="settings-language"]')
      .forEach(function (input) {
        input.checked = input.value === languageSetting;
      });
    elements.settingsZoomValue.textContent = Math.round(zoomLevel * 100) + "%";
  }

  function updateHostTitles() {
    elements.copyButton.title = t(
      hostCopiesSource ? "copy.documentMarkdownKeys" : "copy.documentKeys",
      { keys: shortcutKeys("copy") });
    elements.settingsButton.title =
      t("settings.buttonKeys", { keys: shortcutKeys("settings") });
  }

  function renderDocumentLine() {
    elements.fileName.textContent = documentView.fileName || t("doc.untitled");
    elements.fileMeta.textContent =
      t("doc.watching", { size: formatBytes(documentView.sourceBytes) });
  }

  function chooseLanguage(setting) {
    languageSetting = interfaceStrings.normalizeSetting(setting);
    applyLanguage(interfaceStrings.resolve(languageSetting, systemLanguageTag()));
    post("language|" + languageSetting);
  }

  function applyLanguage(next) {
    next = interfaceStrings.languages.indexOf(next) >= 0 ? next : "en";
    if (next !== language) {
      language = next;
      translatePage();
    }
    updateSettingsPanel();
  }

  // Writes every string on the page in the current language. It runs only
  // when the language is not the English reader.html starts with, or changes.
  function translatePage() {
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    ["title", "aria-label", "placeholder"].forEach(function (name) {
      document.querySelectorAll("[data-i18n-" + name + "]").forEach(function (node) {
        node.setAttribute(name, t(node.getAttribute("data-i18n-" + name)));
      });
    });
    updateHostTitles();
    applyTheme(currentTheme, false);
    if (elements.readerPane.hidden) {
      renderStateText();
    } else {
      renderDocumentLine();
      relabelDocument();
    }
    if (tabs.length) {
      renderTabs();
    }
    if (!elements.settingsPanel.hidden) {
      renderShortcutList();
    }
  }

  // The labels the page added to the document on screen.
  function relabelDocument() {
    var article = elements.article;
    var copyTitle = t(hostCopiesSource ? "copy.sectionMarkdown" : "copy.section");
    article.querySelectorAll(".copy-section").forEach(function (button) {
      button.title = copyTitle;
      button.setAttribute("aria-label", t("copy.sectionLabel", {
        text: (button.parentElement.textContent || "").trim()
      }));
    });
    article.querySelectorAll(".expand-figure").forEach(function (button) {
      var image = button.parentElement.classList.contains("figure-frame-image");
      button.title = t("figure.expand");
      button.setAttribute("aria-label",
        t(image ? "figure.expandImage" : "figure.expandDiagram"));
    });
    article.querySelectorAll(".table-scroll").forEach(function (wrapper) {
      wrapper.setAttribute("aria-label", t("table.scrollable"));
    });
    article.querySelectorAll(".blocked-image").forEach(function (note) {
      if (note._leanmarkNote) {
        note.textContent = blockedImageText(note._leanmarkNote);
      }
    });
    article.querySelectorAll("figure.diagram").forEach(function (figure) {
      figure.setAttribute("aria-label", t("diagram.label"));
      var svg = figure.querySelector("svg[role=img]");
      if (svg) {
        svg.setAttribute("aria-label", t("diagram.label"));
      }
      if (figure._leanmarkError) {
        figure.querySelector("strong").textContent = t(figure._leanmarkError[0]);
        figure.querySelector("span").textContent = t(figure._leanmarkError[1]);
      }
    });
  }

  function openSettings(fromButton) {
    if (elements.settingsPanel.hidden) {
      settingsReturnFocus = fromButton ? elements.settingsButton : document.activeElement;
      renderShortcutList();
      elements.settingsPanel.hidden = false;
      document.documentElement.setAttribute("data-settings-open", "");
      elements.settingsButton.setAttribute("aria-expanded", "true");
      updateSettingsPanel();
      updateLayout();
    }
    var checked = elements.settingsPanel.querySelector('input[name="settings-theme"]:checked');
    (checked || elements.settingsClose).focus({ preventScroll: true });
  }

  function closeSettings(restoreFocus) {
    if (elements.settingsPanel.hidden) {
      return;
    }
    elements.settingsPanel.hidden = true;
    document.documentElement.removeAttribute("data-settings-open");
    elements.settingsButton.setAttribute("aria-expanded", "false");
    updateLayout();
    var target = settingsReturnFocus && settingsReturnFocus.isConnected &&
      settingsReturnFocus !== document.body
      ? settingsReturnFocus
      : elements.settingsButton;
    settingsReturnFocus = null;
    if (restoreFocus) {
      target.focus({ preventScroll: true });
    }
  }

  document.addEventListener("keydown", function (event) {
    if (viewerState) {
      handleViewerKey(event);
      return;
    }
    // A key a focused control already acted on, such as Esc in the find box.
    if (event.defaultPrevented) {
      return;
    }
    var shortcut = findShortcut(readerShortcuts, event);
    if (shortcut) {
      event.preventDefault();
      shortcut.run(event);
    }
  });


  // Reading scrollHeight and heading positions forces layout, so measure at
  // most once per frame rather than once per scroll event.
  function scheduleReadingProgress() {
    if (!progressFrame) {
      progressFrame = requestAnimationFrame(function () {
        progressFrame = 0;
        updateReadingProgress();
        updateOutlineCurrent();
      });
    }
  }

  // Once more when scrolling stops: layout that settles just after a long
  // jump moves headings without another scroll event.
  function handleScroll() {
    scheduleReadingProgress();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(function () {
      settleTimer = 0;
      scheduleReadingProgress();
    }, 120);
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
  // Images and diagrams that finish later change the document's height and
  // move the headings without a scroll event.
  if (window.ResizeObserver) {
    new ResizeObserver(scheduleReadingProgress).observe(elements.article);
  }
  window.addEventListener("resize", function () {
    updateLayout();
    scheduleReadingProgress();
    if (viewerState && viewerState.mode === "fit") {
      setViewerScale(viewerFitScale(), "fit");
    }
  });
  systemTheme.addEventListener("change", function () {
    if (currentTheme === "system") {
      applyTheme("system", true);
    }
  });

  if (webView2Bridge) {
    webView2Bridge.addEventListener("message", handleNativeMessage);
  }
  window.LeanMarkHost = Object.freeze({
    receive: function (data) {
      handleNativeMessage({ data: data || {} });
    }
  });
  window.LeanMarkTest = Object.freeze({
    renderDocument: renderDocument,
    applyTheme: function (theme) {
      applyTheme(theme, true);
    },
    showEmpty: function () {
      showState("emptyShort", "", "");
    },
    sectionText: renderedSectionText,
    shortcuts: listedShortcuts,
    openViewer: function (index) {
      var frames = elements.article.querySelectorAll(".figure-frame[data-expandable]");
      if (frames[index || 0]) {
        openViewer(frames[index || 0]);
      }
      return !!viewerState;
    },
    viewerState: function () {
      return viewerState
        ? { scale: viewerState.scale, mode: viewerState.mode }
        : null;
    }
  });

  if (language !== "en") {
    translatePage();
  }
  applyZoom(100);
  applyWidth("narrow");
  applyTheme("system", false);
  updateReadingProgress();
  post("ready");
}());
