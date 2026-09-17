import type {
  DocumentPermission,
  DocumentRole,
  PermissionAction,
} from "./permissions";

export class DocumentAccessService {
  private permissions = new Map<
    string,
    Map<string, DocumentRole>
  >();

  grantPermission(
    documentId: string,
    clientId: string,
    role: DocumentRole
  ): void {
    let documentPermissions = this.permissions.get(
      documentId
    );

    if (!documentPermissions) {
      documentPermissions = new Map();

      this.permissions.set(
        documentId,
        documentPermissions
      );
    }

    documentPermissions.set(clientId, role);
  }

  revokePermission(
    documentId: string,
    clientId: string
  ): void {
    const documentPermissions = this.permissions.get(
      documentId
    );

    if (!documentPermissions) {
      return;
    }

    documentPermissions.delete(clientId);

    if (documentPermissions.size === 0) {
      this.permissions.delete(documentId);
    }
  }

  getRole(
    documentId: string,
    clientId: string
  ): DocumentRole | null {
    return (
      this.permissions
        .get(documentId)
        ?.get(clientId) ?? null
    );
  }

  canAccess(
    documentId: string,
    clientId: string,
    action: PermissionAction
  ): boolean {
    const role = this.getRole(
      documentId,
      clientId
    );

    if (!role) {
      return false;
    }

    if (action === "read") {
      return true;
    }

    return role === "owner" || role === "editor";
  }
}