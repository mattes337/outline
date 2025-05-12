# Document Auto-Refresh Implementation

This document outlines the implementation plan for notifying users when a document is updated via API while they are viewing or editing it.

## Problem Statement

When a user has a document open and that document is updated via API (not by another user), the user should:
- Be notified about the update
- In view mode: reload the document automatically without reloading the window to avoid flickering
- In edit mode: show a warning icon left of the "Done editing" button with a tooltip saying that the document has been changed by AI

## Issues to Fix

1. **Document refresh not working for user-originated updates**: Currently, the refresh functionality only works for API-originated updates but not for user-originated updates. The content should always be reloaded regardless of whether the current user is the initiator of the change.

2. **Warning icon not shown for progress notifications**: When a "Showing progress notification for active document" event is received, the toast is shown, but the "edit" button is not changed to display a warning icon.

3. **No banner for updated documents in edit mode**: When in edit mode and a document update is received, there should be a banner at the top of the document indicating that a new version is available, with a button to "revert local changes and switch to newest version".

## Implementation Steps

### 1. Flag API-Originated Updates

Modify the document update process to track the source of updates.

### 2. Propagate API Update Flag via WebSockets

Ensure the WebSocket event includes information about the update source.

### 3. Handle All Document Updates on the Client

Update the WebSocket event handler to process all document updates consistently:
- In view mode: automatically refresh the document content without page reload for both API and user-originated updates
- In edit mode: display a warning icon with tooltip about document changes

### 4. Update API Routes to Set Source Header

Ensure API routes set the appropriate header to identify API-originated updates.

### 5. Update Types to Include isApiUpdate Flag

Add appropriate type definitions to support the API update flag.

### 6. Add Warning Icon for Progress Notifications

Modify the WebsocketProvider to update the document's state when progress notifications are received:
- Set a flag on the document to indicate that an AI operation is in progress
- Update the Edit button UI to show a warning icon when this flag is set

### 7. Implement Document Update Banner

Add a new banner component that appears at the top of the document when in edit mode and a new version is available:
- Use the ObservingBanner component as a reference for implementation
- Include a button to revert local changes and load the newest version
- Position the banner at the top of the document editor

## Internationalization

Add the necessary translation keys to support multiple languages.

## Detailed Implementation

### Issue 1: Document Refresh Not Working for User-Originated Updates

#### Problem
Currently, the document refresh functionality only works for API-originated updates (`event.isApiUpdate === true`). When a user-originated update is received, the document content is not automatically refreshed, even if the current user is not the initiator of the change.

#### Solution
Modify the WebsocketProvider component to handle all document updates consistently, regardless of the source:

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

    // Handle document updates (both API and user-originated)
    if (event.id) {
      const documentId = event.id;
      const document = documents.get(documentId);

      // Check if this document is currently active
      if (this.props.ui.activeDocumentId === documentId) {
        console.log("[TRACE] Received update for document", {
          documentId,
          title: document?.title,
          isApiUpdate: event.isApiUpdate || false,
        });

        // Get the current document from the editor context to check if it's in edit mode
        const editor = document?.editor;
        const isEditing = editor && !editor.props.readOnly;

        if (isEditing) {
          console.log("[TRACE] Document is in edit mode, showing warning", {
            documentId,
            title: document?.title,
            isEditing: true,
          });

          // In edit mode: show a toast notification with a warning
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

          // Set a flag on the document to show a warning icon in the editor
          document.lastApiUpdate = new Date().toISOString();
        } else {
          console.log("[TRACE] Document is in view mode, auto-refreshing", {
            documentId,
            title: document?.title,
            isEditing: false,
          });

          // In view mode: automatically refresh the document content
          toast.info(
            this.props.t(
              event.isApiUpdate
                ? "Document updated by AI"
                : "Document updated"
            ),
            {
              duration: 3000,
            }
          );

          console.log("[TRACE] Fetching updated document content", {
            documentId,
            force: true,
          });

          // Force reload the document content without page refresh
          document.fetch({ force: true });
        }
      }
    }
  })
);
```

### Issue 2: Warning Icon Not Shown for Progress Notifications

#### Problem
When a "Showing progress notification for active document" event is received, the toast notification is shown, but the "Edit" button is not updated to display a warning icon.

#### Solution
Modify the WebsocketProvider to update the document's state when progress notifications are received:

```typescript
// In app/components/WebsocketProvider.tsx
this.socket.on(
  "documents.progress",
  action((event: { documentId: string; title: string; progressInfo: string }) => {
    const { documentId, progressInfo } = event;
    const document = documents.get(documentId);

    if (document) {
      // Update document with progress info
      document.aiProgressInfo = progressInfo;

      // If the document is currently active, show a toast notification
      if (this.props.ui.activeDocumentId === documentId) {
        console.log("[TRACE] Showing progress notification for active document", {
          documentId,
          progressInfo,
        });

        toast.info(`AI Agent: ${progressInfo}`, {
          duration: 5000,
        });
      }
    }
  })
);
```

Then update the Edit button component to show a warning icon when AI progress is in progress:

```typescript
// In app/scenes/Document/components/Header.tsx or relevant file containing the Edit button
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

### Issue 3: No Banner for Updated Documents in Edit Mode

#### Problem
When in edit mode and a document update is received, there should be a banner at the top of the document indicating that a new version is available, with a button to "revert local changes and switch to newest version".

#### Solution
Create a new UpdatedDocumentBanner component similar to the ObservingBanner:

```typescript
// In app/scenes/Document/components/UpdatedDocumentBanner.tsx
import { m, AnimatePresence } from "framer-motion";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { depths } from "@shared/styles";
import Button from "~/components/Button";
import useStores from "~/hooks/useStores";
import useDocumentContext from "~/hooks/useDocumentContext";
import { draggableOnDesktop } from "~/styles";

const transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
};

function UpdatedDocumentBanner() {
  const { documents, ui } = useStores();
  const { t } = useTranslation();
  const { editor } = useDocumentContext();

  const document = ui.activeDocumentId ? documents.get(ui.activeDocumentId) : undefined;
  const isVisible = document?.hasRecentApiUpdate && editor && !editor.props.readOnly;

  const handleRevertAndUpdate = React.useCallback(() => {
    if (document) {
      // Force reload the document content
      document.fetch({ force: true });
    }
  }, [document]);

  return (
    <Positioner>
      <AnimatePresence>
        {isVisible && (
          <Banner
            transition={transition}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: -5 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <BannerContent>
              {t("This document has been updated")}
              <Button onClick={handleRevertAndUpdate} neutral small>
                {t("Revert changes and load newest version")}
              </Button>
            </BannerContent>
          </Banner>
        )}
      </AnimatePresence>
    </Positioner>
  );
}

const Positioner = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${depths.header + 1};
  display: flex;
  justify-content: center;
`;

const Banner = styled(m.div)`
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: ${(props) => props.theme.white};
  background: ${(props) => props.theme.warning};
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  ${draggableOnDesktop()}
`;

const BannerContent = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export default observer(UpdatedDocumentBanner);
```

Then add this component to the Document component:

```typescript
// In app/scenes/Document/components/Document.tsx
import UpdatedDocumentBanner from "./UpdatedDocumentBanner";

// Add the banner component near the top of the render method
return (
  <MeasuredContainer
    as={Background}
    name="container"
    key={revision ? revision.id : document.id}
    column
    auto
  >
    <PageTitle title={title} favicon={favicon} />
    {(this.isUploading || this.isSaving) && <LoadingIndicator />}
    <Container column>
      <UpdatedDocumentBanner />
      {/* ... rest of the component ... */}
    </Container>
  </MeasuredContainer>
);
```

## Known Bug and Fix

There is a bug in the WebsocketProvider component that causes the following error:
```
[websockets] Received API-originated update for document 855d679c-06c0-4331-a349-708554185d4c undefined
authenticated.CP6MeiXa.js:11 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'activeDocumentId')
```

The error occurs in the WebsocketProvider component when it tries to access this.props.editor.activeDocumentId and this.props.toasts.showToast(), but neither editor nor toasts are properties of the RootStore that's passed to the component via the withStores HOC.

Fix:
- Modify the WebsocketProvider component to use the UI store's activeDocumentId directly instead of trying to access it through a non-existent editor property.
- Use the global toast function from the sonner library instead of trying to access a non-existent toasts property.

## Important Note

Before implementing these changes, the actual codebase must be checked as this document will be applied for future upstream updates. The implementation details may need to be adjusted based on the current state of the codebase.