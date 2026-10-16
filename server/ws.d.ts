declare module "ws" {
  import { EventEmitter } from "node:events";
  import http from "node:http";
  import stream from "node:stream";

  export class WebSocket extends EventEmitter {
    send(data: string | Buffer | Uint8Array): void;
    close(): void;
    readyState: number;
    static readonly OPEN: number;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: { server?: http.Server; port?: number; noServer?: boolean });
    handleUpgrade(
      request: http.IncomingMessage,
      socket: stream.Duplex,
      head: Buffer,
      callback: (client: WebSocket) => void
    ): void;
    close(callback?: () => void): void;
  }
}

