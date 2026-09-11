import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = resolve(repo, "docs/icon-refresh");
const shared = new Set([
  "src/app/icon.svg",
  "src/styles/form/foundation.css",
  "src/styles/form/form.css",
]);
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/plain",
  ".txt": "text/plain",
  ".json": "application/json",
};
const port = Number(process.argv[2] || 4176);

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/") {
      response.writeHead(302, { Location: "/docs/icon-refresh/index.html" }).end();
      return;
    }
    const relative = pathname === "/" ? "docs/icon-refresh/index.html" : pathname.slice(1);
    const file = resolve(repo, relative);
    if ((!file.startsWith(root + sep) && !shared.has(relative)) || !types[extname(file)]) {
      response.writeHead(404).end("Not found");
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": `${types[extname(file)]}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(content);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Icon mockups: http://127.0.0.1:${port}/docs/icon-refresh/index.html`),
);
