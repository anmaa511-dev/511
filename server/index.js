import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync, createReadStream } from "node:fs";
import { openStore } from "./core.js";
import { createApi, deliverMessages } from "./api.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
http.setGlobalProxyFromEnv();
const store = openStore(
  process.env.DATA_FILE || path.join(root, "data", "shanab.sqlite"),
);
// An interrupted send is ambiguous: require manual review, never silently resend it.
store.db
  .prepare(
    "UPDATE messages SET status='failed',error='توقف الخادم أثناء الإرسال؛ تحقق من سجل المزود قبل إعادة المحاولة' WHERE status='sending'",
  )
  .run();
const api = createApi(store),
  production = process.env.NODE_ENV === "production";
let vite;
if (!production) {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: {
      middlewareMode: true,
      fs: {
        deny: [
          "**/.env*",
          "**/.git/**",
          "**/data/**",
          "**/server/**",
          "**/tests/**",
          "**/*.{sqlite,sqlite-shm,sqlite-wal}",
        ],
      },
    },
    appType: "spa",
  });
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (await api(req, res)) return;
  if (vite) return vite.middlewares(req, res);
  const pathname = new URL(req.url, "http://localhost").pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end("Invalid URL");
  }
  let file = path.resolve(root, "dist", "." + decoded);
  if (!file.startsWith(path.join(root, "dist") + path.sep))
    file = path.join(root, "dist", "index.html");
  if (!existsSync(file) || !statSync(file).isFile() || !path.extname(file))
    file = path.join(root, "dist", "index.html");
  if (!existsSync(file)) {
    res.writeHead(503);
    return res.end("Build the app with npm run build");
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(file)] || "application/octet-stream",
  );
  createReadStream(file)
    .on("error", () => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    })
    .pipe(res);
});
let sending = false;
const timer = setInterval(async () => {
  if (sending) return;
  sending = true;
  try {
    await deliverMessages(store);
  } catch {
    console.error("WhatsApp queue could not run");
  } finally {
    sending = false;
  }
}, 15000);
timer.unref();
const port = Number(process.env.PORT || 3000);
server.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.log(
    `Shanab server listening on port ${port}; admin ${store.get("admin_hash") ? "configured" : "setup key saved in data/setup-key.txt"}`,
  ),
);
async function shutdown() {
  clearInterval(timer);
  await vite?.close();
  server.close(() => {
    store.db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
