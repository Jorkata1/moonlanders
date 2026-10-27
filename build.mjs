// Builds Starhop into single-file HTML pages.
//   node build.mjs          → dist/starhop.html (preview) + dist/crazygames/index.html (upload build)
//   node build.mjs --watch  → rebuilds on every change in src/ and serves the game on http://localhost:5173
import { build } from "esbuild";
import { watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";

const CRAZYGAMES_SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js";
const SCRIPT_PLACEHOLDER = "/*__GAME_SCRIPT__*/";
const BODY_START = '<canvas id="view"';
const DEV_PORT = 5173;
const REBUILD_DELAY_MS = 120;

async function buildOnce({ minify }) {
  const started = performance.now();
  const result = await build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    minify,
    sourcemap: minify ? false : "inline",
    format: "iife",
    target: ["es2020"],
    write: false,
  });
  const script = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
  const page = await readFile("src/page.html", "utf8");
  if (!page.includes(SCRIPT_PLACEHOLDER)) throw new Error("page.html is missing the script placeholder");
  if (!page.includes(BODY_START)) throw new Error("page.html is missing the game canvas");
  const body = page.replace(SCRIPT_PLACEHOLDER, () => script);

  await mkdir("dist/crazygames", { recursive: true });

  // Preview build: body-only markup, for hosts that wrap it in their own document.
  await writeFile("dist/starhop.html", body);

  // CrazyGames build: full document with the SDK loaded before the game script.
  const portalBody = body
    .replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    .replace("<script>", `<script src="${CRAZYGAMES_SDK_URL}"></script>\n<script>`);
  const portalDocument = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${portalBody.slice(0, portalBody.indexOf(BODY_START))}</head>
<body>
${portalBody.slice(portalBody.indexOf(BODY_START))}
</body>
</html>
`;
  await writeFile("dist/crazygames/index.html", portalDocument);
  console.log(`Built in ${Math.round(performance.now() - started)} ms · script ${(script.length / 1024).toFixed(1)} KB`);
}

async function dev() {
  await buildOnce({ minify: false });
  let timer = null;
  watch("src", { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildOnce({ minify: false }).catch((error) => console.error(error.message)), REBUILD_DELAY_MS);
  });
  createServer(async (request, response) => {
    try {
      const html = await readFile("dist/crazygames/index.html");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(html);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(`Build not ready: ${error.message}`);
    }
  }).listen(DEV_PORT, () => console.log(`Starhop dev server: http://localhost:${DEV_PORT} (reload the page after saving a file)`));
}

if (process.argv.includes("--watch")) await dev();
else await buildOnce({ minify: true });
