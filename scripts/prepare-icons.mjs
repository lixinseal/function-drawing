import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const iconDir = join(root, "public", "icons");
const data = JSON.parse(
  await readFile(join(root, "scripts", "icon-data.json"), "utf8")
);

await mkdir(iconDir, { recursive: true });
for (const [fileName, base64] of Object.entries(data)) {
  await writeFile(join(iconDir, fileName), Buffer.from(base64, "base64"));
}

console.log(`Prepared ${Object.keys(data).length} PWA icons`);
