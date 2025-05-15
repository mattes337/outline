# Document Auto-Refresh and AI Progress Implementation

This document outlines the implementation plan for notifying users when a document is updated via API while they are viewing or editing it, and for showing AI editing progress.

## Problem Statement

When a user has a document open and that document is updated via API (not by another user), the user should:

- Be notified about the update
- In view mode: reload the document automatically without reloading the window to avoid flickering
- In edit mode: show a warning icon left of the "Done editing" button with a tooltip saying that the document has been changed by AI

## Issues to Fix

1. **Document refresh not working for user-originated updates**: Currently, the refresh functionality only works for API-originated updates but not for user-originated updates. The content should always be reloaded regardless of whether the current user is the initiator of the change.

2. **Warning icon not shown for progress notifications**: When a "Showing progress notification for active document" event is received, the toast is shown, but the "edit" button is not changed to display a warning icon.

3. **No banner for updated documents in edit mode**: When in edit mode and a document update is received, there should be a banner at the top of the document indicating that a new version is available, with a button to "revert local changes and switch to newest version".

4. **YJS State Synchronization**: When a document is updated via API, the YJS collaborative state is not properly synchronized, causing users who have the document open to not see the updates.

## Implementation Details

### 1. Document Auto-Refresh

#### Server-side Changes

1. Add API Update Flag to Events:
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

2. Update YJS State on API Updates:
```typescript
// In server/commands/documentUpdater.ts
if (text !== undefined) {
  document = DocumentHelper.applyMarkdownToDocument(document, text, append);

  // Update the collaborative state if it exists
  if (document.state) {
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, document.state);

    // Use a transaction for atomic updates
    ydoc.transact(() => {
      const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
      const doc = parser.parse(document.text);

      if (!type.doc) {
        throw new Error("type.doc not found");
      }

      // Clear existing content and apply new content
      type.delete(0, type.length);
      updateYFragment(type.doc, type, doc, new Map());
    }, 'api-update');

    // Update the state
    document.state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    document.changed("state", true);
  }
}
```

#### Client-side Changes

1. Update Document Model:
```typescript
// In app/models/Document.ts
@observable
aiProgressInfo: string | null = null;

// Virtual property to track API updates
_lastApiUpdate: string | null = null;

get lastApiUpdate(): string | null {
  return this._lastApiUpdate;
}

set lastApiUpdate(value: string | null) {
  this._lastApiUpdate = value;
}
```

2. Update WebsocketProvider:
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

    // Handle document updates
    if (event.id) {
      const documentId = event.id;
      const document = documents.get(documentId);

      if (document) {
        // Reset the progress state when an update is received
        document.aiProgressInfo = null;

        // Check if this document is currently active
        if (this.props.ui.activeDocumentId === documentId) {
          const editor = document?.editor;
          const isEditing = editor && !editor.props.readOnly;

          if (isEditing) {
            // In edit mode: show a warning
            toast.warning(
              this.props.t(
                event.isApiUpdate
                  ? "This document has been updated by AI"
                  : "This document has been updated"
              ),
              {
                duration: 6000,
                description: this.props.t(
                  event.isApiUpdate
                    ? "Your changes may conflict with the AI's changes."
                    : "Your changes may conflict with the recent updates."
                ),
                icon: <AlertTriangleIcon />,
              }
            );

            // Set a flag on the document to show a warning icon
            document.lastApiUpdate = new Date().toISOString();
          } else {
            // In view mode: automatically refresh the document content
            toast.info(
              this.props.t(
                event.isApiUpdate ? "Document updated by AI" : "Document updated"
              ),
              {
                duration: 3000,
              }
            );

            // Force reload the document content without page refresh
            document.fetch({ force: true });
          }
        }
      }
    }
  })
);
```

### 2. AI Progress Notification

#### Server-side Changes

1. Create New API Endpoint:
```typescript
// In server/routes/api/documents/documents.ts
router.post(
  "documents.progress",
  auth(),
  validate(T.DocumentsProgressSchema),
  async (ctx: APIContext<T.DocumentsProgressReq>) => {
    const { id, progressInfo } = ctx.input.body;
    const { user } = ctx.state.auth;

    const document = await Document.findByPk(id, {
      userId: user.id,
    });
    authorize(user, "read", document);

    await Event.createFromContext(ctx, {
      name: "documents.progress",
      documentId: document.id,
      collectionId: document.collectionId,
      data: {
        progressInfo,
        documentId: document.id,
        title: document.title,
      },
    });

    ctx.body = {
      success: true,
    };
  }
);
```

#### Client-side Changes

1. Update Edit Button UI:
```typescript
// In app/scenes/Document/components/Header.tsx
const editAction = (
  <Action>
    <Tooltip
      content={
        document.aiProgressInfo
          ? t("AI is currently editing: {{progressInfo}}", {
              progressInfo: document.aiProgressInfo,
            })
          : t("Edit {{noun}}", {
              noun: document.noun,
            })
      }
      shortcut="e"
      placement="bottom"
    >
      <Button
        as={Link}
        icon={
          document.aiProgressInfo ? (
            <AlertTriangleIcon color="warning" />
          ) : (
            <EditIcon />
          )
        }
        to={{
          pathname: documentEditPath(document),
          state: { sidebarContext },
        }}
        neutral
      >
        {isMobile ? null : t("Edit")}
      </Button>
    </Tooltip>
  </Action>
);
```

### 3. YJS State Handling Improvements

1. Version Tracking:
```typescript
// In server/models/Document.ts
@IsNumeric
@Default(0)
@Column(DataType.INTEGER)
yjsVersion: number;

// In server/commands/documentUpdater.ts
document.yjsVersion = (document.yjsVersion || 0) + 1;
```

2. Error Handling:
```typescript
// In server/commands/documentUpdater.ts
try {
  // YJS update code...
} catch (error) {
  Logger.error(
    "multiplayer",
    `Error updating YJS state for document ${document.id}`,
    error instanceof Error ? error : new Error(String(error))
  );
  
  // Recovery mechanism
  try {
    const ydoc = new Y.Doc();
    const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
    const doc = parser.parse(document.text);
    
    updateYFragment(ydoc, type, doc, new Map());
    document.state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    document.changed("state", true);
  } catch (recoveryError) {
    Logger.error(
      "multiplayer",
      `Failed to recover YJS state for document ${document.id}`,
      recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError))
    );
  }
}
```

## Migration Plan

1. Add the `yjsVersion` column to the Document model
2. Update the documentUpdater command to use transactions and version tracking
3. Enhance the notifyCollaborationService to include version information
4. Update the WebsocketProvider to handle version checks and improved error recovery
5. Add comprehensive logging throughout the YJS operations

## Testing Strategy

1. Test atomic transactions by simulating concurrent updates
2. Verify version tracking by checking synchronization between multiple clients
3. Test error handling by intentionally causing failures and verifying recovery
4. Monitor logs to ensure detailed information is captured for debugging

## Important Note

Before implementing these changes, the actual codebase must be checked as this document will be applied for future upstream updates. The implementation details may need to be adjusted based on the current state of the codebase. 