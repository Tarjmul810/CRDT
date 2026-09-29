import { WebSocketServer, WebSocket } from "ws";
import { Room } from "./room";
import { RGA } from "../crdt/rga";
import { validateMessage } from "./validator";
import { ClientSession } from "./client-session";
import { InMemoryOperationStore } from "./memory-operation-store";
import { InMemoryDocumentStore } from "./memory-document-store";

const rooms = new Map<string, Room>();
const clientRooms = new Map<WebSocket, Room>();
const clientSessions = new Map<WebSocket, ClientSession>();

const operationStore = new InMemoryOperationStore();
const documentStore = new InMemoryDocumentStore();

function getRoom(documentId: string): Room {
    let room = rooms.get(documentId);

    if (!room) {
        room = new Room(
            documentId,
            new RGA("server"), 
            operationStore,
            documentStore
        );

        rooms.set(documentId, room);
    }

    return room;
}

const wss = new WebSocketServer({
    port: 8080,
});

wss.on("connection", (socket: WebSocket) => {
    console.log("Client connected");

    const session = new ClientSession(crypto.randomUUID());

    clientSessions.set(socket, session);

    socket.send(
        JSON.stringify({
            type: "connected",
            clientId: session.clientId,
        })
    );

    socket.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (!validateMessage(message)) {
                socket.send(
                    JSON.stringify({
                        type: "error",
                        message: "Invalid message",
                    })
                );

                return;
            }

            if (message.type === "join") {

                

                const existingRoom = clientRooms.get(socket);

                if (existingRoom) {
                    socket.send(
                        JSON.stringify({
                            type: "error",
                            message: "Already joined a document",
                        })
                    );

                    return;
                }
                const room = getRoom(message.documentId);

                room.addClient(socket);

                clientRooms.set(socket, room);

                console.log(
                    `Client joined ${message.documentId}`
                );

                socket.send(
                    JSON.stringify({
                        type: "joined",
                        documentId: message.documentId,
                    })
                );

                return;
            }

            if (message.type === "operation") {
                const room = clientRooms.get(socket);
                const session = clientSessions.get(socket);

                if (!room || !session) {
                    socket.send(
                        JSON.stringify({
                            type: "error",
                            message: "Join a document first",
                        })
                    );

                    return;
                }

                const isValid = session.validateOperationIdentity(
                    message.operation
                );

                if (!isValid) {
                    socket.send(
                        JSON.stringify({
                            type: "error",
                            message: "Invalid operation",
                        })
                    );

                    return;
                }

                room.handleOperation(
                    message.operation,
                    socket
                );
            }
        } catch (error) {
            socket.send(
                JSON.stringify({
                    type: "error",
                    message: "Invalid message",
                })
            )};
    })

    socket.on("close", () => {
        const room = clientRooms.get(socket);

        if (room) {
            room.removeClient(socket);
            clientRooms.delete(socket);
        }

        console.log("Client disconnected");
    });
});

console.log("WebSocket server running on ws://localhost:8080");