#!/usr/bin/env node

// Dependency-free browser smoke test for the public LeanMark site.
// It serves site/ only on loopback, launches a test-owned headless browser
// profile, and audits the rendered page at desktop, tablet, and mobile sizes.

import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  join,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function fail(message) {
  throw new Error(message);
}

function parseSitePath() {
  const index = process.argv.indexOf("--site");
  if (index === -1) {
    return resolve("site");
  }
  if (!process.argv[index + 1]) {
    fail("--site requires a directory path.");
  }
  return resolve(process.argv[index + 1]);
}

async function startStaticServer(siteRoot) {
  const rootPrefix = siteRoot.endsWith(sep) ? siteRoot : siteRoot + sep;
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }

      const requestUrl = new URL(request.url || "/", "http://127.0.0.1/");
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/") {
        pathname = "/index.html";
      }
      const candidate = resolve(siteRoot, "." + pathname.split("/").join(sep));
      if (candidate !== siteRoot && !candidate.startsWith(rootPrefix)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const content = await fs.readFile(candidate);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": MIME_TYPES.get(extname(candidate).toLowerCase()) ||
          "application/octet-stream",
      });
      if (request.method === "HEAD") {
        response.end();
      } else {
        response.end(content);
      }
    } catch (error) {
      response.writeHead(error && error.code === "ENOENT" ? 404 : 500);
      response.end("Not found");
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    fail("The loopback server did not expose a TCP port.");
  }
  return {
    server,
    url: "http://127.0.0.1:" + address.port + "/",
  };
}

async function findBrowser() {
  const candidates = [];
  if (process.platform === "win32") {
    const roots = [
      process.env["ProgramFiles(x86)"],
      process.env.ProgramFiles,
      process.env.LOCALAPPDATA,
    ].filter(Boolean);
    for (const root of roots) {
      candidates.push(join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
      candidates.push(join(root, "Google", "Chrome", "Application", "chrome.exe"));
    }
    const lookup = spawnSync("where.exe", ["msedge.exe"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (lookup.status === 0) {
      candidates.push(...lookup.stdout.split(/\r?\n/).filter(Boolean));
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
      "/usr/bin/microsoft-edge-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
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
  fail("No supported Chrome or Edge executable was found.");
}

async function waitForFile(path, browser, timeoutMilliseconds = 15000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) {
      fail("The headless browser exited before its DevTools port was ready.");
    }
    try {
      return await fs.readFile(path, "utf8");
    } catch {
      await delay(75);
    }
  }
  fail("The headless browser did not expose DevTools within 15 seconds.");
}

async function waitForPageTarget(port, pageUrl, timeoutMilliseconds = 15000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/list");
      const targets = await response.json();
      const target = targets.find((item) =>
        item.type === "page" && item.url.startsWith(pageUrl));
      if (target && target.webSocketDebuggerUrl) {
        return target;
      }
    } catch {
      // DevTools may be listening before the initial page target exists.
    }
    await delay(75);
  }
  fail("The browser did not expose the LeanMark site page target.");
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => this.handleMessage(event));
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(
        () => rejectOpen(new Error("Timed out connecting to DevTools.")),
        10000,
      );
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        rejectOpen(new Error("DevTools WebSocket connection failed."));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    const listeners = this.listeners.get(message.method) || [];
    for (const listener of listeners) {
      listener(message.params || {});
    }
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveResult, rejectResult) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectResult(new Error("DevTools command timed out: " + method));
      }, 10000);
      this.pending.set(id, {
        resolve: resolveResult,
        reject: rejectResult,
        timer,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, "site smoke complete");
    }
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    fail("Browser expression failed: " + JSON.stringify(response.exceptionDetails));
  }
  return response.result.value;
}

async function waitForDocument(client) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(
        client,
        "document.readyState === 'complete' && document.fonts.status === 'loaded'",
      );
      if (ready) {
        return;
      }
    } catch {
      // Navigation can briefly invalidate the execution context.
    }
    await delay(75);
  }
  fail("The site did not finish loading its document and local fonts.");
}

const PAGE_AUDIT_EXPRESSION = [
  "(async function () {",
  "  await document.fonts.ready;",
  "  var root = document.scrollingElement || document.documentElement;",
  "  var clientWidth = document.documentElement.clientWidth;",
  "  var brokenImages = Array.from(document.images).filter(function (image) {",
  "    return !image.complete || image.naturalWidth === 0;",
  "  }).map(function (image) { return image.getAttribute('src'); });",
  "  var missingAnchors = Array.from(document.querySelectorAll('a[href^=\"#\"]')).map(function (link) {",
  "    return link.getAttribute('href').slice(1);",
  "  }).filter(function (id) { return id && !document.getElementById(id); });",
  "  var headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));",
  "  var headingRanks = headings.map(function (heading) { return Number(heading.tagName.slice(1)); });",
  "  var headingJump = headingRanks.some(function (rank, index) {",
  "    return index > 0 && rank > headingRanks[index - 1] + 1;",
  "  });",
  "  var buttonsTooSmall = Array.from(document.querySelectorAll('a.button')).filter(function (button) {",
  "    if (getComputedStyle(button).display === 'none') return false;",
  "    var rect = button.getBoundingClientRect();",
  "    return rect.width < 44 || rect.height < 44;",
  "  }).map(function (button) { return button.textContent.trim(); });",
  "  var overflowers = Array.from(document.querySelectorAll('body *')).filter(function (element) {",
  "    var style = getComputedStyle(element);",
  "    if (style.display === 'none' || style.position === 'fixed') return false;",
  "    var rect = element.getBoundingClientRect();",
  "    return rect.width > 0 && (rect.left < -2 || rect.right > clientWidth + 2);",
  "  }).slice(0, 8).map(function (element) {",
  "    return element.tagName.toLowerCase() + (element.className ? '.' + String(element.className).trim().replace(/\\s+/g, '.') : '');",
  "  });",
  "  var focusTarget = document.querySelector('.hero-actions .button-primary');",
  "  focusTarget.focus();",
  "  var focusStyle = getComputedStyle(focusTarget);",
  "  var headerDownload = document.querySelector('.header-download');",
  "  var primaryNav = document.querySelector('.primary-nav');",
  "  var diagram = document.querySelector('.diagram-surface');",
  "  var diagramCopy = diagram && diagram.parentElement.querySelector('.section-copy');",
  "  return {",
  "    title: document.title,",
  "    h1Count: document.querySelectorAll('h1').length,",
  "    headingCount: headings.length,",
  "    headingJump: headingJump,",
  "    hasMain: Boolean(document.querySelector('main#main-content')),",
  "    hasSkipLink: Boolean(document.querySelector('a.skip-link[href=\"#main-content\"]')),",
  "    brokenImages: brokenImages,",
  "    missingAnchors: missingAnchors,",
  "    buttonsTooSmall: buttonsTooSmall,",
  "    horizontalOverflow: root.scrollWidth > clientWidth + 1,",
  "    scrollWidth: root.scrollWidth,",
  "    clientWidth: clientWidth,",
  "    overflowers: overflowers,",
  "    focusVisible: focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 2,",
  "    headerDownloadDisplay: getComputedStyle(headerDownload).display,",
  "    primaryNavDisplay: getComputedStyle(primaryNav).display,",
  "    diagramCopyFirst: !diagram || !diagramCopy || diagramCopy.getBoundingClientRect().top <= diagram.getBoundingClientRect().top,",
  "    primaryDownload: focusTarget.getAttribute('href'),",
  "    externalResources: performance.getEntriesByType('resource').map(function (entry) {",
  "      return entry.name;",
  "    }).filter(function (url) { return !url.startsWith(location.origin + '/'); }),",
  "  };",
  "})()",
].join("\n");

function assertAudit(name, viewport, audit) {
  const checks = [
    [audit.title.includes("LeanMark"), "document title"],
    [audit.h1Count === 1, "exactly one H1"],
    [audit.headingCount >= 5 && !audit.headingJump, "sequential heading structure"],
    [audit.hasMain && audit.hasSkipLink, "main landmark and skip link"],
    [audit.brokenImages.length === 0, "all images loaded"],
    [audit.missingAnchors.length === 0, "all local anchors resolve"],
    [audit.buttonsTooSmall.length === 0, "visible buttons are at least 44 by 44 CSS pixels"],
    [!audit.horizontalOverflow, "no page-level horizontal overflow"],
    [audit.overflowers.length === 0, "no visible element crosses the viewport"],
    [audit.focusVisible, "keyboard focus is visibly outlined"],
    [audit.externalResources.length === 0, "all loaded resources are local"],
    [audit.primaryDownload.includes("/releases/download/v0.1.0/"), "version-pinned primary download"],
  ];

  if (viewport.width <= 390) {
    checks.push(
      [audit.headerDownloadDisplay === "none", "mobile header CTA collapses"],
      [audit.primaryNavDisplay === "none", "mobile primary navigation collapses"],
      [audit.diagramCopyFirst, "mobile diagram explanation precedes its visual"],
    );
  } else if (viewport.width >= 1000) {
    checks.push(
      [audit.headerDownloadDisplay !== "none", "desktop header CTA is visible"],
      [audit.primaryNavDisplay !== "none", "desktop primary navigation is visible"],
    );
  }

  const failed = checks.filter((check) => !check[0]).map((check) => check[1]);
  if (failed.length > 0) {
    fail(
      name + " browser audit failed: " + failed.join(", ") +
      ". Snapshot: " + JSON.stringify(audit),
    );
  }
  console.log(
    "PASS  " + name + " " + audit.clientWidth + "px viewport, no overflow, local assets, visible focus",
  );
}

async function terminateBrowser(browser) {
  if (!browser || browser.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync(
      "taskkill.exe",
      ["/PID", String(browser.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
  } else {
    browser.kill("SIGTERM");
    await Promise.race([once(browser, "exit"), delay(3000)]);
    if (browser.exitCode === null) {
      browser.kill("SIGKILL");
    }
  }
}

async function removeOwnedProfile(profile) {
  const resolvedProfile = resolve(profile);
  const tempRoot = resolve(tmpdir());
  if (
    dirname(resolvedProfile) !== tempRoot ||
    !basename(resolvedProfile).startsWith("leanmark-site-smoke-")
  ) {
    fail("Refusing to remove an unowned browser profile: " + resolvedProfile);
  }
  await fs.rm(resolvedProfile, {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 100,
  });
}

async function main() {
  const siteRoot = parseSitePath();
  await fs.access(join(siteRoot, "index.html"));
  const browserPath = await findBrowser();
  const profile = await fs.mkdtemp(join(tmpdir(), "leanmark-site-smoke-"));
  const staticServer = await startStaticServer(siteRoot);
  const stderr = [];
  let browser;
  let client;

  try {
    browser = spawn(browserPath, [
      "--headless=new",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-gpu",
      "--disable-sync",
      "--no-default-browser-check",
      "--no-first-run",
      "--remote-allow-origins=*",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      staticServer.url,
    ], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    browser.stderr.on("data", (chunk) => {
      stderr.push(String(chunk));
      if (stderr.length > 20) {
        stderr.shift();
      }
    });

    const portFile = join(profile, "DevToolsActivePort");
    const portText = await waitForFile(portFile, browser);
    const port = Number(portText.split(/\r?\n/)[0]);
    if (!Number.isInteger(port) || port <= 0) {
      fail("The browser returned an invalid DevTools port.");
    }
    const target = await waitForPageTarget(port, staticServer.url);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);

    const browserErrors = [];
    const requestUrls = new Map();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Network.enable");
    await client.send("Accessibility.enable");

    client.on("Runtime.exceptionThrown", (event) => {
      browserErrors.push("exception: " + JSON.stringify(event.exceptionDetails));
    });
    client.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error" || event.type === "assert") {
        browserErrors.push("console " + event.type);
      }
    });
    client.on("Log.entryAdded", (event) => {
      if (event.entry && event.entry.level === "error") {
        browserErrors.push("log: " + event.entry.text);
      }
    });
    client.on("Network.requestWillBeSent", (event) => {
      requestUrls.set(event.requestId, event.request.url);
    });
    client.on("Network.responseReceived", (event) => {
      if (
        event.response.url.startsWith(staticServer.url) &&
        event.response.status >= 400
      ) {
        browserErrors.push(
          "HTTP " + event.response.status + ": " + event.response.url,
        );
      }
    });
    client.on("Network.loadingFailed", (event) => {
      const url = requestUrls.get(event.requestId) || "";
      if (url.startsWith(staticServer.url)) {
        browserErrors.push("resource failed: " + url + " " + event.errorText);
      }
    });

    const viewports = [
      { name: "desktop", width: 1440, height: 1000, scheme: "light" },
      { name: "tablet", width: 820, height: 1000, scheme: "light" },
      { name: "mobile", width: 390, height: 844, scheme: "dark" },
    ];

    for (const viewport of viewports) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width <= 390,
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      });
      await client.send("Emulation.setEmulatedMedia", {
        features: [{
          name: "prefers-color-scheme",
          value: viewport.scheme,
        }],
      });
      await client.send("Page.navigate", {
        url: staticServer.url + "?viewport=" + viewport.name,
      });
      await waitForDocument(client);
      const audit = await evaluate(client, PAGE_AUDIT_EXPRESSION);
      assertAudit(viewport.name, viewport, audit);
    }

    const accessibility = await client.send("Accessibility.getFullAXTree");
    const interactiveWithoutName = accessibility.nodes.filter((node) => {
      const role = node.role && node.role.value;
      const name = node.name && node.name.value;
      return (role === "link" || role === "button") && !String(name || "").trim();
    });
    if (interactiveWithoutName.length > 0) {
      fail("The accessibility tree contains an unnamed link or button.");
    }
    console.log("PASS  accessibility tree exposes names for every link and button");

    if (browserErrors.length > 0) {
      fail("Browser console or resource errors: " + browserErrors.join(" | "));
    }
    console.log("PASS  no browser exceptions, console errors, or failed local resources");
    console.log("");
    console.log("LeanMark browser site smoke passed.");
  } catch (error) {
    const browserLog = stderr.join("").trim();
    if (browserLog) {
      console.error("Browser diagnostics:");
      console.error(browserLog);
    }
    throw error;
  } finally {
    if (client) {
      client.close();
    }
    await terminateBrowser(browser);
    if (typeof staticServer.server.closeAllConnections === "function") {
      staticServer.server.closeAllConnections();
    }
    await Promise.race([
      new Promise((resolveClose) => staticServer.server.close(resolveClose)),
      delay(2000),
    ]);
    await delay(150);
    await removeOwnedProfile(profile);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
