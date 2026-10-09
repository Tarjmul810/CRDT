import { createServer } from "./create-server";
import { MockAuthService } from "./mock-auth";
import { DocumentAccessService } from './document-access'

const PORT = 8080;

const authService = new MockAuthService();
const documentAccessService = new DocumentAccessService();

authService.registerToken(
  "dev-token",
  "dev-user",
);

documentAccessService.grantPermission(
  "document-1",
  "dev-user",
  "owner"
);

createServer(PORT, authService, documentAccessService);

console.log(
  `WebSocket server running on ws://localhost:${PORT}`
);