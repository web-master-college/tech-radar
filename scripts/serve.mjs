import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = normalize(fileURLToPath(new URL("..", import.meta.url)));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export function resolvePublicPath(rootDir, requestPath) {
  let pathname;
  try {
    pathname = new URL(requestPath, "http://127.0.0.1").pathname;
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const full = normalize(join(rootDir, relative));
  const base = rootDir.endsWith(sep) ? rootDir.slice(0, -1) : rootDir;
  if (full !== base && !full.startsWith(`${base}${sep}`)) return null;
  return full;
}

export async function handleRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  const full = resolvePublicPath(root, req.url || "/");
  if (!full) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  try {
    const info = await stat(full);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const body = req.method === "HEAD" ? undefined : await readFile(full);
    const type = TYPES[extname(full)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT) || 4173;
  const host = "127.0.0.1";
  createServer(handleRequest).listen(port, host, () => {
    console.log(`http://${host}:${port}`);
  });
}
