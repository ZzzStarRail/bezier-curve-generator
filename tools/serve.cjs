"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8080);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".md": "text/plain; charset=utf-8" };
const server = http.createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405); response.end("Method not allowed"); return; }
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const target = path.resolve(root, "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname));
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) { response.writeHead(403); response.end("Forbidden"); return; }
    const realTarget = await fs.realpath(target);
    const realRelative = path.relative(root, realTarget);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) { response.writeHead(403); response.end("Forbidden"); return; }
    const contents = await fs.readFile(realTarget);
    response.writeHead(200, { "Content-Type": types[path.extname(target)] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 400);
    response.end("File not found or invalid request");
  }
});
server.on("error", error => { console.error(error.code === "EADDRINUSE" ? `端口 ${port} 已被占用。可设置环境变量 PORT 更换端口，或直接打开 index.html。` : error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Bézier Lab: http://127.0.0.1:${port}\n按 Ctrl+C 结束预览。`));
