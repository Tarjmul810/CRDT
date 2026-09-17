import { randomUUID } from "node:crypto";

export class User {
  public readonly userId: string;

  constructor(userId?: string) {
    this.userId = userId ?? randomUUID();
  }
}