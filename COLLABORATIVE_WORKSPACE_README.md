# Collaborative Workspace

A real-time collaborative workspace built from the ground up around **CRDTs, WebSockets, synchronization, offline recovery, and a React/Next.js editor**.

The long-term goal is a **Notion + Figma-style collaborative workspace** where multiple users can edit documents simultaneously, work offline, reconnect safely, and eventually scale across multiple backend instances.

---

## Current Architecture

```text
                         ┌─────────────────────────┐
                         │       Next.js UI         │
                         │  React 19 / Next.js 16   │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │   DocumentSession        │
                         │  Single source of truth  │
                         └────────────┬────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
                ┌──────────────────┐     ┌──────────────────┐
                │ DocumentState    │     │ DocumentSyncClient│
                │                  │     │                  │
                │ BlockList        │     │ WebSocket        │
                │ BlockContent     │     │ Sync / ACK       │
                │ CRDT state       │     │ Recovery         │
                └──────────────────┘     └────────┬─────────┘
                                                   │
                                                   ▼
                                      ┌────────────────────────┐
                                      │     WebSocket Server    │
                                      │                         │
                                      │ Auth / Authorization   │
                                      │ Rooms                  │
                                      │ Persistence            │
                                      │ Snapshots              │
                                      │ Sync / ACK / Recovery  │
                                      └────────────────────────┘
```

---

# Project Structure

```text
collab/
├── backend-collab/
│   ├── src/
│   │   ├── crdt/
│   │   ├── document/
│   │   ├── server/
│   │   ├── sync/
│   │   └── shared.ts
│   └── package.json
│
└── collaborative-workspace/
    ├── app/
    │   ├── page.tsx
    │   └── workspace/
    │       └── [documentId]/
    │           └── page.tsx
    ├── components/
    │   └── workspace/
    │       ├── WorkspaceShell.tsx
    │       ├── Sidebar.tsx
    │       ├── DocumentHeader.tsx
    │       └── BlockEditor.tsx
    ├── lib/
    │   └── collaboration/
    │       ├── document-session.ts
    │       ├── document-session-provider.tsx
    │       └── use-document-session.ts
    ├── next.config.ts
    └── package.json
```

---

# Backend

The backend was intentionally built first so that the frontend would eventually consume a real collaborative document engine rather than a local React state implementation.

## Backend Technology

- Node.js
- TypeScript
- Vitest
- WebSocket (`ws`)
- Custom CRDT implementation
- In-memory persistence for the current stage
- IndexedDB on the client for offline persistence
- No Redis/PostgreSQL yet

---

# Backend Progress

## 1. RGA CRDT — COMPLETE

Implemented a Replicated Growable Array (RGA).

The RGA provides the fundamental data structure for collaborative ordered data.

It supports:

- Insert operations
- Delete operations
- Element IDs
- Client IDs
- Sequence numbers
- Tombstones
- Applying remote operations
- Serialization/restoration
- Deterministic ordering

The same CRDT foundation is used for:

- Document block ordering
- Block text content

---

## 2. Version Vectors — COMPLETE

Implemented version-vector tracking for distributed state.

This provides the foundation for determining:

- Which operations a client has seen
- Which operations are missing
- Whether a client is ahead/behind
- Synchronization boundaries
- Offline recovery

---

## 3. Operation Protocol — COMPLETE

Created a typed operation protocol around the CRDT.

Document-level operations include:

```text
insert_block
delete_block
insert_text
delete_text
```

The protocol separates document operations from the underlying CRDT operations.

---

## 4. WebSocket Server — COMPLETE

Implemented a WebSocket-based real-time server.

The server supports:

- Client connections
- Message parsing
- Message validation
- Authentication flow
- Document operation messages
- Synchronization requests
- Synchronization responses
- Broadcasting operations
- ACK handling

---

## 5. Authentication — COMPLETE

Implemented the initial authentication/session flow.

A connected client receives a stable identity/session context.

The system tracks:

```text
userId
sessionId
clientId
```

The client identity is important because CRDT operation IDs depend on client identity.

---

## 6. Authorization — COMPLETE

Implemented document access checks.

The server distinguishes between:

```text
read
write
```

permissions.

Unauthorized clients cannot perform operations they are not allowed to perform.

---

## 7. Rooms — COMPLETE

Documents are represented as collaboration rooms.

Clients connected to the same document can receive operations from one another without broadcasting every operation to unrelated documents.

Conceptually:

```text
Document A
 ├── Client 1
 ├── Client 2
 └── Client 3

Document B
 ├── Client 4
 └── Client 5
```

---

## 8. Operation Persistence — COMPLETE

Implemented operation persistence at the current in-memory stage.

The server stores document operations with monotonically increasing server versions.

This allows clients to request operations after a known version.

---

## 9. Snapshots — COMPLETE

Implemented document state snapshots.

Snapshots contain the serialized CRDT/document state rather than requiring the entire operation history to reconstruct the document.

The document state includes:

- Block list CRDT state
- Block text CRDT state

---

## 10. Sync Protocol — COMPLETE

Implemented synchronization between client and server.

The basic flow is:

```text
Client
  │
  │ document_sync_request
  │ afterVersion = X
  ▼
Server
  │
  │ missing operations
  ▼
Client
  │
  └── applies missing operations
```

---

## 11. ACKs — COMPLETE

Implemented acknowledgements for operations.

The client can distinguish between:

```text
created locally
        ↓
sent
        ↓
acknowledged by server
```

This distinction is important for offline/reconnect recovery.

---

## 12. Idempotent Retransmission — COMPLETE

The system handles duplicate operations safely.

If a client retransmits an operation after losing a connection, the server can recognize an already-known operation instead of applying it twice.

Operation identity is based on the operation's client/sequence identity.

---

## 13. SyncState — COMPLETE

Implemented synchronization state tracking.

This established the concepts needed for:

- Server version
- Acknowledged operations
- Pending operations
- Missing operations
- Recovery after reconnect

---

## 14. SyncClient — COMPLETE / LEGACY

An initial generic `SyncClient`/`SyncState` implementation was built during the backend development.

The project later moved toward a document-specific synchronization layer:

```text
DocumentSyncClient
```

The older generic implementation is therefore considered transitional/legacy and should not be expanded unless specifically needed.

---

## 15. Real WebSocket Integration — COMPLETE

The backend was tested with actual WebSocket connections rather than only isolated unit tests.

The integration tests covered:

- Local operations
- Remote broadcast
- ACKs
- Reconnect
- Synchronization
- Pending operation recovery
- Convergence

---

## 16. Stable Reconnect Identity — COMPLETE

The system preserves client identity across reconnects.

This matters because changing identity during reconnect would make CRDT operation identity and pending-operation recovery unreliable.

---

## 17. Basic Reconnect — COMPLETE

Clients can reconnect and synchronize with the server.

The intended flow is:

```text
Connected
   ↓
Connection lost
   ↓
Operations may remain pending
   ↓
Reconnect
   ↓
Synchronize
   ↓
Recover pending operations
   ↓
Converge
```

---

## 18. Local vs Acknowledged Version Vector — COMPLETE

The system distinguishes local CRDT state from state that the server has acknowledged.

This is necessary for reliable offline and reconnect behavior.

---

## 19. Lost / Unacknowledged Operation Recovery — COMPLETE

Operations that were created locally but not acknowledged before a connection failure can be recovered and retransmitted.

This is one of the key reliability properties of the system.

---

## 20. Offline Persistence — COMPLETE

Implemented local persistence infrastructure using IndexedDB.

The local store is responsible for retaining information needed across connection failures and browser reloads.

The newer document synchronization path stores:

```text
DocumentOperation
DocumentStateSnapshot
```

---

## 21. Document / Block Model — COMPLETE

The document model currently contains:

```ts
type BlockType = "paragraph" | "heading" | "todo";

type Block = {
  id: string;
  type: BlockType;
};

type Document = {
  id: string;
  blocks: Block[];
};
```

Important:

**Block text is not stored directly inside `Block`.**

Text is maintained separately by `BlockContent`.

This gives us:

```text
DocumentState
├── BlockList
│   └── ordered blocks
│
└── BlockContent
    ├── block 1 text CRDT
    ├── block 2 text CRDT
    └── ...
```

---

## 22. Richer CRDT Operations — PARTIALLY COMPLETE

The system supports:

```text
insert_block
delete_block
insert_text
delete_text
```

Text is represented using a separate CRDT for each block.

However, some higher-level editor operations are still missing.

Not implemented yet:

- Update block type as a CRDT operation
- Todo checked/unchecked state
- Rich text formatting
- Block attributes
- Nested blocks
- Block metadata

---

## 23. Final Backend Integration Suite — COMPLETE

The core backend synchronization/integration test suite was completed successfully during development.

The backend is therefore at a strong foundation stage.

---

# Backend Current State

The backend currently has the important distributed-systems foundation:

```text
CRDT
 ↓
Document State
 ↓
Operations
 ↓
WebSocket
 ↓
Authentication
 ↓
Authorization
 ↓
Rooms
 ↓
Persistence
 ↓
Snapshots
 ↓
Synchronization
 ↓
ACKs
 ↓
Reconnect
 ↓
Offline recovery
```

This is the core of the project.

---

# Frontend

The frontend is built using:

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4

The frontend is currently in the transition from a normal local editor to a CRDT-backed collaborative editor.

---

# Frontend Progress

## 24. Workspace Shell — COMPLETE

Created the main workspace layout.

Current structure:

```text
Workspace
├── Sidebar
└── Main Area
    ├── Document Header
    └── Editor
```

The UI uses a dark workspace aesthetic.

---

## 25. Document / Block UI — IN PROGRESS

The initial block editor has been connected to `DocumentSession`.

The editor can currently render:

```text
Heading
Paragraph
To-do
```

The editor also supports basic structural interactions:

- Add block
- Enter → add block
- Backspace on empty block → delete block
- Focus newly created blocks

These operations now work against the document/CRDT model rather than a React `useState<Block[]>` document.

---

## 26. DocumentSession — IMPLEMENTED

`DocumentSession` is intended to be the frontend's document-level source of truth.

Its responsibility is to provide a clean interface between React and the document CRDT.

Conceptually:

```text
React
  ↓
DocumentSession
  ↓
DocumentState
  ↓
CRDTs
```

It exposes operations such as:

```text
insertBlock()
deleteBlock()
insertText()
deleteText()
getBlocks()
getText()
serialize()
restore()
subscribe()
```

Remote operations use:

```text
applyOperation()
```

---

## 27. React Subscription Layer — IMPLEMENTED / NEEDS VALIDATION

A React provider and subscription hook have been created:

```text
DocumentSessionProvider
useDocumentSessionContext()
useDocumentSession()
```

The goal is:

```text
CRDT changes
     ↓
DocumentSession notification
     ↓
React subscription
     ↓
UI re-render
```

There is currently one implementation detail that needs correction/validation:

`useSyncExternalStore` should use a cached/primitive snapshot value rather than calling `session.serialize()` directly as the snapshot, because serialization creates a new object.

The recommended solution is to maintain a session version counter:

```text
DocumentSession
├── version
├── subscribe()
└── getVersion()
```

and have React subscribe to that version.

---

## 28. Shared Backend Package — IMPLEMENTED

The backend exposes shared document/CRDT types through:

```text
backend-collab/shared
```

The shared package exports:

- `DocumentSession`
- `DocumentState`
- `Block`
- `BlockId`
- `BlockType`
- `Document`
- `DocumentOperation`
- Block operation types
- Text operation types
- CRDT element/operation types

The frontend is intended to consume these shared types without directly importing backend server-only code.

---

## 29. Frontend ↔ Backend Package Boundary — IMPLEMENTED / CURRENTLY BEING FIXED

The frontend uses:

```json
"backend-collab": "file:../backend-collab"
```

and Next.js is configured with:

```ts
transpilePackages: ["backend-collab"]
```

The current package resolution issue is:

```text
Module not found: Can't resolve 'backend-collab/shared'
```

This is a local package installation/resolution issue, not a CRDT architecture issue.

The intended architecture remains:

```text
frontend
   ↓
backend-collab/shared
   ↓
shared document/CRDT code
```

The package installation and Windows `EPERM` cleanup issue still needs to be resolved.

---

# Frontend Work Remaining

## 30. Connect Editor to Text CRDT — NEXT

This is the immediate major task.

Currently the editor renders CRDT text but the input handler does not yet generate text operations.

The current placeholder is effectively:

```text
onChange
   ↓
console.log(...)
```

This needs to become:

```text
user types
   ↓
derive insertion/deletion
   ↓
DocumentSession.insertText()
       OR
DocumentSession.deleteText()
   ↓
BlockContent CRDT
   ↓
DocumentSession notification
   ↓
React rerender
```

This should initially support:

- Typing
- Backspace
- Delete
- Cursor positioning
- Multiple characters
- Correct CRDT element targeting

---

# 31. Fix Document-Level Text Operation Identity — REQUIRED

There is an important operation identity issue that must be resolved before full networked text synchronization.

Text currently has two identities:

```text
Document operation ID
        +
Inner text CRDT operation ID
```

The current `DocumentState.insertText()` implementation derives the outer operation ID from the inner text operation.

That is not the final correct architecture.

The system needs a clean distinction between:

```text
network/document operation identity
```

and:

```text
block-content CRDT element identity
```

This must be fixed before relying on text operations over the WebSocket synchronization layer.

Do not solve this by blindly adding another sequence counter without adjusting the operation model; block operations currently couple their document operation ID to their CRDT element ID.

---

# 32. Connect DocumentSyncClient to the Browser — NEXT AFTER TEXT

The current `DocumentSyncClient` uses Node's:

```ts
import { WebSocket } from "ws";
```

That is appropriate for the backend/tests but is not the browser's native WebSocket implementation.

The browser client should eventually use:

```ts
globalThis.WebSocket
```

or a browser-compatible transport abstraction.

Target architecture:

```text
React
  ↓
DocumentSession
  ↓
DocumentSyncClient
  ├── Browser WebSocket
  └── LocalStore
        ↓
      IndexedDB
```

---

# 33. Connect Local Operations to Network — PENDING

Once browser WebSocket transport is ready:

```text
Editor action
     ↓
DocumentSession
     ↓
DocumentOperation
     ↓
DocumentSyncClient
     ↓
WebSocket
     ↓
Server
```

Remote:

```text
Server
  ↓
WebSocket
  ↓
DocumentSyncClient
  ↓
DocumentSession.applyOperation()
  ↓
CRDT
  ↓
React
```

---

# 34. Multi-User Collaboration UI — PENDING

Once two browser clients can synchronize documents, test:

```text
Browser A
    ↕
 WebSocket
    ↕
 Server
    ↕
 WebSocket
    ↕
Browser B
```

The first goal is convergence.

Example:

```text
Client A types:

Hello

Client B should see:

Hello
```

without manually refreshing.

---

# 35. Presence — PENDING

Add online users and connection presence.

Possible model:

```text
User
├── userId
├── clientId
├── name
├── avatar
└── status
```

UI:

```text
● Tarjmul
● User 2
● User 3
```

Presence does not need to be part of the document CRDT itself.

---

# 36. Cursor / Selection Synchronization — PENDING

After basic collaboration works, synchronize:

- Cursor position
- Text selection
- Active block
- User identity

Example:

```text
Tarjmul's cursor
        ↓
Block 4, offset 12
```

Other clients can render that cursor.

Cursor state should be treated separately from persistent document state.

---

# 37. Offline / Reconnect UI — PENDING

The backend already has the foundations for offline recovery.

The frontend should expose the state visually:

```text
● Saved
● Saving...
○ Offline
↻ Reconnecting...
✓ Synced
```

The UI should not confuse:

```text
local state
```

with:

```text
server acknowledged state
```

---

# 38. PostgreSQL Persistence — FUTURE

Current persistence is in-memory.

The next infrastructure stage is PostgreSQL.

Potential responsibilities:

```text
PostgreSQL
├── users
├── documents
├── document_members
├── document_operations
└── snapshots
```

This will make document state survive backend restarts.

---

# 39. Redis Pub/Sub — FUTURE

Once PostgreSQL persistence works, introduce Redis for multi-instance WebSocket communication.

Current:

```text
Client
 ↓
Server instance
 ↓
Room
```

Future:

```text
                    ┌── Server A
Client 1 ───────────┤
                    │
                    ├── Redis Pub/Sub
                    │
Client 2 ───────────┤
                    └── Server B
```

This allows clients connected to different backend instances to collaborate.

---

# 40. Horizontal Scaling — FUTURE

After Redis:

```text
Load Balancer
      │
 ┌────┴────┐
 ▼         ▼
WS A      WS B
 │         │
 └────┬────┘
      ▼
    Redis
      │
      ▼
 PostgreSQL
```

This is the eventual production architecture.

---

# 41. Load Testing — FUTURE

Test:

- Many concurrent users
- Large documents
- High operation rates
- Reconnect storms
- Duplicate operations
- Offline clients
- Large synchronization batches

Important metrics:

```text
operations/sec
broadcast latency
sync latency
memory usage
CPU usage
WebSocket connections
database latency
Redis latency
```

---

# 42. Deployment & Observability — FUTURE

Production deployment will eventually need:

- Docker
- Environment configuration
- Logging
- Metrics
- Error tracking
- Health checks
- WebSocket monitoring
- Database monitoring
- Redis monitoring

Potential architecture:

```text
Frontend
   ↓
CDN / Hosting
   ↓
API / WebSocket Load Balancer
   ↓
WS Instances
   ↓
Redis
   ↓
PostgreSQL
```

---

# Current Status

## Backend

| Component | Status |
|---|---|
| RGA CRDT | ✅ Complete |
| Version vectors | ✅ Complete |
| Operation protocol | ✅ Complete |
| WebSocket server | ✅ Complete |
| Authentication | ✅ Complete |
| Authorization | ✅ Complete |
| Rooms | ✅ Complete |
| Operation persistence | ✅ Complete |
| Snapshots | ✅ Complete |
| Sync protocol | ✅ Complete |
| ACKs | ✅ Complete |
| Idempotent retransmission | ✅ Complete |
| SyncState | ✅ Complete |
| Reconnect | ✅ Complete |
| Stable identity | ✅ Complete |
| Offline recovery | ✅ Complete |
| IndexedDB persistence | ✅ Complete |
| Document model | ✅ Complete |
| Block CRDT | ✅ Complete |
| Text CRDT foundation | ✅ Complete |
| Backend integration tests | ✅ Complete |
| PostgreSQL | ⏳ Future |
| Redis | ⏳ Future |
| Horizontal scaling | ⏳ Future |
| Load testing | ⏳ Future |
| Production deployment | ⏳ Future |

## Frontend

| Component | Status |
|---|---|
| Next.js workspace | ✅ Complete |
| Workspace shell | ✅ Complete |
| Sidebar | ✅ Complete |
| Document header | ✅ Complete |
| Block editor UI | 🟡 In progress |
| DocumentSession provider | 🟡 Implemented |
| React subscription | 🟡 Needs validation/fix |
| CRDT block rendering | ✅ Complete |
| Block insertion | ✅ Complete |
| Block deletion | ✅ Complete |
| Text CRDT editing | ⏳ Next |
| Document operation identity cleanup | ⏳ Required |
| Browser WebSocket client | ⏳ Next |
| Networked editor | ⏳ Pending |
| Multi-user editing | ⏳ Pending |
| Presence | ⏳ Pending |
| Cursor synchronization | ⏳ Pending |
| Offline UI | ⏳ Pending |
| Reconnect UI | ⏳ Pending |

---

# Immediate Roadmap

The recommended order from the current point is:

```text
CURRENT
  │
  ▼
Fix frontend package resolution
  │
  ▼
Fix useSyncExternalStore snapshot/versioning
  │
  ▼
Implement text editing through BlockContent CRDT
  │
  ▼
Fix document-level text operation identity
  │
  ▼
Make DocumentSyncClient browser-compatible
  │
  ▼
Connect editor operations to WebSocket
  │
  ▼
Test two browser clients
  │
  ▼
Verify convergence
  │
  ▼
Presence
  │
  ▼
Cursors / selections
  │
  ▼
Offline/reconnect UI
  │
  ▼
PostgreSQL
  │
  ▼
Redis Pub/Sub
  │
  ▼
Multi-instance WebSocket server
  │
  ▼
Load testing
  │
  ▼
Deployment + observability
```

---

# Design Principles

## 1. DocumentSession is the frontend source of truth

React should not maintain a second independent document state.

Avoid:

```text
React useState
      +
CRDT state
```

Prefer:

```text
CRDT state
     ↓
DocumentSession
     ↓
React subscription
```

---

## 2. Local and remote operations follow different paths

Local:

```text
User action
 ↓
DocumentSession.insert/delete
 ↓
CRDT mutates locally
 ↓
React notified
 ↓
Operation sent to server
```

Remote:

```text
WebSocket
 ↓
DocumentSyncClient
 ↓
DocumentSession.applyOperation
 ↓
CRDT applies operation
 ↓
React notified
```

A local operation should **not** be applied a second time through `applyOperation()`.

---

## 3. CRDT state is authoritative

React is a view of the document.

The editor should not invent its own independent version of:

- block ordering
- text
- remote changes
- synchronization state

---

## 4. Persistent document state and ephemeral collaboration state are separate

Persistent:

```text
blocks
text
block types
future formatting
```

Ephemeral:

```text
cursor
selection
presence
typing indicator
connection status
```

This distinction will become important as collaboration features grow.

---

# Long-Term Goal

The final project should evolve into a production-style collaborative workspace:

```text
                         ┌──────────────────┐
                         │   Next.js App    │
                         └────────┬─────────┘
                                  │
                           DocumentSession
                                  │
                         DocumentSyncClient
                                  │
                         Browser WebSocket
                                  │
                         ┌────────▼─────────┐
                         │ Load Balancer    │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
              WebSocket A                 WebSocket B
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                              Redis
                            Pub/Sub
                                  │
                              PostgreSQL
                                  │
                       Persistent Documents
```

The project is intentionally being built from the CRDT and synchronization layer upward so that the final application demonstrates genuine distributed-systems engineering rather than simply being a CRUD editor with a WebSocket attached.
