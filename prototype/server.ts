// prototype/server.ts — Fase B: prototipe server HTTP lokal BERDAMPINGAN.
//
// BUKAN migrasi. Desktop Tauri tetap default dan tidak disentuh.
// Pola mark-agent: UI pindah web, otomasi desktop tetap native via daemon lokal.
// Prototipe ini = jalur alternatif opt-in, read-only + camera preview saja.
//
// Runtime: Bun menjalankan .ts langsung (repo ini runtime Bun).
// Transport: stdlib node:http SAJA — tanpa Express, tanpa dep baru
// (cek `git diff bun.lock`: harus kosong).
//
// Zona beku dihormati:
// - Bind WAJIB 127.0.0.1 (preseden sidecar/main/browser/bridge-core.ts HOST).
// - Port 49719: di luar ports beku 49712/49713/1420, dicek kosong saat start.
// - TIDAK menyentuh APPROVAL_ACTIONS, delimiter `||`, wire frame engine,
//   skema Dexie, K9. Tidak ada jalur tulis -> tidak ada approval gate
//   yang perlu direplika.
//
// Batasan jujur: endpoint read-only. /api/chat-readonly mengembalikan state
// SINTETIS (bukan baca Dexie/IndexedDB asli — itu milik renderer/GUI).
// Jalur tulis butuh spek tersendiri (approval gate native rfd tidak bisa
// direplika di browser tanpa native host).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, sep } from "node:path";

// Port prototipe: 49719 — bebas dari ports beku 49712/49713/1420.
// Dicek kosong saat start lewat ss; konflik -> exit 2 dengan pesan jelas.
const PORT = 49719;
const HOST = "127.0.0.1";
// Preseden: scripts/build-manifest.ts (fileURLToPath + dirname, bukan
// import.meta.dir yang butuh augmentasi tipe Bun-only).
const WEBUI_DIR = join(dirname(fileURLToPath(import.meta.url)), "webui");

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

// State SINTETIS — sengaja bukan Dexie asli. Renderer/GUI tetap satu-satunya
// pemilik state chat nyata (skema Dexie zona beku, tidak diduplikasi).
function readonlySnapshot(): string {
  return JSON.stringify({
    ok: true,
    readonly: true,
    sessions: [
      {
        id: "proto-session-1",
        title: "Sesi contoh (sintetis)",
        messageCount: 2,
        updatedAt: new Date().toISOString(),
      },
    ],
    note: "Snapshot sintetis Fase B. Bukan baca Dexie/IndexedDB asli.",
  });
}

interface StaticHit {
  bytes: Buffer;
  contentType: string;
}

async function serveStatic(pathname: string): Promise<StaticHit | null> {
  // Hanya file di dalam prototype/webui. normalize + prefix check = no traversal.
  const rel = pathname === "/" ? "index.html" : pathname.slice(1);
  const abs = normalize(join(WEBUI_DIR, rel));
  if (abs !== WEBUI_DIR && !abs.startsWith(WEBUI_DIR + sep)) return null;
  let bytes: Uint8Array;
  try {
    bytes = await readFile(abs);
  } catch {
    return null;
  }
  const type = abs.endsWith(".html")
    ? "text/html; charset=utf-8"
    : abs.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : abs.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "application/octet-stream";
  return { bytes: Buffer.from(bytes), contentType: type };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({ ok: true, proto: "server-webui", port: PORT }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/chat-readonly") {
    res.writeHead(200, JSON_HEADERS);
    res.end(readonlySnapshot());
    return;
  }
  // WebUI statis: /, /index.html. Selain itu 404 (tanpa framework, tanpa build).
  if (req.method === "GET") {
    const hit = await serveStatic(url.pathname);
    if (hit) {
      res.writeHead(200, {
        "content-type": hit.contentType,
        "cache-control": "no-store",
      });
      res.end(hit.bytes);
      return;
    }
  }
  res.writeHead(404, JSON_HEADERS);
  res.end(JSON.stringify({ ok: false, error: "not-found" }));
});

server.on("error", (err: Error & { code?: string }) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[proto] port ${PORT} terpakai — pilih 49xxx bebas lain.`);
    process.exit(2);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`[proto] listening on http://${HOST}:${PORT}`);
});
