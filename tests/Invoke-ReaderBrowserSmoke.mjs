#!/usr/bin/env node

// Dependency-free browser test for the shared reader page. It serves the
// staged reader assets on loopback, stands in for a native host through the
// WebView2 message bridge, and drives the page in a test-owned headless
// Chrome, Edge, or Chromium over the DevTools protocol.
//
// Usage: node tests/Invoke-ReaderBrowserSmoke.mjs --assets <staged assets dir>
//          [--browser <executable>] [--capture-dir <dir>]

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
            styleRules: Array.from(svg.querySelectorAll("style")).map(function (node) {
              return (node.textContent.match(/[^{}]*max-(?:width|height)[^}]*}/g) || []).join(" ");
            }).join(" ").slice(0, 400),
            canvas: [canvas.offsetWidth, canvas.offsetHeight, canvas.offsetLeft]
          } : null;
        }())];
    }())`);
    check(afterPan[0] > panned && afterPan[1] > 0,
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
