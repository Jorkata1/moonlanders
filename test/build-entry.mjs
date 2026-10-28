// Usage: node test/build-entry.mjs <entry.ts> <out.html> — bundles a test entry into a standalone page.
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { assemblePage } from "../page.mjs";
const [entry, out] = process.argv.slice(2);
const result = await build({ entryPoints: [entry], bundle: true, format: "iife", write: false, minify: true });
const body = await assemblePage(result.outputFiles[0].text);
await writeFile(out, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`);
