import {
  WebSocketServer,
  WebSocket,
} from "ws";

import { RGA } from "../crdt/rga";
import { Room } from "./room";
import { validateMessage } from "./validator";
import { ClientSession } from "./client-session";
import {
  DocumentAccessService,
} from "./document-access";
import type { AuthService } from "./auth";
import { InMemoryOperationStore } from "./memory-operation-store";
import { InMemoryDocumentStore } from "./memory-document-store";
import { VersionVector } from "../crdt/version-vector";
import { getMissingOperations } from "../crdt/sync";

export function createServer(port: number, authService: AuthService, accessService = new DocumentAccessService()) {

  const wss = new WebSocketServer({
    port,
  });

  const rooms = new Map<string, Room>();

  const clientRooms = new Map<WebSocket, Room>();

  const operationStore = new InMemoryOperationStore();
  const documentStore = new InMemoryDocumentStore();

  const authenticatedUsers = new Map<WebSocket, string>();
  const clientSessions = new Map<
    WebSocket,
    ClientSession
  >();

  async function getRoom(documentId: string): Promise<Room> {
    let room = rooms.get(documentId);

    if (!room) {
      room = new Room(
        documentId,
        new RGA("server"),
        operationStore,
        documentStore
      );

      rooms.set(documentId, room);

      await room.restore();
    }

    return room;
  }

  wss.on("connection", (ws) => {

    ws.on("message", async (data) => {

      try {

        const rawMessage: any = JSON.parse(data.toString());

        if (!validateMessage(rawMessage)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message",
            })
          );
          return;
        }

        // Authentication must happen before other operations
        if (rawMessage.type === "authenticate") {
          const user = authService.authenticate(rawMessage.token);

          if (!user) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Authentication failed",
              })
            );

            ws.close(1008, "Authentication failed");
            return;
          }

          const existingSession = clientSessions.get(ws);

          if (existingSession) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Already authenticated",
              })
            );
            return;
          }

          const session = new ClientSession(user.userId, rawMessage.clientId);

          authenticatedUsers.set(ws, user.userId);
          clientSessions.set(ws, session);

          ws.send(
            JSON.stringify({
              type: "authenticated",
              userId: session.userId,
              sessionId: session.sessionId,
              clientId: session.clientId,
            })
          );

          return;
        }

        // All other messages require authentication
        const session = clientSessions.get(ws);

        if (!session) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Authentication required",
            })
          );

          return;
        }

        if (rawMessage.type === "join") {

          if (!session) {
            return;
          }

          const hasReadAccess =
            accessService.canAccess(
              rawMessage.documentId,
              session.userId,
              "read"
            );

          if (!hasReadAccess) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Access denied",
              })
            );

            return;
          }

          const existingRoom = clientRooms.get(ws);

          if (existingRoom) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Already joined a document",
              })
            );

            return;
          }

          const room = await getRoom(
            rawMessage.documentId
          );

          room.addClient(ws);
          clientRooms.set(ws, room);

          ws.send(
            JSON.stringify({
              type: "joined",
              documentId: rawMessage.documentId,
            })
          );

          return;
        }

        if (rawMessage.type === "sync") {
          const room = clientRooms.get(ws);

          if (!room) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Join a document first",
              }),
            );
            return;
          }

          const localVector = VersionVector.fromJSON(
            rawMessage.versionVector,
          );

          const allOperations = await room.getOperations();

          const missingOperations = getMissingOperations(
            localVector,
            allOperations,
          );

          ws.send(
            JSON.stringify({
              type: "sync",
              operations: missingOperations,
            }),
          );

          return;
        }

        if (rawMessage.type === "operation") {
          const room = clientRooms.get(ws);


          if (!room || !session) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Join a document first",
              })
            );

            return;
          }

          const hasWriteAccess =
            accessService.canAccess(
              room.documentId,
              session.userId,
              "write"
            );

          if (!hasWriteAccess) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Write access denied",
              })
            );

            return;
          }

          const operation = rawMessage.operation

          // 1. Verify the operation belongs to this client.
          if (operation.id.clientId !== session.clientId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid operation identity",
            }));
            return;
          }

          // 2. Check whether this exact operation was already persisted.
          const existingOperation =
            await operationStore.getOperation(
              room.documentId,
              operation.id,
            );

          if (existingOperation) {
            // It is a retransmission.
            ws.send(JSON.stringify({
              type: "operation_ack",
              operationId: operation.id,
            }));

            return;
          }

          const isValidIdentity =
            session.validateOperationIdentity(
              rawMessage.operation
            );

          console.log("isValidIdentity", isValidIdentity);

          if (!isValidIdentity) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid operation identity",
              })
            );

            return;
          }

          await room.handleOperation(
            rawMessage.operation,
            ws
          );

          ws.send(
            JSON.stringify({
              type: "operation_ack",
              operationId: rawMessage.operation.id,
            }),
          );
          return
        }
      } catch {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid JSON",
          })
        );
      }
    });

    ws.on("close", () => {
      const room = clientRooms.get(ws);

      if (room) {
        room.removeClient(ws);
      }

      clientRooms.delete(ws);
      authenticatedUsers.delete(ws);
      clientSessions.delete(ws);
    });
  });

  return wss;
}