// Runs the headless simulation tests: a bot plays every planet in order, plus save, backpack, order, robot, drone and drill checks.
// Usage: npm test
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "starhop-test-"));
let failed = false;

for (const name of ["autoplay", "inventory"]) {
  const result = await build({ entryPoints: [`test/${name}.ts`], bundle: true, platform: "node", write: false, logLevel: "error" });
  const file = join(dir, `${name}.cjs`);
  writeFileSync(file, result.outputFiles[0].text);
  console.log(`\n── ${name} ──`);
  const output = execFileSync(process.execPath, [file], { encoding: "utf8" });
  process.stdout.write(output);
  if (name === "autoplay" && !output.includes("\nfinished: true")) failed = true;
  if (name === "autoplay" && output.includes("save roundtrip ok: false")) failed = true;
  if (name === "autoplay" && !output.includes("bad save tolerated: true")) failed = true;
  if (name === "autoplay" && !output.includes("legacy save starts fresh: true")) failed = true;
  if (name === "autoplay" && !output.includes("unknown planet falls back: true")) failed = true;
  if (name === "inventory" && output.includes('"ok":false')) failed = true;
}

if (failed) {
  console.error("\n✗ Tests failed");
  process.exit(1);
}
console.log("\n✓ All tests passed");
