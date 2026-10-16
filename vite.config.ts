import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

import type http from "node:http";
import type stream from "node:stream";
import type { ViteDevServer } from "vite";

function gameWebSocketPlugin() {
  return {
    name: "moonwarden-ws",
    async configureServer(server: ViteDevServer) {
      if (!server.httpServer) return;
      const { WebSocketServer } = await import("ws");
      const { handleSocketConnection } = await import("./server/ws-handler");
      const wss = new WebSocketServer({ noServer: true });
      server.httpServer.on("upgrade", (req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => {
        const url = req.url || "";
        if (url.startsWith("/api/ws") || url.startsWith("/ws")) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            const { onMessage, onClose } = handleSocketConnection(ws);
            ws.on("message", (data: Buffer | string) => onMessage(data.toString()));
            ws.on("close", () => onClose());
            ws.on("error", () => onClose());
          });
        }
      });
    },
  };
}

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      gameWebSocketPlugin(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
