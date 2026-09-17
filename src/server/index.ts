import { createServer } from "./create-server";

const PORT = 8080;

createServer(PORT);

console.log(
  `WebSocket server running on ws://localhost:${PORT}`
);