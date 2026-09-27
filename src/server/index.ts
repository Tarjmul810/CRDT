import { createServer } from "./create-server";
import { MockAuthService } from "./mock-auth";

const PORT = 8080;

createServer(PORT, new MockAuthService());

console.log(
  `WebSocket server running on ws://localhost:${PORT}`
);