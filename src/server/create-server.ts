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

export function createServer(port: number) {

  const accessService = new DocumentAccessService();

  const wss = new WebSocketServer({
    port,
  });



  const rooms = new Map<string, Room>();

  const clientRooms = new Map<WebSocket, Room>();

  const clientSessions = new Map<
    WebSocket,
    ClientSession
  >();

  function getRoom(documentId: string): Room {
    let room = rooms.get(documentId);

    if (!room) {
      room = new Room(
        documentId,
        new RGA("server")
      );

      rooms.set(documentId, room);
    }

    return room;
  }

  wss.on("connection", (ws) => {
    const session = new ClientSession();

    clientSessions.set(ws, session);

    accessService.grantPermission(
      "identity-test-document",
      session.clientId,
      "owner"
    );

    ws.send(
      JSON.stringify({
        type: "connected",
        clientId: session.clientId,
      })
    );

    ws.on("message", (data) => {
      try {
        const rawMessage: unknown = JSON.parse(
          data.toString()
        );

        if (!validateMessage(rawMessage)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message",
            })
          );

          return;
        }

        if (rawMessage.type === "join") {
          const session = clientSessions.get(ws);

          if (!session) {
            return;
          }

          const hasReadAccess =
            accessService.canAccess(
              rawMessage.documentId,
              session.clientId,
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

          const room = getRoom(
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

        if (rawMessage.type === "operation") {
          const room = clientRooms.get(ws);
          const session = clientSessions.get(ws);

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
              session.clientId,
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

          const isValidIdentity =
            session.validateOperationIdentity(
              rawMessage.operation
            );

          if (!isValidIdentity) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid operation identity",
              })
            );

            return;
          }

          room.handleOperation(
            rawMessage.operation,
            ws
          );
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
      clientSessions.delete(ws);
    });
  });

  return wss;
}