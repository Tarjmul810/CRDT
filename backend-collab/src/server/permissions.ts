export type DocumentRole =
  | "owner"
  | "editor"
  | "viewer";

export type PermissionAction =
  | "read"
  | "write";

export type DocumentPermission = {
  clientId: string;
  documentId: string;
  role: DocumentRole;
};