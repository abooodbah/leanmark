#!/usr/bin/env node

// Dependency-free browser test for the shared reader page. It serves the
// staged reader assets on loopback, stands in for a native host through the
// WebView2 message bridge, and drives the page in a test-owned headless
// Chrome, Edge, or Chromium over the DevTools protocol.
//
// Usage: node tests/Invoke-ReaderBrowserSmoke.mjs --assets <staged assets dir>
//          [--browser <executable>] [--capture-dir <dir>] [--reduced-motion]
//
// --reduced-motion runs the page as a system with animations turned off,
// which Windows CI runners are already.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

function fail(message) {
  throw new Error(message);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  if (!process.argv[index + 1]) {
    fail(name + " requires a value.");
  }
  return process.argv[index + 1];
}

async function findBrowser() {
  const requested = argument("--browser") || process.env.LEANMARK_BROWSER;
  const candidates = requested ? [requested] : [];
  if (process.platform === "win32") {
    for (const root of [
      process.env["ProgramFiles(x86)"],
      process.env.ProgramFiles,
      process.env.LOCALAPPDATA,
    ].filter(Boolean)) {
      candidates.push(join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
      candidates.push(join(root, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/microsoft-edge",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    );
  }
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  fail("No supported Chrome, Edge, or Chromium executable was found.");
}

async function startAssetServer(root) {
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1/");
      const candidate = resolve(root, "." + decodeURIComponent(url.pathname));
      if (!candidate.startsWith(rootPrefix)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const content = await fs.readFile(candidate);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES.get(extname(candidate)) ||
          "application/octet-stream",
      });
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, origin: "http://127.0.0.1:" + server.address().port };
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.error) {
            pending.reject(new Error(JSON.stringify(message.error)));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) {
        listener(message.params || {});
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", resolveOpen, { once: true });
      socket.addEventListener("error", () =>
        rejectOpen(new Error("DevTools WebSocket connection failed.")), { once: true });
    });
    return new CdpClient(socket);
  }

  on(method, listener) {
    this.listeners.set(method, (this.listeners.get(method) || []).concat(listener));
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveResult, rejectResult) => {
      this.pending.set(id, { resolve: resolveResult, reject: rejectResult });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      fail("Page expression failed: " + JSON.stringify(result.exceptionDetails));
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(client, expression, description, seconds = 20) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression) === true) {
      return;
    }
    await delay(50);
  }
  fail("Timed out waiting for " + description + ".");
}

function check(condition, message) {
  if (!condition) {
    fail(message);
  }
  console.log("PASS " + message);
}

const KEYS = {
  "+": { code: "Equal", keyCode: 187, shift: true },
  "=": { code: "Equal", keyCode: 187 },
  "-": { code: "Minus", keyCode: 189 },
  "0": { code: "Digit0", keyCode: 48 },
  "1": { code: "Digit1", keyCode: 49 },
  Escape: { code: "Escape", keyCode: 27 },
  Tab: { code: "Tab", keyCode: 9 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  Enter: { code: "Enter", keyCode: 13 },
  L: { code: "KeyL", keyCode: 76, shift: true },
  T: { code: "KeyT", keyCode: 84, shift: true },
  "/": { code: "Slash", keyCode: 191 },
  F1: { code: "F1", keyCode: 112 },
};

async function press(client, key, { ctrl = false } = {}) {
  const info = KEYS[key];
  const modifiers = (ctrl ? 2 : 0) | (info.shift ? 8 : 0);
  for (const type of ["rawKeyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      type,
      key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
      nativeVirtualKeyCode: info.keyCode,
      modifiers,
    });
  }
}

async function clickSelector(client, selector) {
  const point = await client.evaluate(`(function () {
    var node = document.querySelector(${JSON.stringify(selector)});
    node.scrollIntoView({ block: "center" });
    var rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }())`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await client.send("Input.dispatchMouseEvent", {
      type, x: point.x, y: point.y, button: "left", clickCount: 1,
    });
  }
}

const IMAGES = {
  "wide.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300">' +
    '<rect width="800" height="300" fill="#1d4ed8"/>' +
    '<circle cx="400" cy="150" r="110" fill="#f8d66d"/></svg>',
  "badge.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20">' +
    '<rect width="80" height="20" fill="#3b82f6"/></svg>',
  "tiny.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
    '<rect width="16" height="16" fill="#b45309"/></svg>',
};

// The HTML MD4C produces for this Markdown; the reader never sees Markdown.
const DOCUMENT_HTML = [
  "<h1>Viewer fixture</h1>",
  '<p>An inline badge <img src="badge.svg" alt="badge"> stays in its line.</p>',
  "<h2>Deployment flow</h2>",
  '<pre><code class="language-mermaid">flowchart LR\n' +
    "    A[Merge] --&gt; B[Build and test]\n" +
    "    B --&gt; C{Healthy?}\n" +
    "    C --&gt;|yes| D[Promote]\n" +
    "    C --&gt;|no| E[Roll back]\n</code></pre>",
  "<h2>Pictures</h2>",
  '<p><img src="wide.svg" alt="Wide figure"></p>',
  '<p><a href="other.md"><img src="wide.svg?linked" alt="Linked figure"></a></p>',
  '<p><img src="tiny.svg" alt="tiny"></p>',
  "<h2>Searchable</h2>",
  "<p>needle one, needle two, needle three.</p>",
].join("\n");

// A typical document, as MD4C renders it, for the theme checks and screenshots.
const THEME_DOCUMENT_HTML = [
  "<h1>Release notes</h1>",
  "<p>This page is shown in every reader theme. It has <strong>bold</strong> " +
    'text, <a href="https://example.com/">a link</a>, and <code>inline code</code>.</p>',
  "<h2>Checklist</h2>",
  "<ul>\n<li>Build the reader</li>\n<li>Run the tests\n<ul>\n" +
    "<li>Core checks</li>\n</ul>\n</li>\n</ul>",
  "<ol>\n<li>Tag the release</li>\n<li>Publish it</li>\n</ol>",
  "<blockquote>\n<p>Read-only, offline, and quick to open.</p>\n</blockquote>",
  '<p><img src="missing-screenshot.png" alt="A screenshot that is not in the folder"></p>',
  "<h2>Code</h2>",
  '<pre><code class="language-js">function add(a, b) {\n  return a + b;\n}\n</code></pre>',
  "<h3>Platforms</h3>",
  "<table>\n<thead>\n<tr>\n<th>Platform</th>\n<th>Host</th>\n</tr>\n</thead>\n<tbody>\n" +
    "<tr>\n<td>Windows</td>\n<td>WebView2</td>\n</tr>\n" +
    "<tr>\n<td>Linux</td>\n<td>WebKitGTK</td>\n</tr>\n</tbody>\n</table>",
  "<h2>Flow</h2>",
  '<pre><code class="language-mermaid">flowchart LR\n' +
    "    A[Write] --&gt; B[Review]\n" +
    "    B --&gt; C{Ready?}\n" +
    "    C --&gt;|yes| D[Ship]\n</code></pre>",
].join("\n");

// The softer dark themes from issue #6. The reader must apply exactly these
// token values; they are the contract a later shared theme system reuses.
const SOFT_THEME_TOKENS = {
  dim: {
    "--canvas": "#1e2023",
    "--surface": "#25282c",
    "--surface-muted": "#2d3035",
    "--border": "#393d43",
    "--text-primary": "#c8ccd2",
    "--text-secondary": "#9ea4ac",
    "--link": "#86aee6",
    "--code-canvas": "#282b30",
    "--selection": "#34486a",
    "--find": "#5c4d1f",
    "--find-current": "#7a5317",
    "--find-text": "#e8e4dc",
    "--quote-rule": "#4a4f56",
  },
  dusk: {
    "--canvas": "#221e19",
    "--surface": "#29241e",
    "--surface-muted": "#322c25",
    "--border": "#3f3830",
    "--text-primary": "#d4c8b4",
    "--text-secondary": "#a99c87",
    "--link": "#e0a86e",
    "--code-canvas": "#2c2721",
    "--selection": "#4d3f2c",
    "--find": "#6a5420",
    "--find-current": "#82561c",
    "--find-text": "#f1e9db",
    "--quote-rule": "#574c3f",
  },
};

function parseColor(value) {
  const text = String(value).trim().toLowerCase();
  let match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(text);
  if (match) {
    return match.slice(1).map((part) => parseInt(part, 16));
  }
  match = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(text);
  if (match) {
    return match.slice(1).map(Number);
  }
  fail("Unreadable colour: " + value);
}

function luminance(value) {
  const [red, green, blue] = parseColor(value).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

// WCAG 2 contrast ratio between two opaque colours.
function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Reads the applied theme: token values and the colours elements really get.
const READ_THEME = `(function () {
  var root = document.documentElement;
  var rootStyle = getComputedStyle(root);
  var article = document.getElementById("article");
  var token = function (name) { return rootStyle.getPropertyValue(name).trim().toLowerCase(); };
  var style = function (selector) { return getComputedStyle(article.querySelector(selector)); };
  var names = ["--canvas", "--surface", "--surface-muted", "--border", "--text-primary",
    "--text-secondary", "--link", "--code-canvas", "--selection", "--find",
    "--find-current", "--find-text", "--quote-rule"];
  var tokens = {};
  names.forEach(function (name) { tokens[name] = token(name); });
  var node = article.querySelector("figure.diagram g.node");
  var shape = node && node.querySelector(".label-container, rect, polygon, path");
  var label = node && (node.querySelector(".nodeLabel") || node.querySelector("text"));
  var edge = article.querySelector("figure.diagram .flowchart-link, figure.diagram path.edge");
  return {
    attribute: root.getAttribute("data-theme"),
    button: document.getElementById("themeButton").textContent,
    tokens: tokens,
    canvas: getComputedStyle(document.body).backgroundColor,
    body: style("p").color,
    heading: style("h2").color,
    link: style("p a").color,
    inlineCode: style("p code").color,
    inlineCodeBackground: style("p code").backgroundColor,
    codeBlock: style("pre code").color,
    codeBlockBackground: style("pre").backgroundColor,
    cell: style("td").color,
    cellBorder: style("td").borderBottomColor,
    headerCell: style("th").color,
    headerCellBackground: style("th").backgroundColor,
    quote: style("blockquote").color,
    quoteRule: style("blockquote").borderLeftColor,
    blockedImage: style(".blocked-image").color,
    blockedImageBackground: style(".blocked-image").backgroundColor,
    diagramFill: shape ? getComputedStyle(shape).fill : "",
    diagramLabel: label ? (label.tagName.toLowerCase() === "text"
      ? getComputedStyle(label).fill : getComputedStyle(label).color) : "",
    diagramLine: edge ? getComputedStyle(edge).stroke : "",
    colorScheme: rootStyle.colorScheme,
    wordmark: getComputedStyle(document.querySelector(".wordmark")).backgroundColor,
    highlightColors: Array.from(document.styleSheets).flatMap(function (sheet) {
      return Array.from(sheet.cssRules);
    }).filter(function (rule) {
      return /^::highlight\\(leanmark-find(-current)?\\)$/.test(rule.selectorText || "");
    }).map(function (rule) { return rule.style.color; })
  };
}())`;

// Runs before reader.js: a stand-in for the WebView2 bridge that records what
// the reader posts and lets the test deliver host messages.
const HOST_STUB = `
  window.__posted = [];
  window.__listeners = [];
  window.chrome = window.chrome || {};
  window.chrome.webview = {
    postMessage: function (message) { window.__posted.push(String(message)); },
    addEventListener: function (type, listener) {
      if (type === "message") { window.__listeners.push(listener); }
    }
  };
  window.__deliver = function (data) {
    window.__listeners.forEach(function (listener) { listener({ data: data }); });
  };
`;

async function run() {
  const assetsArgument = argument("--assets");
  if (!assetsArgument) {
    fail("--assets <staged reader assets directory> is required.");
  }
  const assets = resolve(assetsArgument);
  await fs.access(join(assets, "reader.html"));
  await fs.access(join(assets, "vendor", "mermaid.min.js"));
  const captureDirectory = argument("--capture-dir");

  const { server, origin } = await startAssetServer(assets);
  const profile = await fs.mkdtemp(join(tmpdir(), "leanmark-reader-smoke-"));
  const browser = spawn(await findBrowser(), [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "--window-size=1200,900",
    // Chromium refuses to start its sandbox as root, as in some CI containers.
    ...(process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : []),
    "about:blank",
  ], { stdio: "ignore" });

  let client = null;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    const deadline = Date.now() + 20000;
    let port = "";
    while (!port && Date.now() < deadline) {
      try {
        port = (await fs.readFile(portFile, "utf8")).split("\n")[0].trim();
      } catch {
        await delay(75);
      }
    }
    if (!port) {
      fail("The headless browser did not expose DevTools.");
    }
    const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
    const page = targets.find((target) => target.type === "page");
    client = await CdpClient.connect(page.webSocketDebuggerUrl);

    const consoleErrors = [];
    client.on("Runtime.exceptionThrown", (event) =>
      consoleErrors.push(JSON.stringify(event.exceptionDetails)));
    client.on("Fetch.requestPaused", async (event) => {
      const name = new URL(event.request.url).pathname.slice(1);
      const body = IMAGES[name];
      await client.send(body ? "Fetch.fulfillRequest" : "Fetch.failRequest",
        body
          ? {
            requestId: event.requestId,
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "image/svg+xml" }],
            body: Buffer.from(body).toString("base64"),
          }
          : { requestId: event.requestId, errorReason: "Failed" });
    });
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Fetch.enable", {
      patterns: [{ urlPattern: "https://d1.doc.leanmark.invalid/*" }],
    });
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1200, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    if (process.argv.includes("--reduced-motion")) {
      await client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
    }
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: HOST_STUB });
    await client.send("Page.navigate", { url: origin + "/reader.html" });
    await waitFor(client, 'window.__posted && window.__posted.indexOf("ready") >= 0',
      "the reader to report ready");

    const deliver = (data) => client.evaluate(
      "window.__deliver(" + JSON.stringify(data) + "); true");
    const posted = () => client.evaluate("window.__posted.slice()");
    const clearPosted = () => client.evaluate("window.__posted.length = 0; true");

    await deliver({ type: "host", copySource: true, tabs: true });
    await deliver({
      type: "document",
      tabId: 1,
      theme: "dark",
      fileName: "viewer.md",
      path: "/fixtures/viewer.md",
      documentBaseUrl: "https://d1.doc.leanmark.invalid/",
      sourceBytes: 1014,
      hasMermaid: true,
      html: DOCUMENT_HTML,
    });
    await waitFor(client,
      'document.documentElement.dataset.renderState === "ready" && ' +
      '!!document.querySelector("#article figure.diagram svg") && ' +
      'document.querySelectorAll("#article .figure-frame-image[data-expandable]").length === 2',
      "the diagram and images to finish");

    // Expand buttons: one per rendered diagram and per standalone image
    // large enough to inspect. Inline and tiny images get none.
    const layout = await client.evaluate(`(function () {
      var article = document.getElementById("article");
      var button = article.querySelector(".figure-frame-diagram .expand-figure");
      var figure = article.querySelector("figure.diagram");
      var b = button.getBoundingClientRect();
      var f = figure.getBoundingClientRect();
      return {
        diagramFrames: article.querySelectorAll(".figure-frame-diagram[data-expandable]").length,
        imageFrames: article.querySelectorAll(".figure-frame-image").length,
        expandableImages: article.querySelectorAll(".figure-frame-image[data-expandable]").length,
        visibleButtons: Array.from(article.querySelectorAll(".expand-figure")).filter(function (node) {
          return getComputedStyle(node).display !== "none";
        }).length,
        badgeFramed: !!article.querySelector('img[alt="badge"]').closest(".figure-frame"),
        linkedFrameWrapsLink: !!article.querySelector(".figure-frame-image > a > img"),
        opacity: Number(getComputedStyle(button).opacity),
        rightGap: f.right - b.right,
        bottomGap: f.bottom - b.bottom,
        buttonText: button.textContent,
        copyButtons: article.querySelectorAll(".copy-section").length,
        outline: document.querySelectorAll("#outlineList a").length
      };
    }())`);
    check(layout.diagramFrames === 1, "a rendered diagram gets an expand button");
    // Five boxes in one row: if Mermaid measured its labels mid-transition,
    // this comes out roughly square instead of several times wider than tall.
    const shape = await client.evaluate(
      'document.querySelector("#article figure.diagram svg").viewBox.baseVal.width / ' +
      'document.querySelector("#article figure.diagram svg").viewBox.baseVal.height');
    check(shape > 2.5, "Mermaid lays out the left-to-right flowchart correctly (" +
      shape.toFixed(2) + ":1)");
    check(layout.imageFrames === 3 && layout.expandableImages === 2,
      "standalone images get a frame, and only large ones an expand button");
    check(layout.visibleButtons === 3, "exactly three expand buttons are shown");
    check(!layout.badgeFramed, "an inline image keeps its place in the line");
    check(layout.linkedFrameWrapsLink, "a linked image is framed together with its link");
    check(layout.opacity > 0.3 && layout.opacity < 0.8,
      "the expand button is semi-transparent at rest");
    check(layout.rightGap >= 0 && layout.rightGap < 16 &&
      layout.bottomGap >= 0 && layout.bottomGap < 16,
      "the expand button sits in the figure's bottom-right corner");
    check(layout.buttonText === "", "the expand button adds no text to search or copy");
    check(layout.copyButtons === 4 && layout.outline === 3,
      "headings still get copy buttons and an outline");

    // Page zoom shortcuts go to the host, which owns the zoom level.
    await clearPosted();
    await press(client, "=", { ctrl: true });
    await press(client, "+", { ctrl: true });
    await press(client, "-", { ctrl: true });
    await press(client, "0", { ctrl: true });
    check(JSON.stringify(await posted()) ===
      JSON.stringify(["zoom|in", "zoom|in", "zoom|out", "zoom|reset"]),
      "Ctrl+= / Ctrl++ / Ctrl+- / Ctrl+0 ask the host to zoom the page");
    await deliver({ type: "zoom", percent: 125 });
    check(await client.evaluate(
      '!document.getElementById("zoomIndicator").hidden && ' +
      'document.getElementById("zoomIndicator").textContent === "Zoom 125%"'),
      "the host's new zoom level is shown briefly");
    await waitFor(client, 'document.getElementById("zoomIndicator").hidden',
      "the zoom indicator to fade", 5);

    // Expanding a diagram moves its SVG into the viewer at a fitted size.
    await clickSelector(client, ".figure-frame-diagram .expand-figure");
    const opened = await client.evaluate(`(function () {
      var viewer = document.getElementById("figureViewer");
      var svg = document.querySelector("#viewerCanvas > svg");
      return {
        visible: !viewer.hidden,
        moved: !!svg && !document.querySelector("#article figure.diagram svg"),
        placeholder: !!document.querySelector("#article .viewer-placeholder"),
        width: svg ? svg.getBoundingClientRect().width : 0,
        height: svg ? svg.getBoundingClientRect().height : 0,
        stage: document.getElementById("viewerStage").clientWidth,
        stageHeight: document.getElementById("viewerStage").clientHeight,
        focused: document.activeElement === document.getElementById("viewerStage"),
        state: window.LeanMarkTest.viewerState(),
        level: document.getElementById("viewerLevel").textContent,
        title: document.getElementById("viewerTitle").textContent
      };
    }())`);
    check(opened.visible && opened.moved && opened.placeholder,
      "the expand button opens the viewer with the diagram moved, not copied");
    // Fitted means one dimension fills the stage, less its padding, unless
    // the 4x enlargement cap was reached first.
    const fills = Math.abs(opened.width - (opened.stage - 48)) < 2 ||
      Math.abs(opened.height - (opened.stageHeight - 48)) < 2 ||
      Math.abs(opened.state.scale - 4) < 0.001;
    check(opened.state.mode === "fit" && fills,
      "the expanded diagram is scaled to fit the window (" +
      JSON.stringify(opened) + ")");
    check(opened.focused, "the viewer takes keyboard focus");
    check(opened.level === Math.round(opened.state.scale * 100) + "%",
      "the viewer shows its zoom level");
    if (captureDirectory) {
      await fs.mkdir(resolve(captureDirectory), { recursive: true });
      const shot = await client.send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(join(resolve(captureDirectory), "reader-viewer.png"),
        Buffer.from(shot.data, "base64"));
    }

    const fitScale = opened.state.scale;
    await clearPosted();
    await press(client, "1");
    check((await client.evaluate("window.LeanMarkTest.viewerState()")).scale === 1,
      "1 shows the diagram at actual size");
    await press(client, "+");
    check((await client.evaluate("window.LeanMarkTest.viewerState()")).scale === 1.25,
      "+ zooms the diagram one level in");
    await press(client, "=", { ctrl: true });
    check((await client.evaluate("window.LeanMarkTest.viewerState()")).scale === 1.5,
      "Ctrl+= zooms the diagram, not the page, while expanded");
    await press(client, "-");
    await press(client, "-");
    await press(client, "-");
    check((await client.evaluate("window.LeanMarkTest.viewerState()")).scale === 0.75,
      "- zooms the diagram out through the levels");
    await press(client, "0");
    const refit = await client.evaluate("window.LeanMarkTest.viewerState()");
    check(refit.mode === "fit" && Math.abs(refit.scale - fitScale) < 0.001,
      "0 fits the diagram to the window again");
    check((await posted()).every((message) => !message.startsWith("zoom|")),
      "zoom keys inside the viewer never reach the page zoom");

    for (let step = 0; step < 4; step += 1) {
      await press(client, "+");
    }
    const panned = await client.evaluate(`(function () {
      var stage = document.getElementById("viewerStage");
      var before = stage.scrollLeft;
      return before;
    }())`);
    await press(client, "ArrowRight");
    await press(client, "ArrowDown");
    const afterPan = await client.evaluate(`(function () {
      var stage = document.getElementById("viewerStage");
      return [stage.scrollLeft, stage.scrollTop, stage.scrollWidth, stage.clientWidth,
        stage.scrollHeight, stage.clientHeight, window.LeanMarkTest.viewerState().scale,
        document.activeElement && document.activeElement.id,
        (function () {
          var svg = document.querySelector("#viewerCanvas > svg");
          var canvas = document.getElementById("viewerCanvas");
          var rect = svg ? svg.getBoundingClientRect() : null;
          return svg ? {
            style: svg.getAttribute("style"),
            viewBox: svg.getAttribute("viewBox"),
            width: svg.getAttribute("width"),
            rect: [rect.width, rect.height],
            maxWidth: getComputedStyle(svg).maxWidth,
            maxHeight: getComputedStyle(svg).maxHeight,
            computed: ["width", "height", "display", "position", "transform", "zoom",
              "box-sizing", "padding"].map(function (name) {
              return name + "=" + getComputedStyle(svg).getPropertyValue(name);
            }).join("; "),
            canvasComputed: ["width", "height", "display", "flex", "margin"].map(function (name) {
              return name + "=" + getComputedStyle(canvas).getPropertyValue(name);
            }).join("; "),
            sizeRules: (function () {
              var found = [];
              Array.from(document.styleSheets).forEach(function (sheet) {
                var rules;
                try { rules = sheet.cssRules; } catch (_error) { return; }
                (function walk(list) {
                  Array.from(list || []).forEach(function (rule) {
                    if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); return; }
                    if (!rule.selectorText || !rule.style) { return; }
                    var matches = false;
                    try { matches = svg.matches(rule.selectorText); } catch (_error) { }
                    if (matches && /width|height|zoom|scale|transform/.test(rule.style.cssText)) {
                      found.push(rule.selectorText + " {" + rule.style.cssText + "}");
                    }
                  });
                }(rules));
              });
              return found;
            }()),
            inlineWidthPriority: svg.style.getPropertyPriority("width"),
            attrs: Array.from(svg.attributes).map(function (a) { return a.name; }).join(","),
            outer: (function () {
              var copy = svg.cloneNode(true);
              copy.querySelectorAll("style").forEach(function (node) { node.remove(); });
              return copy.outerHTML.slice(0, 2500);
            }()),
            canvas: [canvas.offsetWidth, canvas.offsetHeight, canvas.offsetLeft]
          } : null;
        }())];
    }())`);
    // Each axis that overflows must have moved; at least one must overflow.
    const overflowsX = afterPan[2] > afterPan[3];
    const overflowsY = afterPan[4] > afterPan[5];
    check((overflowsX || overflowsY) &&
      (!overflowsX || afterPan[0] > panned) && (!overflowsY || afterPan[1] > 0),
      "arrow keys pan a zoomed diagram (before " + panned + ", after " +
      JSON.stringify(afterPan) + ")");

    const pageScroll = await client.evaluate("window.scrollY");
    for (const y of [40, 500]) {
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseWheel", x: 600, y, deltaX: 0, deltaY: 400,
      });
    }
    await delay(300);
    check(await client.evaluate("window.scrollY") === pageScroll,
      "the wheel inside the viewer never scrolls the page behind it");

    await deliver({ type: "zoom-command", action: "out" });
    check((await client.evaluate("window.LeanMarkTest.viewerState()")).mode === "zoom" &&
      (await posted()).length === 0,
      "a native zoom menu command zooms the open viewer");

    await press(client, "Tab");
    await press(client, "Tab");
    check(await client.evaluate(
      'document.getElementById("figureViewer").contains(document.activeElement)'),
      "Tab keeps focus inside the viewer");

    await press(client, "Escape");
    const closed = await client.evaluate(`(function () {
      var svg = document.querySelector("#article figure.diagram > svg");
      return {
        hidden: document.getElementById("figureViewer").hidden,
        restored: !!svg && !document.querySelector(".viewer-placeholder"),
        styleRestored: svg && svg.style.width === "" && svg.style.maxWidth !== "none",
        focus: document.activeElement &&
          document.activeElement.classList.contains("expand-figure")
      };
    }())`);
    check(closed.hidden && closed.restored && closed.styleRestored,
      "Escape closes the viewer and returns the diagram unchanged");
    check(closed.focus, "focus returns to the expand button");

    // Images open the same way; a backdrop click closes the viewer.
    await clickSelector(client, ".figure-frame-image[data-expandable] .expand-figure");
    const image = await client.evaluate(`(function () {
      var img = document.querySelector("#viewerCanvas > img");
      return {
        open: !!img,
        title: document.getElementById("viewerTitle").textContent,
        state: window.LeanMarkTest.viewerState()
      };
    }())`);
    check(image.open && image.title === "Wide figure",
      "a standalone image opens in the viewer under its alt text");
    check(image.state.mode === "fit" && image.state.scale > 1,
      "an SVG image is enlarged to fit like a diagram (" +
      JSON.stringify(image.state) + ")");
    for (const type of ["mousePressed", "mouseReleased"]) {
      await client.send("Input.dispatchMouseEvent", {
        type, x: 20, y: 880, button: "left", clickCount: 1,
      });
    }
    check(await client.evaluate('document.getElementById("figureViewer").hidden && ' +
      '!!document.querySelector("#article .figure-frame-image img")'),
      "clicking the backdrop closes the viewer and restores the image");

    // Clicking the linked image's button opens the viewer, not the link.
    await clearPosted();
    await clickSelector(client, ".figure-frame-image:nth-of-type(1)");
    await client.evaluate(
      'document.querySelectorAll("#article .figure-frame-image[data-expandable] .expand-figure")[1].click(); true');
    check(await client.evaluate('!document.getElementById("figureViewer").hidden') &&
      (await posted()).every((message) => !message.startsWith("open-link")),
      "the expand button on a linked image does not follow the link");

    // A live reload or theme change closes the viewer first.
    await deliver({ type: "theme", value: "light" });
    await waitFor(client,
      'document.documentElement.dataset.renderState === "ready" && ' +
      'document.getElementById("figureViewer").hidden && ' +
      '!document.querySelector(".viewer-placeholder")',
      "a theme change to close the viewer and redraw");

    // Find runs after a pause in typing, or at once on Enter.
    await client.evaluate(
      'var input = document.getElementById("findInput"); input.focus(); ' +
      'input.value = "needle"; input.dispatchEvent(new Event("input")); true');
    await press(client, "Enter");
    check(await client.evaluate('document.getElementById("findCount").textContent') === "1/3",
      "Enter runs a pending search immediately");
    await press(client, "Escape");

    // Themes. The theme button cycles through every theme, and each choice
    // goes to the host, which saves it.
    await deliver({
      type: "document", tabId: 1, theme: "system", fileName: "themes.md",
      path: "/fixtures/themes.md", documentBaseUrl: "", sourceBytes: 900,
      hasMermaid: true, html: THEME_DOCUMENT_HTML,
    });
    await waitFor(client, 'document.documentElement.dataset.renderState === "ready" && ' +
      '!!document.querySelector("#article figure.diagram svg")', "the theme document");
    await clearPosted();
    const labels = [];
    for (let step = 0; step < 5; step += 1) {
      await clickSelector(client, "#themeButton");
      labels.push(await client.evaluate('document.getElementById("themeButton").textContent'));
    }
    check(JSON.stringify(labels) === JSON.stringify(["Light", "Dark", "Dim", "Dusk", "System"]),
      "the theme button cycles System, Light, Dark, Dim, Dusk (" + labels.join(", ") + ")");
    check(JSON.stringify(await posted()) === JSON.stringify(
      ["theme|light", "theme|dark", "theme|dim", "theme|dusk", "theme|system"]),
      "each theme choice is sent to the host to be saved");

    const applyTheme = async (name) => {
      await deliver({ type: "theme", value: name });
      await waitFor(client, 'document.documentElement.dataset.renderState === "ready" && ' +
        '!!document.querySelector("#article figure.diagram svg")', "the " + name + " theme");
      return client.evaluate(READ_THEME);
    };
    const readings = {};
    for (const name of ["light", "dark", "dim", "dusk"]) {
      readings[name] = await applyTheme(name);
      if (captureDirectory) {
        await fs.mkdir(resolve(captureDirectory), { recursive: true });
        const metrics = await client.send("Page.getLayoutMetrics");
        const size = metrics.cssContentSize || metrics.contentSize;
        const shot = await client.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
        });
        await fs.writeFile(join(resolve(captureDirectory), "theme-" + name + ".png"),
          Buffer.from(shot.data, "base64"));
      }
    }

    // Contrast of each part of the page, printed for every theme.
    const ratios = {};
    for (const [name, r] of Object.entries(readings)) {
      ratios[name] = {
        body: contrast(r.body, r.canvas),
        headings: contrast(r.heading, r.canvas),
        links: contrast(r.link, r.canvas),
        inlineCode: contrast(r.inlineCode, r.inlineCodeBackground),
        codeBlock: contrast(r.codeBlock, r.codeBlockBackground),
        tableText: contrast(r.cell, r.canvas),
        tableHeader: contrast(r.headerCell, r.headerCellBackground),
        tableBorder: contrast(r.cellBorder, r.canvas),
        blockquote: contrast(r.quote, r.canvas),
        quoteRule: contrast(r.quoteRule, r.canvas),
        blockedImage: contrast(r.blockedImage, r.blockedImageBackground),
        selection: contrast(r.tokens["--text-primary"], r.tokens["--selection"]),
        find: contrast(r.tokens["--find-text"], r.tokens["--find"]),
        findCurrent: contrast(r.tokens["--find-text"], r.tokens["--find-current"]),
        diagramLabel: r.diagramLabel && r.diagramFill && r.diagramFill !== "none"
          ? contrast(r.diagramLabel, r.diagramFill) : NaN,
        diagramLine: r.diagramLine && r.diagramLine !== "none"
          ? contrast(r.diagramLine, r.canvas) : NaN,
      };
    }
    console.log("Contrast ratios (WCAG 2):");
    for (const part of Object.keys(ratios.dim)) {
      console.log("  " + part.padEnd(13) + Object.keys(ratios).map((name) =>
        (name + " " + ratios[name][part].toFixed(2)).padEnd(13)).join(""));
    }

    // The note shown in place of an image that cannot load follows the theme:
    // it sits on the theme's muted surface in its secondary text colour, so a
    // dark theme does not show a bright light box, and it stays readable.
    for (const [name, r] of Object.entries(readings)) {
      check(parseColor(r.blockedImageBackground).join() ===
          parseColor(r.tokens["--surface-muted"]).join() &&
        parseColor(r.blockedImage).join() === parseColor(r.tokens["--text-secondary"]).join() &&
        ratios[name].blockedImage >= 4.5,
        "the image-unavailable note in " + name + " uses the theme's surface and text (" +
        r.blockedImageBackground + " / " + r.blockedImage + ", " +
        ratios[name].blockedImage.toFixed(2) + ":1)");
    }

    check(readings.dark.tokens["--canvas"] === "#0e0d0b" &&
      readings.dark.tokens["--text-primary"] === "#faf9f7" &&
      readings.light.tokens["--canvas"] === "#faf9f7" &&
      readings.light.tokens["--text-primary"] === "#1a1917",
      "the existing light and dark themes keep their colours");
    check(["light", "dark"].every((name) =>
      parseColor(readings[name].quoteRule).join() === parseColor("#d5cfc3").join() &&
      readings[name].tokens["--find-text"] === "#0e0d0b"),
      "light and dark keep their quote rule and find text colours");
    check(Object.keys(readings).every((name) =>
      readings[name].highlightColors.join() === "var(--find-text),var(--find-text)"),
      "find highlights take their text colour from the theme");
    check(["dim", "dusk"].every((name) =>
      parseColor(readings[name].wordmark).join() ===
        parseColor(readings[name].tokens["--text-primary"]).join()),
      "the toolbar mark follows the soft themes (" +
      readings.dim.wordmark + ", " + readings.dusk.wordmark + ")");
    for (const name of ["dim", "dusk"]) {
      const r = readings[name];
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      check(r.attribute === name && r.button === label,
        "the " + name + " theme is selectable and named " + label);
      check(r.colorScheme === "dark",
        "the " + name + " theme gives dark scrollbars and controls");
      const wrong = Object.entries(SOFT_THEME_TOKENS[name])
        .filter(([token, value]) => r.tokens[token] !== value)
        .map(([token, value]) => token + " is " + r.tokens[token] + ", expected " + value);
      check(wrong.length === 0, "the " + name + " theme applies its token values" +
        (wrong.length ? ": " + wrong.join("; ") : ""));
      const expected = SOFT_THEME_TOKENS[name];
      const same = (a, b) => parseColor(a).join() === parseColor(b).join();
      check(same(r.canvas, expected["--canvas"]) && same(r.body, expected["--text-primary"]) &&
        same(r.link, expected["--link"]) && same(r.codeBlockBackground, expected["--code-canvas"]) &&
        same(r.cellBorder, expected["--border"]) && same(r.quote, expected["--text-secondary"]) &&
        same(r.quoteRule, expected["--quote-rule"]),
        "the " + name + " tokens reach the page, code, tables, and quotes");
      const text = ["body", "headings", "links", "inlineCode", "codeBlock", "tableText",
        "tableHeader", "blockquote", "selection", "find", "findCurrent", "diagramLabel"];
      const low = text.filter((part) => !(ratios[name][part] >= 4.5));
      check(low.length === 0, "every kind of text in " + name + " meets WCAG AA 4.5:1" +
        (low.length ? "; below: " + low.map((part) => part + " " +
          ratios[name][part].toFixed(2)).join(", ") : ""));
      check(ratios[name].body <= ratios.dark.body * 0.65,
        "the " + name + " body text is clearly softer than dark (" +
        ratios[name].body.toFixed(2) + " against " + ratios.dark.body.toFixed(2) + ")");
      check(same(r.diagramFill, r.tokens["--surface-muted"]) &&
        same(r.diagramLabel, r.tokens["--text-primary"]),
        "Mermaid diagrams in " + name + " are drawn with its tokens");
    }

    // Leaving a soft theme gives the built-in Mermaid look back unchanged.
    const darkAgain = await applyTheme("dark");
    check(darkAgain.diagramFill === readings.dark.diagramFill &&
      darkAgain.diagramLabel === readings.dark.diagramLabel,
      "diagrams look the same in dark after a soft theme was shown");

    // A chosen theme wins over the system setting, in both directions.
    const mediaFeatures = (scheme) => [{ name: "prefers-color-scheme", value: scheme }]
      .concat(process.argv.includes("--reduced-motion")
        ? [{ name: "prefers-reduced-motion", value: "reduce" }] : []);
    await client.send("Emulation.setEmulatedMedia", { features: mediaFeatures("dark") });
    const dimOnDark = await applyTheme("dim");
    const duskOnDark = await applyTheme("dusk");
    check(dimOnDark.tokens["--canvas"] === "#1e2023" &&
      duskOnDark.tokens["--text-primary"] === "#d4c8b4" &&
      parseColor(dimOnDark.wordmark).join() === parseColor("#c8ccd2").join() &&
      parseColor(duskOnDark.wordmark).join() === parseColor("#d4c8b4").join(),
      "the soft themes keep their colours when the system is dark");
    check((await applyTheme("system")).tokens["--canvas"] === "#0e0d0b",
      "the system theme still follows a dark system");
    await client.send("Emulation.setEmulatedMedia", { features: mediaFeatures("light") });
    check((await applyTheme("dim")).tokens["--canvas"] === "#1e2023",
      "the soft themes keep their colours when the system is light");

    // An unknown theme from a host or an old setting falls back to System.
    const unknown = await applyTheme("neon");
    check(unknown.attribute === null && unknown.button === "System" &&
      unknown.tokens["--canvas"] === "#faf9f7",
      "an unknown theme falls back to the system theme");
    await client.send("Emulation.setEmulatedMedia", {
      features: process.argv.includes("--reduced-motion")
        ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
    });

    // Text width, the settings panel, the theme dot, and zoom that leaves the
    // toolbar alone (issue #6 follow-up). The column widths are the contract:
    // Narrow is the 0.5.0 column, Wide is 960 px, Full is the window less the
    // page padding.
    const NARROW_PX = 720;
    const WIDE_PX = 960;
    const PAGE_PADDING_PX = 32;
    const setViewport = (width, height = 900) =>
      client.send("Emulation.setDeviceMetricsOverride", {
        width, height, deviceScaleFactor: 1, mobile: false,
      });
    const showWidthDocument = async (host = {}) => {
      await deliver(Object.assign({ type: "host", copySource: true, tabs: true }, host));
      await deliver({
        type: "document", tabId: 1, theme: "light", fileName: "themes.md",
        path: "/fixtures/themes.md", documentBaseUrl: "", sourceBytes: 900,
        hasMermaid: true, html: THEME_DOCUMENT_HTML,
      });
      await waitFor(client, 'document.documentElement.dataset.renderState === "ready" && ' +
        '!!document.querySelector("#article figure.diagram svg")', "the width document");
    };
    const COLUMN = `(function () {
      var main = document.getElementById("mainContent").getBoundingClientRect();
      var pane = document.getElementById("readerPane");
      var style = getComputedStyle(pane);
      var zoom = Number(document.documentElement.dataset.zoom || "100") / 100;
      var outline = document.getElementById("outline");
      var sideColumns = getComputedStyle(outline).display === "none" ? 0
        : 2 * (220 + parseFloat(style.columnGap));
      return {
        width: main.width,
        full: (pane.clientWidth / zoom - parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight) - sideColumns) * zoom,
        padding: parseFloat(style.paddingLeft),
        attribute: document.documentElement.dataset.width,
        scroll: document.documentElement.scrollWidth - window.innerWidth
      };
    }())`;

    await setViewport(1800);
    await showWidthDocument({ zoom: 100, width: "narrow" });
    let column = await client.evaluate(COLUMN);
    check(Math.round(column.width) === NARROW_PX && column.attribute === "narrow",
      "Narrow is the 0.5.0 column of " + NARROW_PX + " px (" + column.width + ")");
    check(column.padding === PAGE_PADDING_PX,
      "the page keeps its " + PAGE_PADDING_PX + " px side padding");
    await clearPosted();
    await press(client, "L", { ctrl: true });
    column = await client.evaluate(COLUMN);
    check(Math.round(column.width) === WIDE_PX && column.attribute === "wide",
      "Ctrl+Shift+L widens the column to Wide, " + WIDE_PX + " px (" + column.width + ")");
    await press(client, "L", { ctrl: true });
    column = await client.evaluate(COLUMN);
    check(column.attribute === "full" && Math.abs(column.width - column.full) < 1,
      "Ctrl+Shift+L again gives Full, the window less its padding (" +
      column.width + " of " + column.full + ")");
    await press(client, "L", { ctrl: true });
    column = await client.evaluate(COLUMN);
    check(Math.round(column.width) === NARROW_PX && column.attribute === "narrow",
      "a third Ctrl+Shift+L returns to Narrow");
    check(JSON.stringify(await posted()) ===
      JSON.stringify(["width|wide", "width|full", "width|narrow"]),
      "each width choice is sent to the host to be saved");
    await clearPosted();
    await deliver({ type: "width", value: "wide" });
    check(Math.round((await client.evaluate(COLUMN)).width) === WIDE_PX &&
      (await posted()).length === 0,
      "a width from the host is applied without being sent back");
    await showWidthDocument({ width: "huge" });
    check((await client.evaluate(COLUMN)).attribute === "narrow",
      "an unknown saved width falls back to Narrow");
    await showWidthDocument({ width: "full" });
    check((await client.evaluate(COLUMN)).attribute === "full",
      "the saved width arrives with the host's first message");
    await setViewport(1000);
    column = await client.evaluate(COLUMN);
    check(Math.abs(column.width - column.full) < 1 && column.scroll <= 0,
      "Full fills a narrower window too, with no sideways scroll");

    // Zoom. The host keeps its web view at 100% and the page zooms only the
    // document, so the toolbar and tabs keep their size.
    await setViewport(1200);
    await showWidthDocument({ zoom: 100, width: "narrow" });
    await deliver({ type: "tabs", active: 1, tabs: [
      { id: 1, name: "themes.md", path: "/fixtures/themes.md" },
      { id: 2, name: "other.md", path: "/fixtures/other.md" },
    ] });
    const CHROME_AND_CONTENT = `(function () {
      var rect = function (selector) {
        var node = document.querySelector(selector);
        return node ? node.getBoundingClientRect() : null;
      };
      return {
        topbar: rect(".topbar").height,
        tabs: rect("#tabStrip").height,
        find: rect("#findInput").height,
        open: rect("#openButton").width,
        buttonFont: getComputedStyle(document.getElementById("openButton")).fontSize,
        heading: rect("#article h1").height,
        paragraph: rect("#article p").height,
        zoom: document.documentElement.dataset.zoom,
        indicator: !document.getElementById("zoomIndicator").hidden
      };
    }())`;
    const before = await client.evaluate(CHROME_AND_CONTENT);
    await deliver({ type: "zoom", percent: 200 });
    const zoomed = await client.evaluate(CHROME_AND_CONTENT);
    check(zoomed.zoom === "200", "the page applies the host's zoom level itself");
    check(zoomed.topbar === before.topbar && zoomed.tabs === before.tabs &&
      zoomed.find === before.find && zoomed.open === before.open &&
      zoomed.buttonFont === before.buttonFont,
      "at 200% the toolbar and tabs keep their size (" + JSON.stringify(before) +
      " then " + JSON.stringify(zoomed) + ")");
    check(zoomed.heading / before.heading > 1.9 && zoomed.heading / before.heading < 2.1 &&
      zoomed.paragraph > before.paragraph * 1.5,
      "at 200% the document text is twice as large");
    for (const name of ["narrow", "wide", "full"]) {
      await deliver({ type: "width", value: name });
      const contained = await client.evaluate(`(function () {
        var right = window.innerWidth + 0.5;
        var parts = Array.from(document.querySelectorAll(
          "#article pre, #article table, #article figure.diagram svg, #article img, #article p"));
        return {
          scroll: document.documentElement.scrollWidth - window.innerWidth,
          outside: parts.filter(function (node) {
            return node.getBoundingClientRect().right > right;
          }).map(function (node) { return node.tagName; })
        };
      }())`);
      check(contained.scroll <= 0 && contained.outside.length === 0,
        "at 200% " + name + " keeps code, tables, figures, and images in the window " +
        JSON.stringify(contained));
    }
    await deliver({ type: "width", value: "narrow" });
    check(await client.evaluate(
      'getComputedStyle(document.getElementById("outline")).display === "none"'),
      "the outline makes room when zoom leaves too little width for it");

    // The saved level from 0.5.0 arrives with the host's first message and
    // means the same text size; it is applied without the zoom flash.
    await waitFor(client, 'document.getElementById("zoomIndicator").hidden',
      "the zoom indicator to fade", 5);
    await showWidthDocument({ zoom: 125, width: "narrow" });
    const restored = await client.evaluate(CHROME_AND_CONTENT);
    check(restored.zoom === "125" && !restored.indicator &&
      Math.abs(restored.heading / before.heading - 1.25) < 0.06,
      "a saved 125% zoom loads at the same text size, without the indicator");

    // Find, the outline, and the scroll position still work when zoomed. A
    // jump from the outline lands the heading where it lands at 100%.
    await setViewport(1800);
    const jumpTo = async (percent) => {
      await deliver({ type: "zoom", percent });
      await waitFor(client, 'document.getElementById("zoomIndicator").hidden',
        "the zoom indicator to fade", 5);
      await client.evaluate('window.scrollTo(0, 0); true');
      await client.evaluate(`(function () {
        Array.from(document.querySelectorAll("#outlineList a")).find(function (a) {
          return a.textContent === "Checklist";
        }).click();
        return true;
      }())`);
      await delay(300);
      return client.evaluate(`(function () {
        var heading = Array.from(document.querySelectorAll("#article h2")).find(function (h) {
          return h.textContent.indexOf("Checklist") >= 0;
        });
        return {
          top: Math.round(heading.getBoundingClientRect().top),
          chrome: Math.round(document.querySelector(".chrome").getBoundingClientRect().bottom),
          scrollY: Math.round(scrollY),
          maxScroll: document.documentElement.scrollHeight - innerHeight
        };
      }())`);
    };
    const jumpActual = await jumpTo(100);
    const jumpZoomed = await jumpTo(125);
    check(jumpActual.scrollY > 0 && jumpZoomed.scrollY > 0 &&
      jumpZoomed.top > jumpZoomed.chrome && Math.abs(jumpZoomed.top - jumpActual.top) <= 2,
      "at 125% the outline jumps to a heading in the same place below the toolbar " +
      JSON.stringify({ actual: jumpActual, zoomed: jumpZoomed }));
    await client.evaluate(
      'var input = document.getElementById("findInput"); input.focus(); ' +
      'input.value = "Publish"; input.dispatchEvent(new Event("input")); true');
    await press(client, "Enter");
    check(await client.evaluate('document.getElementById("findCount").textContent') === "1/1",
      "find still counts matches when zoomed");
    await press(client, "Escape");
    await setViewport(1200, 500);
    await client.evaluate(
      'window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2); true');
    const ratioBefore = await client.evaluate(
      'scrollY / (document.documentElement.scrollHeight - innerHeight)');
    await deliver({ type: "zoom", percent: 150 });
    const ratioAfter = await client.evaluate(
      'scrollY / (document.documentElement.scrollHeight - innerHeight)');
    check(Math.abs(ratioAfter - ratioBefore) < 0.05,
      "a zoom change keeps the reading position (" + ratioBefore.toFixed(3) + " then " +
      ratioAfter.toFixed(3) + ")");
    await deliver({ type: "zoom", percent: 100 });
    await waitFor(client, 'document.getElementById("zoomIndicator").hidden',
      "the zoom indicator to fade", 5);
    await setViewport(1200);

    // The theme button shows a dot in a fixed colour per theme, all five
    // different, and names the theme for screen readers and the tooltip.
    const SWATCH = { light: "#ffffff", dark: "#000000", dim: "#7f8a99", dusk: "#c98f4f" };
    const SWATCH_RING = "#8c8c8c";
    const THEME_COLOURS = {
      light: { canvas: "#faf9f7", text: "#1a1917", name: "Light" },
      dark: { canvas: "#0e0d0b", text: "#faf9f7", name: "Dark" },
      dim: { canvas: "#1e2023", text: "#c8ccd2", name: "Dim" },
      dusk: { canvas: "#221e19", text: "#d4c8b4", name: "Dusk" },
    };
    const DOT = `(function () {
      var button = document.getElementById("themeButton");
      var dot = button.querySelector(".theme-swatch");
      var style = dot ? getComputedStyle(dot) : null;
      var rect = dot ? dot.getBoundingClientRect() : null;
      return dot ? {
        background: style.backgroundColor,
        image: style.backgroundImage,
        border: style.borderTopColor,
        borderWidth: parseFloat(style.borderTopWidth),
        size: [rect.width, rect.height],
        label: button.getAttribute("aria-label"),
        title: button.title
      } : null;
    }())`;
    const same = (a, b) => parseColor(a).join() === parseColor(b).join();
    await deliver({ type: "theme", value: "system" });
    await clearPosted();
    const seenDots = new Set();
    for (const name of ["light", "dark", "dim", "dusk", "system"]) {
      await press(client, "T", { ctrl: true });
      const dot = await client.evaluate(DOT);
      const label = name === "system" ? "System (Light)" : THEME_COLOURS[name].name;
      const looks = name === "system"
        ? dot && /linear-gradient/.test(dot.image) &&
          /255, 255, 255/.test(dot.image) && /0, 0, 0/.test(dot.image)
        : dot && dot.image === "none" && same(dot.background, SWATCH[name]);
      check(looks && same(dot.border, SWATCH_RING),
        "the theme dot shows " + label + "'s own colour " + JSON.stringify(dot));
      seenDots.add(dot.image === "none" ? dot.background : dot.image);
      check(dot.size[0] === 10 && dot.size[1] === dot.size[0] &&
        dot.borderWidth > 0 && dot.borderWidth <= 1.5,
        "the " + label + " dot is a small round mark with a thin border");
      check(dot.label.indexOf("Theme: " + label) === 0 &&
        dot.title === "Theme: " + label + " (Ctrl+Shift+T)",
        "the theme button names " + label + " in its accessible name and tooltip (" +
        dot.label + " / " + dot.title + ")");
    }
    check(seenDots.size === 5, "the five theme dots all look different " + JSON.stringify([...seenDots]));
    check(JSON.stringify(await posted()) === JSON.stringify(
      ["theme|light", "theme|dark", "theme|dim", "theme|dusk", "theme|system"]),
      "Ctrl+Shift+T still saves each theme through the host");

    // The settings panel: one button, Ctrl+/ or F1, Esc to close.
    const PANEL = `(function () {
      var panel = document.getElementById("settingsPanel");
      var button = document.getElementById("settingsButton");
      return {
        open: !!panel && !panel.hidden,
        expanded: button && button.getAttribute("aria-expanded"),
        focusInside: !!panel && panel.contains(document.activeElement),
        focusOnButton: document.activeElement === button,
        label: button && (button.getAttribute("aria-label") || button.textContent.trim()),
        text: panel ? panel.textContent.replace(/\\s+/g, " ") : ""
      };
    }())`;
    check(await client.evaluate('!!document.getElementById("settingsButton") && ' +
      'document.getElementById("settingsButton").querySelector("svg") !== null'),
      "the toolbar has a settings button drawn with inline SVG");
    await clickSelector(client, "#settingsButton");
    let panel = await client.evaluate(PANEL);
    check(panel.open && panel.expanded === "true" && panel.focusInside,
      "the settings button opens the panel and moves focus into it (" +
      JSON.stringify({ open: panel.open, expanded: panel.expanded, focus: panel.focusInside }) + ")");
    check(/settings/i.test(panel.label) && /shortcut/i.test(panel.label),
      "the settings button is labelled for screen readers (" + panel.label + ")");
    check(/Ctrl\+Shift\+T\s*Change the theme/i.test(panel.text) ||
      /Change the theme\s*Ctrl\+Shift\+T/i.test(panel.text),
      "the panel lists Ctrl+Shift+T for the theme");
    const shortcuts = await client.evaluate("window.LeanMarkTest.shortcuts()");
    const missing = shortcuts.filter((entry) => panel.text.indexOf(entry.keys) < 0 ||
      panel.text.indexOf(entry.label) < 0);
    check(shortcuts.length >= 20 && missing.length === 0,
      "the panel lists all " + shortcuts.length + " shortcuts the key handlers act on" +
      (missing.length ? "; missing " + JSON.stringify(missing) : ""));
    for (const keys of ["Ctrl+O", "Ctrl+F", "F3", "Shift+F3", "Ctrl+R", "Ctrl+Shift+C",
      "Ctrl+Shift+L", "Ctrl+/", "F1", "Ctrl+Tab", "Ctrl+W", "Ctrl+0", "Esc"]) {
      check(shortcuts.some((entry) => entry.keys === keys),
        "the shortcut list includes " + keys);
    }
    // Each key handler's table is listed: the reader, the find box, the tab
    // strip, and the expanded figure.
    for (const [group, keys] of [["Reader", "Ctrl+Shift+T"], ["Find box", "Shift+Enter"],
      ["Tab strip", "Delete"], ["Expanded figure", "Arrow keys"]]) {
      check(shortcuts.some((entry) => entry.group === group && entry.keys === keys) &&
        panel.text.indexOf(group) >= 0,
        "the panel lists the " + group + " keys, such as " + keys);
    }
    await press(client, "Escape");
    panel = await client.evaluate(PANEL);
    check(!panel.open && panel.expanded === "false" && panel.focusOnButton,
      "Esc closes the panel and returns focus to the settings button");
    await client.evaluate('document.getElementById("article").focus(); true');
    await press(client, "/", { ctrl: true });
    check((await client.evaluate(PANEL)).open, "Ctrl+/ opens the panel");
    await press(client, "Escape");
    await press(client, "F1");
    check((await client.evaluate(PANEL)).open, "F1 opens the panel");

    // The panel changes the theme, width, and zoom through the same paths.
    await clearPosted();
    await clickSelector(client, '#settingsPanel input[name="settings-theme"][value="dusk"]');
    check(await client.evaluate('document.documentElement.dataset.theme') === "dusk" &&
      same((await client.evaluate(DOT)).background, SWATCH.dusk),
      "choosing Dusk in the panel applies it and updates the toolbar dot");
    await clickSelector(client, '#settingsPanel input[name="settings-width"][value="wide"]');
    check(await client.evaluate('document.documentElement.dataset.width') === "wide",
      "choosing Wide in the panel widens the column");
    await clickSelector(client, "#settingsZoomIn");
    await clickSelector(client, "#settingsZoomReset");
    check(JSON.stringify(await posted()) ===
      JSON.stringify(["theme|dusk", "width|wide", "zoom|in", "zoom|reset"]),
      "panel choices go to the host like the shortcuts (" +
      JSON.stringify(await posted()) + ")");
    // Each dot shows its own theme whatever theme is on screen, so read them
    // under a light and a dark theme.
    for (const current of ["light", "dusk"]) {
      await deliver({ type: "theme", value: current });
      const swatches = await client.evaluate(`(function () {
        var found = {};
        document.querySelectorAll('#settingsPanel input[name="settings-theme"]').forEach(function (input) {
          var dot = input.closest("label").querySelector(".theme-swatch");
          var style = getComputedStyle(dot);
          found[input.value] = [style.backgroundColor, style.borderTopColor, style.backgroundImage];
        });
        return found;
      }())`);
      check(["light", "dark", "dim", "dusk"].every((name) => swatches[name] &&
        same(swatches[name][0], SWATCH[name]) && same(swatches[name][1], SWATCH_RING)) &&
        /linear-gradient/.test(swatches.system[2]),
        "under " + current + ", each theme choice in the panel shows its own dot, " +
        "System half Light and half Dark " + JSON.stringify(swatches));
    }

    // The panel stays readable in every theme.
    for (const name of ["light", "dark", "dim", "dusk"]) {
      await deliver({ type: "theme", value: name });
      const colours = await client.evaluate(`(function () {
        var panel = document.getElementById("settingsPanel");
        var heading = panel.querySelector("h2");
        var keys = panel.querySelector("kbd");
        var surface = getComputedStyle(panel).backgroundColor;
        return {
          surface: surface,
          heading: getComputedStyle(heading).color,
          keys: getComputedStyle(keys).color,
          keysBackground: getComputedStyle(keys).backgroundColor
        };
      }())`);
      const keyBackground = parseColor(colours.keysBackground)[3] === 0
        ? colours.surface : colours.keysBackground;
      check(contrast(colours.heading, colours.surface) >= 4.5 &&
        contrast(colours.keys, keyBackground) >= 4.5,
        "the panel's text meets 4.5:1 in " + name + " (" +
        contrast(colours.heading, colours.surface).toFixed(2) + ", " +
        contrast(colours.keys, keyBackground).toFixed(2) + ")");
    }

    // On a 760 px window the open panel sits beside the text, not over it.
    await setViewport(760);
    await delay(100);
    const beside = await client.evaluate(`(function () {
      var panel = document.getElementById("settingsPanel").getBoundingClientRect();
      var text = document.getElementById("article").getBoundingClientRect();
      return {
        panel: [panel.left, panel.right, panel.top, panel.bottom],
        text: [text.left, text.right],
        width: window.innerWidth,
        height: window.innerHeight,
        scroll: document.documentElement.scrollWidth - window.innerWidth
      };
    }())`);
    check(beside.text[1] <= beside.panel[0] + 0.5 && beside.panel[1] <= beside.width + 0.5 &&
      beside.panel[3] <= beside.height + 0.5 && beside.scroll <= 0,
      "on a 760 px window the panel does not cover the text " + JSON.stringify(beside));
    await press(client, "Escape");
    await setViewport(1200);
    await deliver({ type: "theme", value: "system" });
    await deliver({ type: "width", value: "narrow" });

    // The diagram cap leaves diagrams past the fiftieth unrendered.
    const many = [];
    for (let index = 0; index < 51; index += 1) {
      many.push('<pre><code class="language-mermaid">flowchart LR\n  A' + index +
        " --&gt; B</code></pre>");
    }
    await deliver({
      type: "document", tabId: 1, theme: "light", fileName: "many.md",
      path: "/fixtures/many.md", documentBaseUrl: "", sourceBytes: 10,
      hasMermaid: true, html: many.join("\n"),
    });
    const capped = await client.evaluate(`(function () {
      var figures = document.querySelectorAll("#article figure.diagram");
      return {
        count: figures.length,
        lastHasSource: typeof figures[50]._leanmarkSource === "string",
        lastText: figures[50].textContent
      };
    }())`);
    check(capped.count === 51 && !capped.lastHasSource &&
      /Diagram limit reached/.test(capped.lastText),
      "the 51st diagram is not queued for rendering");

    check(consoleErrors.length === 0,
      "the page threw no exceptions" +
      (consoleErrors.length ? ": " + consoleErrors.join("; ") : ""));
  } finally {
    if (client) {
      client.close();
    }
    browser.kill();
    server.close();
    await delay(200);
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

run().then(() => {
  console.log("LeanMark reader browser checks passed.");
  process.exit(0);
}, (error) => {
  console.error("FAIL " + error.message);
  process.exit(1);
});
