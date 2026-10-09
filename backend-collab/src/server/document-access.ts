// src/server/document-access.ts

export type DocumentRole = "owner" | "editor" | "viewer";

export type PermissionAction = "read" | "write";

export type DocumentPermission = {
  userId: string;
  documentId: string;
  role: DocumentRole;
};

export class DocumentAccessService {
  private permissions = new Map<
    string,
    Map<string, DocumentRole>
  >();

  grantPermission(
    documentId: string,
    userId: string,
    role: DocumentRole
  ): void {
    let documentPermissions = this.permissions.get(documentId);

    if (!documentPermissions) {
      documentPermissions = new Map();
      this.permissions.set(documentId, documentPermissions);
    }

    documentPermissions.set(userId, role);
  }

  revokePermission(
    documentId: string,
    userId: string
  ): void {
    const documentPermissions = this.permissions.get(documentId);

    if (!documentPermissions) {
      return;
    }

    documentPermissions.delete(userId);

    if (documentPermissions.size === 0) {
      this.permissions.delete(documentId);
    }
  }

  getRole(
    documentId: string,
    userId: string
  ): DocumentRole | null {
    return (
      this.permissions.get(documentId)?.get(userId) ?? null
    );
  }

  canAccess(
    documentId: string,
    userId: string,
    action: PermissionAction
  ): boolean {
    const role = this.getRole(documentId, userId);

    if (!role) {
      return false;
    }

    if (action === "read") {
      return true;
    }

    return role === "owner" || role === "editor";
  }
}