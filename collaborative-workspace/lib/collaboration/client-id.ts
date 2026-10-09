"use client";

const STORAGE_KEY = "collab-client-id";

export function getClientId(): string {
  const existing = window.localStorage.getItem(
    STORAGE_KEY,
  );

  if (existing) {
    return existing;
  }

  const clientId = crypto.randomUUID();

  window.localStorage.setItem(
    STORAGE_KEY,
    clientId,
  );

  return clientId;
}