// Usage: node test/build-entry.mjs <entry.ts> <out.html> — bundles a test entry into a standalone page.
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
const [entry, out] = process.argv.slice(2);
const result = await build({ entryPoints: [entry], bundle: true, format: "iife", write: false, minify: true });
const page = await readFile("src/page.html", "utf8");
const script = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
await writeFile(out, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${page.replace("/*__GAME_SCRIPT__*/", () => script)}</body></html>`);
