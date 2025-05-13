# API Update Problem Analysis

## Problem Description

When two users have the same document open and one user updates the document using the API (by setting the "text" property), the content set by the API is not displayed to the other user who has the document open. This appears to be related to the real-time collaboration system (YJS) maintaining its own state that doesn't get updated when changes come through the API.

## Technical Analysis

### Current Document Update Flow

1. **API Update Flow**:
   - When a document is updated via the API (`documents.update` endpoint), the server processes the update through `documentUpdater` command.
   - If the `text` property is provided, `DocumentHelper.applyMarkdownToDocument()` is called, which:
     - Updates the `text` field of the document
     - Parses the markdown into a Prosemirror node
     - Sets the `content` field with the JSON representation of the node
   - The document is saved to the database
   - An event `documents.update` is emitted through the websocket system

2. **Collaborative Editing Flow**:
   - When users edit a document through the UI, changes are handled by the collaborative editing system
   - The client uses `HocuspocusProvider` to connect to the collaboration websocket
   - Changes are synchronized using YJS (CRDT)
   - The server maintains a collaborative state (`state` field in the Document model) that represents the YJS document
   - When users make changes, they're applied to the YJS document and synchronized between clients

3. **The Disconnect**:
   - When a document is updated via API, only the `text` and `content` fields are updated
   - The `state` field (YJS collaborative state) is not updated to reflect these changes
   - Users who have the document open are connected to the collaborative system, which is using the outdated YJS state
   - The websocket event for document update is received, but the client doesn't refresh the document content if it's in edit mode

### Root Cause

The root cause of the issue is that the API update flow and the collaborative editing flow operate independently:

1. API updates modify `text` and `content` but not the collaborative `state`
2. Users with the document open are using the collaborative system, which relies on the `state` field
3. There's no mechanism to synchronize API-originated changes with the collaborative state
4. The client doesn't force a refresh of document content when it receives an update event while in edit mode

## Proposed Solution

To solve this issue, we need to ensure that API updates are properly synchronized with the collaborative editing system. Here's a comprehensive solution:

### 1. Server-side: Update Collaborative State on API Updates

Modify the `documentUpdater` command to update the YJS state when a document is updated via API:

```typescript
// In server/commands/documentUpdater.ts
if (text !== undefined) {
  document = DocumentHelper.applyMarkdownToDocument(document, text, append);
  
  // Also update the collaborative state
  if (document.state) {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, document.state);
    
    // Apply the new content to the YJS document
    const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
    const doc = parser.parse(document.text);
    
    // Clear existing content and apply new content
    type.delete(0, type.length);
    updateYFragment(type.doc, type, doc, new Map());
    
    // Update the state
    document.state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
  }
}
```

### 2. Server-side: Add API Update Flag to Events

Modify the event creation to include a flag indicating the update came from the API:

```typescript
// In server/commands/documentUpdater.ts
await Event.createFromContext(ctx, {
  ...event,
  data: {
    ...event.data,
    isApiUpdate: true,
  },
});
```

### 3. Server-side: Broadcast Update to Collaboration Service

Add a mechanism to notify the collaboration service about API updates:

```typescript
// In server/commands/documentUpdater.ts
// After document is saved
if (changed && document.state) {
  // Notify collaboration service about the update
  await NotifyCollaborationService({
    documentId: document.id,
    force: true,
  });
}
```

### 4. Client-side: Handle API Updates in Collaborative Editor

Modify the `MultiplayerEditor` component to handle API updates:

```typescript
// In app/scenes/Document/components/MultiplayerEditor.tsx
provider.on("update", (update) => {
  // Check if this update is a forced update from the server (API update)
  if (update.isForced) {
    // Force reload the document content
    if (!isEditing) {
      // In view mode, silently refresh
      document.fetch({ force: true });
    } else {
      // In edit mode, show warning
      toast.warning(t("This document has been updated via API"), {
        duration: 6000,
        description: t("Your changes may conflict with the API changes."),
        icon: <AlertTriangleIcon />,
      });
    }
  }
});
```

### 5. Client-side: Update WebsocketProvider to Handle API Updates

Enhance the WebsocketProvider to properly handle API updates:

```typescript
// In app/components/WebsocketProvider.tsx
this.socket.on(
  "documents.update",
  action((event: WebsocketDocumentUpdateEvent) => {
    documents.add(event);

    if (event.collectionId) {
      const collection = collections.get(event.collectionId);
      collection?.updateDocument(event);
    }

    // Handle API updates
    if (event.id && event.data?.isApiUpdate) {
      const documentId = event.id;
      const document = documents.get(documentId);

      // Check if this document is currently active
      if (this.props.ui.activeDocumentId === documentId) {
        const editor = document?.editor;
        const isEditing = editor && !editor.props.readOnly;

        if (isEditing) {
          // In edit mode: show a warning
          toast.warning(t("This document has been updated via API"), {
            duration: 6000,
            description: t("Your changes may conflict with the API changes."),
            icon: <AlertTriangleIcon />,
          });
          
          // Set a flag on the document to show a warning icon
          document.lastApiUpdate = new Date().toISOString();
        } else {
          // In view mode: automatically refresh the document content
          document.fetch({ force: true });
        }
      }
    }
  })
);
```

## Implementation Considerations

1. **Backward Compatibility**: This solution maintains backward compatibility with existing API clients.

2. **Performance**: Updating the YJS state for API updates adds some overhead, but it's necessary to ensure consistency.

3. **Race Conditions**: Care must be taken to handle potential race conditions between collaborative edits and API updates.

4. **Custom Header Option**: As suggested, we could add support for a custom header in API calls to control behavior:
   ```
   X-Force-Update: true
   ```
   This would allow API clients to explicitly force updates to all connected clients.

## Conclusion

The root cause of the issue is that API updates and collaborative editing operate on different data structures (`content` vs `state`), and there's no synchronization between them. By updating the YJS collaborative state when API updates occur and enhancing the client to handle these updates appropriately, we can ensure that all users see the latest content regardless of how it was updated.

This solution maintains the benefits of real-time collaboration while ensuring that API updates are properly reflected for all users.
