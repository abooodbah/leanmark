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
    stateMessage: document.getElementById("stateMessage"),
    stateOpenButton: document.getElementById("stateOpenButton"),
    statePane: document.getElementById("statePane"),
    stateTitle: document.getElementById("stateTitle"),
    status: document.getElementById("statusToast"),
    tabStrip: document.getElementById("tabStrip"),
    themeButton: document.getElementById("themeButton")
  };

  var currentPath = "";
  var currentTheme = "system";
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

  function effectiveDarkTheme() {
    return currentTheme === "dark" ||
      (currentTheme === "system" && systemTheme.matches);
  }

  function applyTheme(theme, rerenderDiagrams) {
    currentTheme = theme === "light" || theme === "dark" ? theme : "system";
    if (currentTheme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", currentTheme);
    }
    elements.themeButton.textContent =
      currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
    elements.themeButton.setAttribute(
      "aria-label",
      "Theme: " + elements.themeButton.textContent +
        ". Activate to change theme."
    );
    elements.themeButton.title =
      "Theme: " + elements.themeButton.textContent + " (Ctrl+Shift+T)";

    if (rerenderDiagrams && elements.article.querySelector(".diagram")) {
      renderDiagrams();
    }
  }

  function cycleTheme() {
    var next = currentTheme === "system"
      ? "light"
      : currentTheme === "light"
        ? "dark"
        : "system";
    applyTheme(next, true);
    post("theme|" + next);
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

  function prepareImages() {
    elements.article.querySelectorAll("img").forEach(function (image) {
      var source = (image.getAttribute("src") || "").trim();
      var alt = image.getAttribute("alt") || "Image";
      if (!source) {
        replaceImageWithMessage(image, "Image unavailable — " + alt);
        return;
      }

      if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(source)) {
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

  function buildOutline() {
    var usedSlugs = new Set();
    var headings = Array.from(elements.article.querySelectorAll(headingSelector));
    headings.forEach(function (heading) {
      heading.id = slugifyHeading(heading.textContent || "", usedSlugs);
    });

    var outlineHeadings = headings.filter(function (heading) {
      return heading.tagName === "H2" || heading.tagName === "H3";
    });
    elements.outlineList.replaceChildren();
    if (outlineHeadings.length < 2) {
      elements.outline.hidden = true;
      return;
    }

    outlineHeadings.forEach(function (heading) {
      var item = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#" + heading.id;
      link.dataset.level = heading.tagName.slice(1);
      link.textContent = heading.textContent;
      item.appendChild(link);
      elements.outlineList.appendChild(item);
    });
    elements.outline.hidden = false;
  }

  // One small button per heading. The icon is drawn in CSS, so the button adds
  // no text: outline labels, anchors, and search all see the heading unchanged.
  function addCopyButtons() {
    var title = hostCopiesSource
      ? "Copy this section as Markdown"
      : "Copy this section";
    elements.article.querySelectorAll(headingSelector).forEach(function (heading, index) {
      var text = (heading.textContent || "").trim();
      if (!text) {
        return;
      }
      var button = document.createElement("button");
      button.type = "button";
      button.className = "copy-section";
      button.dataset.heading = String(index);
      button.title = title;
      button.setAttribute("aria-label", "Copy section: " + text);
      heading.appendChild(button);
    });
  }

  function prepareDiagrams() {
    var blocks = Array.from(
      elements.article.querySelectorAll("pre > code.language-mermaid")
    );
    blocks.forEach(function (code, index) {
      var pre = code.parentElement;
      var figure = document.createElement("figure");
      figure.className = "diagram";
      figure._leanmarkSource = code.textContent || "";
      figure.setAttribute("aria-label", "Mermaid diagram");
      if (index >= 50) {
        renderDiagramError(
          figure,
          "Diagram limit reached",
          "LeanMark renders at most 50 diagrams in one document."
        );
      }
      pre.replaceWith(figure);
    });
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
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: effectiveDarkTheme() ? "dark" : "neutral",
        fontFamily: "IBM Plex Sans, Segoe UI, sans-serif"
      });

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
    buildOutline();
    prepareDiagrams();
    addCopyButtons();
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

  function headingCount() {
    return elements.article.querySelectorAll(headingSelector).length;
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
        index + "|" + headingCount());
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
    savedScroll.forEach(function (_ratio, id) {
      if (!tabs.some(function (tab) { return tab.id === id; })) {
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
      elements.copyButton.title = hostCopiesSource
        ? "Copy the whole document as Markdown (Ctrl+Shift+C)"
        : "Copy the whole document (Ctrl+Shift+C)";
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
    var next = -1;
    if (event.key === "ArrowRight") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else if (event.key === "Delete") {
      event.preventDefault();
      closeTab(id);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      selectTab(tabs[next].id, true);
    }
  });
  elements.findInput.addEventListener("input", updateSearch);
  elements.findInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSearch(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      elements.findInput.value = "";
      clearSearch();
      elements.article.focus();
    }
  });

  document.addEventListener("keydown", function (event) {
    var control = event.ctrlKey || event.metaKey;
    // Chromium sends keydown without a key for autofill; ignore those.
    var key = typeof event.key === "string" ? event.key.toLocaleLowerCase() : "";
    if (control && !event.altKey && key === "o") {
      event.preventDefault();
      post("open-file");
    } else if (control && !event.altKey && key === "f") {
      event.preventDefault();
      elements.findInput.focus();
      elements.findInput.select();
    } else if (event.key === "F3") {
      event.preventDefault();
      moveSearch(event.shiftKey ? -1 : 1);
    } else if (control && !event.altKey && key === "r") {
      event.preventDefault();
      post("reload");
    } else if (control && event.shiftKey && key === "t") {
      event.preventDefault();
      cycleTheme();
    } else if (control && event.shiftKey && key === "c") {
      event.preventDefault();
      copySection(-1, elements.copyButton);
    } else if (control && event.key === "Tab" && tabs.length > 1) {
      event.preventDefault();
      cycleTab(event.shiftKey ? -1 : 1);
    } else if (control && tabs.length > 1 &&
               (event.key === "PageDown" || event.key === "PageUp")) {
      event.preventDefault();
      cycleTab(event.key === "PageDown" ? 1 : -1);
    } else if (control && !event.shiftKey && !event.altKey && key === "w" &&
               activeTabId) {
      event.preventDefault();
      closeTab(activeTabId);
    } else if (control && !event.shiftKey && !event.altKey &&
               /^[1-9]$/.test(event.key) && tabs.length > 1) {
      event.preventDefault();
      var target = event.key === "9"
        ? tabs[tabs.length - 1]
        : tabs[Number(event.key) - 1];
      if (target) {
        selectTab(target.id, false);
      }
    } else if (control &&
               (event.key === "+" || event.key === "=" ||
                event.key === "-" || event.key === "0")) {
      event.preventDefault();
      post("zoom|" + (event.key === "-" ? "out" :
        event.key === "0" ? "reset" : "in"));
    }
  });

  window.addEventListener("scroll", updateReadingProgress, { passive: true });
  window.addEventListener("resize", updateReadingProgress);
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
    sectionText: renderedSectionText
  });

  applyTheme("system", false);
  updateReadingProgress();
  post("ready");
}());
