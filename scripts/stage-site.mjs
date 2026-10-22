import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "_site");

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "format.js",
  "links.js",
  "articles.json",
  "favicon.svg",
  "fonts/heebo-hebrew.woff2",
  "fonts/heebo-latin.woff2",
  "fonts/frank-ruhl-libre-hebrew.woff2",
  "fonts/frank-ruhl-libre-latin.woff2",
  "fonts/OFL.txt",
];

await rm(out, { recursive: true, force: true });
for (const file of files) {
  const target = join(out, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(root, file), target);
}
console.log(`Staged ${files.length} files to _site/`);
