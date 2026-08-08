(function () {
  "use strict";

  var webView2Bridge = window.chrome && window.chrome.webview;
  var webKitBridge = window.webkit &&
    window.webkit.messageHandlers &&
    window.webkit.messageHandlers.leanmark;
  var systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  var elements = {
    article: document.getElementById("article"),
    fileName: document.getElementById("fileName"),
    fileMeta: document.getElementById("fileMeta"),
    findCount: document.getElementById("findCount"),
    findInput: document.getElementById("findInput"),
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
    themeButton: document.getElementById("themeButton")
  };

  var currentPath = "";
  var currentTheme = "system";
  var searchRanges = [];
  var currentSearchIndex = -1;
  var toastTimer = 0;
  var mermaidLoader = null;
  var diagramGeneration = 0;
  var documentAssetBase = "https://doc.leanmark.invalid/";

  function post(message) {
    if (webView2Bridge) {
      webView2Bridge.postMessage(message);
    } else if (webKitBridge) {
      webKitBridge.postMessage(message);
    }
  }

  function selectDocumentAssetBase(candidate) {
    if (!candidate) {
      return "https://doc.leanmark.invalid/";
    }
    try {
      var parsed = new URL(candidate);
      if (parsed.href === "https://doc.leanmark.invalid/" ||
          (parsed.protocol === "leanmark-doc:" &&
           parsed.hostname === "document")) {
        return parsed.href;
      }
    } catch (_error) {
      // A host-provided base still passes through this fail-closed allowlist.
    }
    return "https://doc.leanmark.invalid/";
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

  function showReader() {
    elements.statePane.hidden = true;
    elements.readerPane.hidden = false;
  }

  function showState(title, message, fileName) {
    clearSearch();
    currentPath = "";
    elements.readerPane.hidden = true;
    elements.statePane.hidden = false;
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
    elements.article.querySelectorAll("a[href]").forEach(function (link) {
      var href = (link.getAttribute("href") || "").trim();
      link.removeAttribute("target");
      link.removeAttribute("download");
      if (!href || href.charAt(0) === "#") {
        return;
      }
      if (/^https?:/i.test(href)) {
        link.rel = "noopener noreferrer";
      }
      link.addEventListener("click", function (event) {
        event.preventDefault();
        post("open-link|" + href);
      });
    });
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
    var headings = Array.from(
      elements.article.querySelectorAll("h1, h2, h3, h4, h5, h6")
    );
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
    var sameDocument = currentPath && currentPath === data.path;
    var scrollableBefore =
      document.documentElement.scrollHeight - window.innerHeight;
    var scrollRatio = sameDocument && scrollableBefore > 0
      ? window.scrollY / scrollableBefore
      : 0;

    clearSearch();
    diagramGeneration += 1;
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
    showReader();
    document.documentElement.dataset.renderState =
      data.hasMermaid ? "diagrams" : "ready";

    requestAnimationFrame(function () {
      if (sameDocument) {
        var scrollableAfter =
          document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.max(0, scrollableAfter * scrollRatio));
      } else {
        window.scrollTo(0, 0);
      }
      updateReadingProgress();
    });

    if (data.hasMermaid) {
      renderDiagrams().then(function () {
        if (sameDocument) {
          var scrollable =
            document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo(0, Math.max(0, scrollable * scrollRatio));
        }
        updateReadingProgress();
      });
    }
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
  elements.themeButton.addEventListener("click", cycleTheme);
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
    if (control && !event.altKey && event.key.toLocaleLowerCase() === "o") {
      event.preventDefault();
      post("open-file");
    } else if (control && !event.altKey &&
               event.key.toLocaleLowerCase() === "f") {
      event.preventDefault();
      elements.findInput.focus();
      elements.findInput.select();
    } else if (event.key === "F3") {
      event.preventDefault();
      moveSearch(event.shiftKey ? -1 : 1);
    } else if (control && !event.altKey &&
               event.key.toLocaleLowerCase() === "r") {
      event.preventDefault();
      post("reload");
    } else if (control && event.shiftKey &&
               event.key.toLocaleLowerCase() === "t") {
      event.preventDefault();
      cycleTheme();
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
    }
  });

  applyTheme("system", false);
  updateReadingProgress();
  post("ready");
}());
