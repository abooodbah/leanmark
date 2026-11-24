import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const destinationArgument = process.argv[2];

if (!destinationArgument || process.argv.length !== 3) {
  throw new Error(
    "Usage: node scripts/stage-runtime-assets.mjs <assets-destination>"
  );
}

const destinationRoot = path.resolve(destinationArgument);
const authoredAssets = path.join(repositoryRoot, "assets");
const forbiddenDestinations = new Set([
  repositoryRoot,
  authoredAssets,
  path.join(repositoryRoot, "node_modules")
]);

if (forbiddenDestinations.has(destinationRoot)) {
  throw new Error(
    "The destination must be a dedicated build or package assets directory."
  );
}

const files = [
  ["assets/reader.html", "reader.html"],
  ["assets/reader.css", "reader.css"],
  ["assets/reader.js", "reader.js"],
  ["node_modules/mermaid/dist/mermaid.min.js", "vendor/mermaid.min.js"],
  ["node_modules/katex/dist/katex.min.js", "vendor/katex/katex.min.js"],
  ["node_modules/katex/dist/katex.min.css", "vendor/katex/katex.min.css"],
  // WebView2 always takes the woff2 entry first in katex.min.css, so the
  // woff and ttf copies are left out.
  ...(await readdir(path.join(repositoryRoot, "node_modules/katex/dist/fonts")))
    .filter((name) => name.endsWith(".woff2"))
    .sort()
    .map((name) => [
      `node_modules/katex/dist/fonts/${name}`,
      `vendor/katex/fonts/${name}`
    ]),
  [
    "node_modules/@fontsource/ibm-plex-sans/files/" +
      "ibm-plex-sans-latin-400-normal.woff2",
    "fonts/ibm-plex-sans-latin-400-normal.woff2"
  ],
  [
    "node_modules/@fontsource/ibm-plex-sans/files/" +
      "ibm-plex-sans-latin-500-normal.woff2",
    "fonts/ibm-plex-sans-latin-500-normal.woff2"
  ],
  [
    "node_modules/@fontsource/ibm-plex-sans/files/" +
      "ibm-plex-sans-latin-600-normal.woff2",
    "fonts/ibm-plex-sans-latin-600-normal.woff2"
  ],
  [
    "node_modules/@fontsource/ibm-plex-serif/files/" +
      "ibm-plex-serif-latin-600-normal.woff2",
    "fonts/ibm-plex-serif-latin-600-normal.woff2"
  ],
  [
    "node_modules/@fontsource/ibm-plex-mono/files/" +
      "ibm-plex-mono-latin-400-normal.woff2",
    "fonts/ibm-plex-mono-latin-400-normal.woff2"
  ]
];

for (const [sourceRelative, destinationRelative] of files) {
  const source = path.join(repositoryRoot, sourceRelative);
  try {
    const sourceInfo = await stat(source);
    if (!sourceInfo.isFile()) {
      throw new Error("not a regular file");
    }
  } catch (error) {
    throw new Error(
      `Required runtime asset is missing: ${sourceRelative}. Run npm ci first. (${error.message})`
    );
  }

  const destination = path.join(destinationRoot, destinationRelative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(
  `Staged ${files.length} offline runtime assets in ${destinationRoot}`
);
