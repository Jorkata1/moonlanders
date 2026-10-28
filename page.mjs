// Assembles src/page.html: inlines the stylesheets from src/styles/ and the game script into one page body.
import { readFile } from "node:fs/promises";

const SCRIPT_PLACEHOLDER = "/*__GAME_SCRIPT__*/";
const STYLES_PLACEHOLDER = "/*__STYLES__*/";
/** Later sheets override earlier ones; compact.css holds the phone and small-window rules. */
const STYLESHEETS = ["hud.css", "panels.css", "screens.css", "compact.css"];

export async function assemblePage(script) {
  const page = await readFile("src/page.html", "utf8");
  if (!page.includes(SCRIPT_PLACEHOLDER)) throw new Error("page.html is missing the script placeholder");
  if (!page.includes(STYLES_PLACEHOLDER)) throw new Error("page.html is missing the styles placeholder");
  const sheets = await Promise.all(STYLESHEETS.map((name) => readFile(`src/styles/${name}`, "utf8")));
  const safeScript = script.replaceAll("</script", "<\\/script");
  return page.replace(STYLES_PLACEHOLDER, () => sheets.join("\n")).replace(SCRIPT_PLACEHOLDER, () => safeScript);
}
