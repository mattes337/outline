# Implementation Plan: Document AI Editing Progress Notification

This document outlines the implementation plan for adding a feature that notifies users when a document is being edited by an AI agent in the background. The notification will be shown to all users who have the document open or are in edit mode for that document.

**Note:** Before implementing these changes, the actual codebase must be checked as this document will be applied for future upstream updates.

## Progress
+ Change Edit button to show a warning icon and a tooltip that an AI change is in progress

## Issues to Fix

1. **Warning icon not shown for progress notifications**: When a "Showing progress notification for active document" event is received, the toast is shown, but the "edit" button is not changed to display a warning icon. The Edit button should switch color to warning and display a warning icon when an AI operation is in progress.

## Overview

When an AI agent is editing a document in the background, it will call a new endpoint `/document.progress` with a short info string. This information will be broadcast to all users who have that document open, allowing them to see that an AI agent is currently working on the document.

## Implementation Steps

### 1. Create New API Endpoint

**File: `server/routes/api/documents/documents.ts`**

Add a new endpoint `/document.progress` that accepts a document ID and a progress message:

```typescript
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

    // Create an event to broadcast the progress info
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

### 2. Add Schema Definition

**File: `server/routes/api/documents/schema.ts`**

Define the schema for the new endpoint:

```typescript
export const DocumentsProgressSchema = BaseSchema.extend({
  body: BaseIdSchema.extend({
    /** Progress information to be shown to users */
    progressInfo: z.string().max(200),
  }),
});
```

Update the imports and exports:

```typescript
export type DocumentsProgressReq = z.infer<typeof DocumentsProgressSchema>;
```

### 3. Update WebSocket Processor

**File: `server/queues/processors/WebsocketsProcessor.ts`**

Add a new case to handle the `documents.progress` event:

```typescript
case "documents.progress": {
  const document = await Document.findByPk(event.documentId, {
    paranoid: false,
  });
  if (!document) {
    return;
  }

  const channels = await this.getDocumentEventChannels(event, document);

  return socketio.to(channels).emit(event.name, {
    documentId: document.id,
    title: document.title,
    progressInfo: event.data.progressInfo,
  });
}
```

### 4. Update WebSocket Client Handler

**File: `app/components/WebsocketProvider.tsx`**

Add a handler for the new event:

```typescript
this.socket.on(
  "documents.progress",
  action((event: { documentId: string; title: string; progressInfo: string }) => {
    const { documentId, progressInfo } = event;
    const document = documents.get(documentId);

    if (document) {
      // Update document with progress info
      document.aiProgressInfo = progressInfo;

      // If the document is currently open, show a toast notification
      // Use the UI store directly to access activeDocumentId
      if (this.props.ui.activeDocumentId === documentId) {
        // Use the global toast function from sonner library
        toast.info(`AI Agent: ${progressInfo}`, {
          duration: 5000,
        });
      }
    }
  })
);
```

### 5. Update Document Model

**File: `app/models/Document.ts`**

Add a new observable property to track AI progress:

```typescript
@observable
aiProgressInfo: string | null = null;
```

**File: `server/models/Document.ts`**

Add a virtual field for AI progress info (not stored in the database):

```typescript
@Column(DataType.VIRTUAL)
aiProgressInfo: string | null;
```

### 6. Update Document Editor UI

**File: `app/components/DocumentEditor.tsx`**

Add a progress indicator when AI is editing:

```typescript
{document.aiProgressInfo && (
  <AIProgressIndicator>
    <AIIcon />
    <span>{document.aiProgressInfo}</span>
  </AIProgressIndicator>
)}
```

Add the styled component:

```typescript
const AIProgressIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: ${(props) => props.theme.toastBackground};
  border-radius: 4px;
  color: ${(props) => props.theme.toastText};
  font-size: 14px;
  margin-bottom: 8px;
  animation: pulse 2s infinite;

  @keyframes pulse {
    0% {
      opacity: 0.8;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.8;
    }
  }
`;

const AIIcon = styled(RobotIcon)`
  size: 16px;
  color: ${(props) => props.theme.toastText};
`;
```

### 7. Update Edit Button UI

**File: `app/scenes/Document/components/Header.tsx` or relevant file containing the Edit button**

Modify the Edit button to show a warning icon and tooltip when AI editing is in progress:

```typescript
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
        icon={document.aiProgressInfo ? <AlertTriangleIcon color="warning" /> : <EditIcon />}
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

This ensures that:
1. The Edit button displays a warning icon when AI is editing the document
2. The tooltip shows the AI progress information
3. The button remains clickable but visually indicates that an AI operation is in progress

### 8. Update Types

**File: `app/types.ts`**

Add types for the new WebSocket event:

```typescript
export type WebsocketDocumentProgressEvent = {
  documentId: string;
  title: string;
  progressInfo: string;
};

export type WebsocketEvent =
  | PartialExcept<Pin, "id">
  | PartialExcept<Star, "id">
  | PartialExcept<FileOperation, "id">
  | PartialExcept<UserMembership, "id">
  | WebsocketCollectionUpdateIndexEvent
  | WebsocketEntityDeletedEvent
  | WebsocketEntitiesEvent
  | WebsocketCommentReactionEvent
  | WebsocketDocumentUpdateEvent
  | WebsocketDocumentProgressEvent;
```

## Security Considerations

- Ensure only users with read access to the document can see progress updates
- Validate and sanitize progress info to prevent XSS attacks
- Consider rate limiting the progress endpoint to prevent abuse

## Known Issues and Fixes

### WebSocket Error Fix

There's a bug in the WebsocketProvider component that causes the following error:

```
[websockets] Received API-originated update for document 855d679c-06c0-4331-a349-708554185d4c undefined
authenticated.CP6MeiXa.js:11 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'activeDocumentId')
```

The error occurs in the WebsocketProvider component when it tries to access `this.props.editor.activeDocumentId` and `this.props.toasts.showToast()`, but neither `editor` nor `toasts` are properties of the RootStore that's passed to the component via the withStores HOC.

**Fix:**
1. Modify the WebsocketProvider component to use the UI store's activeDocumentId directly instead of trying to access it through a non-existent editor property.
2. Use the global toast function from the sonner library instead of trying to access a non-existent toasts property.

Example implementation:
```typescript
// Instead of:
if (this.props.editor.activeDocumentId === documentId) {
  this.props.toasts.showToast({
    message: `AI Agent: ${progressInfo}`,
    type: "info",
    timeout: 5000,
  });
}

// Use:
if (this.props.ui.activeDocumentId === documentId) {
  toast.info(`AI Agent: ${progressInfo}`, {
    duration: 5000,
  });
}
```
