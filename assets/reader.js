(function () {
  "use strict";

  var webView2Bridge = window.chrome && window.chrome.webview;
  var webKitBridge = window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.leanmark;
  var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  var headingSelector = "h1, h2, h3, h4, h5, h6";
  var elements = {
    article: document.getElementById("article"),
    copyButton: document.getElementById("copyButton"),
    fileName: document.getElementById("fileName"),
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

  function titleCase(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // The theme whose colours are on screen: System shows Light or Dark.
  function shownTheme(theme) {
    return theme === "system" ? (systemTheme.matches ? "dark" : "light") : theme;
  }

  // "Dusk", or "System (Dark)" so the name never depends on colour alone.
  function themeDisplayName(theme) {
    return theme === "system"
      ? "System (" + titleCase(shownTheme(theme)) + ")"
      : titleCase(theme);
  }

  function applyTheme(theme, rerenderDiagrams) {
    currentTheme = themeCycle.indexOf(theme) > 0 ? theme : "system";
    if (currentTheme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", currentTheme);
    }
    // The dot has one fixed colour per theme (see .theme-swatch in the CSS).
    elements.themeLabel.textContent = titleCase(currentTheme);
    elements.themeSwatch.dataset.swatch = currentTheme;
    var name = themeDisplayName(currentTheme);
    elements.themeButton.setAttribute(
      "aria-label", "Theme: " + name + ". Activate to change theme.");
    elements.themeButton.title =
      "Theme: " + name + " (" + shortcutKeys("theme") + ")";
    updateSettingsPanel();

    if (rerenderDiagrams && elements.article.querySelector(".diagram")) {
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
    showIndicator("Text width: " + titleCase(currentWidth));
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
    var panelWidth = elements.settingsPanel && !elements.settingsPanel.hidden
      ? elements.settingsPanel.getBoundingClientRect().width
      : 0;
    var available = (window.innerWidth - panelWidth) / zoomLevel;
    var layout = available >= 1180 ? "wide" : available <= 760 ? "compact" : "regular";
    if (document.documentElement.dataset.layout !== layout) {
      document.documentElement.dataset.layout = layout;
    }
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

  function showState(title, message, fileName) {
    rememberScroll();
    closeViewer(false);
    clearSearch();
    currentPath = "";
    displayedTabId = 0;
    elements.readerPane.hidden = true;
    elements.statePane.hidden = false;
    elements.copyButton.disabled = true;
    elements.stateTitle.textContent = title;
    elements.stateMessage.textContent = message;
    elements.fileName.textContent = fileName || "LeanMark";
    elements.fileMeta.textContent = fileName
      ? "Could not open this document"
      : "Lightweight Markdown reader";
    elements.progress.style.width = "0";
    elements.progress.setAttribute("aria-valuenow", "0");
    document.documentElement.dataset.renderState = "ready";
  }

  function replaceImageWithMessage(image, message) {
    var replacement = document.createElement("span");
    replacement.className = "blocked-image";
    replacement.setAttribute("role", "note");
    replacement.textContent = message;
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
    button.title = "Expand";
    button.setAttribute(
      "aria-label",
      kind === "image" ? "Expand image" : "Expand diagram"
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
      var alt = image.getAttribute("alt") || "Image";
      if (!source) {
        replaceImageWithMessage(image, "Image unavailable — " + alt);
        return;
      }

      if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(source)) {
        makeImageExpandable(image);
        return;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(source) || source.indexOf("//") === 0) {
        replaceImageWithMessage(image, "Remote image blocked — " + alt);
        return;
      }
      if (!documentAssetBase) {
        replaceImageWithMessage(image, "Image unavailable — " + alt);
        return;
      }

      try {
        var normalized = source.replace(/\\/g, "/");
        image.src = new URL(normalized, documentAssetBase).href;
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", function () {
          if (image.isConnected) {
            replaceImageWithMessage(image, "Image unavailable — " + alt);
          }
        }, { once: true });
        makeImageExpandable(image);
      } catch (_error) {
        replaceImageWithMessage(image, "Image path is invalid — " + alt);
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
      wrapper.setAttribute("aria-label", "Scrollable table");
      wrapper.tabIndex = 0;
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });
  }

  function slugifyHeading(text, usedSlugs) {
    var base = text
      .toLocaleLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";
    var slug = base;
    var suffix = 1;
    while (usedSlugs.has(slug)) {
      suffix += 1;
      slug = base + "-" + suffix;
    }
    usedSlugs.add(slug);
    return slug;
  }

  // One pass over the headings gives each an id, builds the outline from the
  // second and third levels, and adds the copy buttons. The icon is drawn in
  // CSS, so a button adds no text: outline labels, anchors, and search all see
  // the heading unchanged.
  function prepareHeadings() {
    var usedSlugs = new Set();
    var headings = elements.article.querySelectorAll(headingSelector);
    var copyTitle = hostCopiesSource
      ? "Copy this section as Markdown"
      : "Copy this section";
    var outline = document.createDocumentFragment();
    var outlineCount = 0;
    renderedHeadingCount = headings.length;

    headings.forEach(function (heading, index) {
      var text = heading.textContent || "";
      heading.id = slugifyHeading(text, usedSlugs);
      if (heading.tagName === "H2" || heading.tagName === "H3") {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#" + heading.id;
        link.dataset.level = heading.tagName.slice(1);
        link.textContent = text;
        item.appendChild(link);
        outline.appendChild(item);
        outlineCount += 1;
      }
      text = text.trim();
      if (text) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "copy-section";
        button.dataset.heading = String(index);
        button.title = copyTitle;
        button.setAttribute("aria-label", "Copy section: " + text);
        heading.appendChild(button);
      }
    });

    if (outlineCount < 2) {
      elements.outlineList.replaceChildren();
      elements.outline.hidden = true;
      return;
    }
    elements.outlineList.replaceChildren(outline);
    elements.outline.hidden = false;
  }

  function prepareDiagrams() {
    var blocks = Array.from(
      elements.article.querySelectorAll("pre > code.language-mermaid")
    );
    blocks.forEach(function (code, index) {
      var pre = code.parentElement;
      var figure = document.createElement("figure");
      figure.className = "diagram";
      figure.setAttribute("aria-label", "Mermaid diagram");
      if (index >= 50) {
        // No source is kept, so renderDiagrams leaves this message in place.
        renderDiagramError(
          figure,
          "Diagram limit reached",
          "LeanMark renders at most 50 diagrams in one document."
        );
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

  function renderDiagramError(figure, title, detail) {
    setExpandable(figure, false);
    figure.className = "diagram diagram-error";
    figure.replaceChildren();
    var heading = document.createElement("strong");
    heading.textContent = title;
    var message = document.createElement("span");
    message.textContent = detail;
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
          renderDiagramError(
            figure,
            "Diagram is too large",
            "The Mermaid source exceeds LeanMark's 100 KB diagram limit."
          );
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
          figure.innerHTML = rendered.svg;
          var svg = figure.querySelector("svg");
          if (svg) {
            svg.setAttribute("role", "img");
            svg.setAttribute("aria-label", "Mermaid diagram");
            svg.removeAttribute("height");
            setExpandable(figure, true);
          }
          if (typeof rendered.bindFunctions === "function") {
            rendered.bindFunctions(figure);
          }
        } catch (_diagramError) {
          renderDiagramError(
            figure,
            "Diagram could not be rendered",
            "Check the Mermaid syntax in this fenced code block."
          );
        }
      }
    } catch (_loadError) {
      figures.forEach(function (figure) {
        renderDiagramError(
          figure,
          "Diagrams are unavailable",
          "LeanMark could not load its local Mermaid renderer."
        );
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
    displayedTabId = tabId;
    currentPath = data.path || "";
    documentAssetBase = selectDocumentAssetBase(data.documentBaseUrl);
    applyTheme(data.theme || currentTheme, false);
    elements.fileName.textContent = data.fileName || "Untitled";
    elements.fileName.title = data.path || "";
    elements.fileMeta.textContent =
      formatBytes(data.sourceBytes) + " · Watching for changes";
    elements.article.innerHTML = data.html || "";

    prepareImages();
    prepareLinks();
    wrapTables();
    prepareHeadings();
    prepareDiagrams();
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
    });

    if (data.hasMermaid) {
      renderDiagrams().then(function () {
        if (keepPosition) {
          scrollToRatio(ratio);
        }
        updateReadingProgress();
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
    var what = index < 0 ? "Document" : "Section";
    announce(hostCopiesSource
      ? what + " copied as Markdown."
      : what + " copied as text.");
    if (!button || !button.isConnected) {
      return;
    }
    button.dataset.copied = "true";
    if (button === elements.copyButton) {
      button.textContent = "Copied";
    }
    window.setTimeout(function () {
      button.removeAttribute("data-copied");
      if (button === elements.copyButton) {
        button.textContent = "Copy";
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
      showStatus("LeanMark could not copy to the clipboard.", "error");
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
      close.title = "Close (Ctrl+W)";
      close.setAttribute("aria-label", "Close " + tab.name);
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
      elements.findCount.textContent = "Enter";
      return;
    }

    var walker = document.createTreeWalker(
      elements.article,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          var parent = node.parentElement;
          if (!parent || !node.nodeValue.trim() ||
              parent.closest("svg, script, style, .diagram")) {
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
    showIndicator("Zoom " + String(Math.round(percent)) + "%");
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
    announce("Zoom " + elements.viewerLevel.textContent);
  }

  function viewerAction(action, focusX, focusY) {
    if (action === "in") {
      stepViewerZoom(1, focusX, focusY);
    } else if (action === "out") {
      stepViewerZoom(-1, focusX, focusY);
    } else if (action === "fit" || action === "reset") {
      setViewerScale(viewerFitScale(), "fit");
      announce("Fit to window");
    } else if (action === "actual") {
      setViewerScale(1, "actual", focusX, focusY);
      announce("Actual size");
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
      ? (content.getAttribute("alt") || "Image")
      : "Diagram";
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
      elements.copyButton.title = hostCopiesSource
        ? "Copy the whole document as Markdown (" + shortcutKeys("copy") + ")"
        : "Copy the whole document (" + shortcutKeys("copy") + ")";
      elements.settingsButton.title =
        "Settings and shortcuts (" + shortcutKeys("settings") + ")";
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
      showState(
        "Read Markdown without opening an editor.",
        "Open a local Markdown file to begin. Diagrams render privately on " +
          "this computer.",
        ""
      );
    } else if (data.type === "error") {
      applyTheme(data.theme || currentTheme, false);
      showState(
        "This document could not be opened.",
        data.message || "Check the file and try again.",
        data.fileName || ""
      );
    } else if (data.type === "status") {
      showStatus(data.message || "", data.tone || "info");
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
    { id: "open", group: "Reader", keys: "Ctrl+O", label: "Open a Markdown file",
      match: plainControl("o"), run: function () { post("open-file"); } },
    { id: "find", group: "Reader", keys: "Ctrl+F", label: "Find in the document",
      match: plainControl("f"),
      run: function () {
        elements.findInput.focus();
        elements.findInput.select();
      } },
    { id: "find-next", group: "Reader", keys: "F3", label: "Next match",
      match: function (event) { return event.key === "F3" && !event.shiftKey; },
      run: function () { moveSearch(1); } },
    { id: "find-previous", group: "Reader", keys: "Shift+F3", label: "Previous match",
      match: function (event) { return event.key === "F3" && event.shiftKey; },
      run: function () { moveSearch(-1); } },
    { id: "reload", group: "Reader", keys: "Ctrl+R", label: "Reload the document",
      match: plainControl("r"), run: function () { post("reload"); } },
    { id: "theme", group: "Reader", keys: "Ctrl+Shift+T", label: "Change the theme",
      match: function (event) {
        return isControl(event) && event.shiftKey && keyName(event) === "t";
      },
      run: cycleTheme },
    { id: "width", group: "Reader", keys: "Ctrl+Shift+L",
      label: "Change the text width",
      match: function (event) {
        return isControl(event) && event.shiftKey && !event.altKey && keyName(event) === "l";
      },
      run: cycleWidth },
    { id: "copy", group: "Reader", keys: "Ctrl+Shift+C",
      label: "Copy the whole document",
      match: function (event) {
        return isControl(event) && event.shiftKey && keyName(event) === "c";
      },
      run: function () { copySection(-1, elements.copyButton); } },
    { id: "zoom-in", group: "Reader", keys: "Ctrl++", label: "Zoom in",
      match: function (event) { return isControl(event) && !event.altKey && isZoomInKey(event); },
      run: function () { zoomPage("in"); } },
    { id: "zoom-out", group: "Reader", keys: "Ctrl+-", label: "Zoom out",
      match: function (event) { return isControl(event) && !event.altKey && isZoomOutKey(event); },
      run: function () { zoomPage("out"); } },
    { id: "zoom-reset", group: "Reader", keys: "Ctrl+0", label: "Actual size",
      match: function (event) { return isControl(event) && !event.altKey && event.key === "0"; },
      run: function () { zoomPage("reset"); } },
    { id: "settings", group: "Reader", keys: "Ctrl+/", label: "Settings and shortcuts",
      match: function (event) { return isControl(event) && !event.altKey && event.key === "/"; },
      run: function () { openSettings(false); } },
    { id: "settings-help", group: "Reader", keys: "F1", label: "Settings and shortcuts",
      match: function (event) { return event.key === "F1" && !isControl(event) && !event.altKey; },
      run: function () { openSettings(false); } },
    { id: "settings-close", group: "Settings panel", keys: "Esc",
      label: "Close the settings panel",
      match: function (event) {
        return event.key === "Escape" && !elements.settingsPanel.hidden;
      },
      run: function () { closeSettings(true); } },
    { id: "tab-next", group: "Tabs", keys: "Ctrl+Tab", label: "Next tab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && event.key === "Tab" && tabs.length > 1;
      },
      run: function () { cycleTab(1); } },
    { id: "tab-previous", group: "Tabs", keys: "Ctrl+Shift+Tab", label: "Previous tab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && event.shiftKey && event.key === "Tab" && tabs.length > 1;
      },
      run: function () { cycleTab(-1); } },
    { id: "tab-page-down", group: "Tabs", keys: "Ctrl+Page Down", label: "Next tab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && event.key === "PageDown" && tabs.length > 1;
      },
      run: function () { cycleTab(1); } },
    { id: "tab-page-up", group: "Tabs", keys: "Ctrl+Page Up", label: "Previous tab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && event.key === "PageUp" && tabs.length > 1;
      },
      run: function () { cycleTab(-1); } },
    { id: "tab-close", group: "Tabs", keys: "Ctrl+W", label: "Close the tab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && !event.altKey &&
          keyName(event) === "w" && activeTabId;
      },
      run: function () { closeTab(activeTabId); } },
    { id: "tab-number", group: "Tabs", keys: "Ctrl+1 to Ctrl+8",
      label: "Go to a tab by position", available: tabsAvailable,
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
    { id: "tab-last", group: "Tabs", keys: "Ctrl+9", label: "Go to the last tab",
      available: tabsAvailable,
      match: function (event) {
        return isControl(event) && !event.shiftKey && !event.altKey &&
          event.key === "9" && tabs.length > 1;
      },
      run: function () { selectTab(tabs[tabs.length - 1].id, false); } }
  ];

  var findShortcuts = [
    { group: "Find box", keys: "Enter", label: "Next match",
      match: function (event) { return event.key === "Enter" && !event.shiftKey; },
      run: function () { moveSearch(1); } },
    { group: "Find box", keys: "Shift+Enter", label: "Previous match",
      match: function (event) { return event.key === "Enter" && event.shiftKey; },
      run: function () { moveSearch(-1); } },
    { group: "Find box", keys: "Esc", label: "Clear the search",
      match: function (event) { return event.key === "Escape"; },
      run: function () {
        elements.findInput.value = "";
        clearSearch();
        elements.article.focus();
      } }
  ];

  var tabStripShortcuts = [
    { group: "Tab strip", keys: "Right arrow", label: "Next tab", available: tabsAvailable,
      match: function (event) { return event.key === "ArrowRight"; },
      run: function (_event, _id, index) { selectTab(tabs[(index + 1) % tabs.length].id, true); } },
    { group: "Tab strip", keys: "Left arrow", label: "Previous tab", available: tabsAvailable,
      match: function (event) { return event.key === "ArrowLeft"; },
      run: function (_event, _id, index) {
        selectTab(tabs[(index - 1 + tabs.length) % tabs.length].id, true);
      } },
    { group: "Tab strip", keys: "Home", label: "First tab", available: tabsAvailable,
      match: function (event) { return event.key === "Home"; },
      run: function () { selectTab(tabs[0].id, true); } },
    { group: "Tab strip", keys: "End", label: "Last tab", available: tabsAvailable,
      match: function (event) { return event.key === "End"; },
      run: function () { selectTab(tabs[tabs.length - 1].id, true); } },
    { group: "Tab strip", keys: "Delete", label: "Close the tab", available: tabsAvailable,
      match: function (event) { return event.key === "Delete"; },
      run: function (_event, id) { closeTab(id); } }
  ];

  var viewerShortcuts = [
    { group: "Expanded figure", keys: "Esc", label: "Close the figure",
      match: function (event) { return event.key === "Escape"; },
      run: function () { closeViewer(true); } },
    { group: "Expanded figure", keys: "+", label: "Zoom in", match: isZoomInKey,
      run: function () { viewerAction("in"); } },
    { group: "Expanded figure", keys: "-", label: "Zoom out", match: isZoomOutKey,
      run: function () { viewerAction("out"); } },
    { group: "Expanded figure", keys: "0", label: "Fit to the window",
      match: function (event) { return event.key === "0"; },
      run: function () { viewerAction("fit"); } },
    { group: "Expanded figure", keys: "1", label: "Actual size",
      match: function (event) { return event.key === "1" && !isControl(event); },
      run: function () { viewerAction("actual"); } },
    { group: "Expanded figure", keys: "Arrow keys", label: "Pan, faster with Shift",
      match: function (event) {
        return /^Arrow(Left|Right|Up|Down)$/.test(event.key);
      },
      run: panViewer },
    { group: "Expanded figure", keys: "Tab", label: "Move between its controls",
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

  function formatKeys(keys) {
    return hostIsMac ? keys.replace(/\bCtrl\+/g, "Cmd+") : keys;
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
              group: entry.group,
              keys: formatKeys(entry.keys),
              label: entry.label
            });
          }
        });
      });
    var seen = new Set(listed.map(function (entry) { return entry.keys; }));
    hostShortcuts.forEach(function (entry) {
      if (!seen.has(entry.keys)) {
        seen.add(entry.keys);
        listed.push({ group: "Menu", keys: entry.keys, label: entry.label });
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
    elements.settingsZoomValue.textContent = Math.round(zoomLevel * 100) + "%";
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


  // Reading scrollHeight forces layout, so measure at most once per frame
  // rather than once per scroll event.
  function scheduleReadingProgress() {
    if (!progressFrame) {
      progressFrame = requestAnimationFrame(function () {
        progressFrame = 0;
        updateReadingProgress();
      });
    }
  }

  window.addEventListener("scroll", scheduleReadingProgress, { passive: true });
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
      showState(
        "Read Markdown without opening an editor.",
        "Open a local Markdown file to begin.",
        ""
      );
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

  applyZoom(100);
  applyWidth("narrow");
  applyTheme("system", false);
  updateReadingProgress();
  post("ready");
}());
