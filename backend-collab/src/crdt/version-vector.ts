export class VersionVector {
  private versions = new Map<string, number>();

  get(clientId: string): number {
    return this.versions.get(clientId) ?? 0;
  }

  increment(clientId: string): number {
    const next = this.get(clientId) + 1;

    this.versions.set(clientId, next);

    return next;
  }

  update(clientId: string, sequence: number): void {
    const current = this.get(clientId);

    if (sequence > current) {
      this.versions.set(clientId, sequence);
    }
  }

  lessThanOrEqual(other: VersionVector): boolean {
  const clients = new Set([
    ...this.versions.keys(),
    ...other.versions.keys(),
  ]);

  for (const clientId of clients) {
    if (this.get(clientId) > other.get(clientId)) {
      return false;
    }
  }

  return true;
}

equals(other: VersionVector): boolean {
  return (
    this.lessThanOrEqual(other) &&
    other.lessThanOrEqual(this)
  );
}

toJSON(): Record<string, number> {
    return Object.fromEntries(this.versions);
}

static fromJSON(
    data: Record<string, number>
): VersionVector {
    const vector = new VersionVector();

    for (const [clientId, sequence] of Object.entries(data)) {
        vector.update(clientId, sequence);
    }

    return vector;
}
}