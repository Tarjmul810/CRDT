import { WebSocket } from "ws";
import { RGA } from "../crdt/rga";
import type { Operation } from "../crdt/type";

export class Room {
  private clients = new Set<WebSocket>();

  constructor(
    public readonly documentId: string,
    private readonly rga: RGA
  ) { }

  addClient(socket: WebSocket): void {
    this.clients.add(socket);
  }

  removeClient(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  broadcast(
    operation: Operation,
    sender: WebSocket
  ): void {
    const message = JSON.stringify({
      type: "operation",
      operation,
    });

    for (const client of this.clients) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  applyOperation(operation: Operation): void {
    this.rga.apply(operation);
  }

  handleOperation(
    operation: Operation,
    sender: WebSocket
  ): void {
    this.rga.apply(operation);

    this.broadcast(
      operation,
      sender
    );
  }

  getText(): string {
    return this.rga.getText();
  }
}