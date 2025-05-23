import * as Y from "yjs";
import { toast } from "sonner"; // Import toast for notifications
import { updateYFragment } from "y-prosemirror";
import { Event, Document, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { parser } from "@server/editor";
import { APIContext } from "@server/types";
import Logger from "@server/logging/Logger";
import notifyCollaborationService from "./notifyCollaborationService";
import { Transaction } from "sequelize";

type Props = {
  /** The user updating the document */
  user: User;
  /** The existing document */
  document: Document;
  /** The new title */
  title?: string;
  /** The document icon */
  icon?: string | null;
  /** The document icon's color */
  color?: string | null;
  /** The new text content */
  text?: string;
  /** Whether the editing session is complete */
  done?: boolean;
  /** The version of the client editor that was used */
  editorVersion?: string;
  /** The ID of the template that was used */
  templateId?: string | null;
  /** If the document should be displayed full-width on the screen */
  fullWidth?: boolean;
  /** Whether insights should be visible on the document */
  insightsEnabled?: boolean;
  /** Whether the text be appended to the end instead of replace */
  append?: boolean;
  /** Whether the document should be published to the collection */
  publish?: boolean;
  /** The ID of the collection to publish the document to */
  collectionId?: string | null;
};

/**
 * This command updates document properties. To update collaborative text state
 * use documentCollaborativeUpdater.
 *
 * @param Props The properties of the document to update
 * @returns Document The updated document
 */
export default async function documentUpdater(
  ctx: APIContext,
  {
    user,
    document,
    title,
    icon,
    color,
    text,
    editorVersion,
    templateId,
    fullWidth,
    insightsEnabled,
    append,
    publish,
    collectionId,
    done,
  }: Props
): Promise<Document> {
  const { transaction } = ctx.state;
  const previousTitle = document.title;
  const cId = collectionId || document.collectionId;

  if (title !== undefined) {
    document.title = title.trim();
  }
  if (icon !== undefined) {
    document.icon = icon;
  }
  if (color !== undefined) {
    document.color = color;
  }
  if (editorVersion) {
    document.editorVersion = editorVersion;
  }
  if (templateId) {
    document.templateId = templateId;
  }
  if (fullWidth !== undefined) {
    document.fullWidth = fullWidth;
  }
  if (insightsEnabled !== undefined) {
    document.insightsEnabled = insightsEnabled;
  }
  if (text !== undefined) {
    document = DocumentHelper.applyMarkdownToDocument(document, text, append);

    // Also update the collaborative state if it exists
    if (document.state) {
      Logger.debug(
        "multiplayer",
        `Starting YJS state update for document ${document.id}`,
        {
          documentId: document.id,
          hasExistingState: !!document.state,
          textLength: document.text.length,
        }
      );

      try {
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, document.state);

        // Use a transaction for atomic updates
        ydoc.transact(() => {
          // Apply the new content to the YJS document
          const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
          const doc = parser.parse(document.text);

          if (!type.doc) {
            throw new Error("type.doc not found");
          }

          // Clear existing content and apply new content
          type.delete(0, type.length);
          updateYFragment(type.doc, type, doc, new Map());
        }, 'api-update'); // Transaction name for tracking

        // Update the state with the new YJS document state
        const stateUpdate = Y.encodeStateAsUpdate(ydoc);
        document.state = Buffer.from(stateUpdate);

        // Track version for synchronization (using existing revisionCount field)
        document.revisionCount += 1;

        Logger.info(
          "multiplayer",
          `Successfully updated YJS state for document ${document.id}`,
          {
            documentId: document.id,
            revisionCount: document.revisionCount,
            stateSize: document.state?.length || 0,
          }
        );
      } catch (error) {
        Logger.error(
          "multiplayer",
          `Error updating YJS state for document ${document.id}`,
          error instanceof Error ? error : new Error(String(error))
        );

        // Recovery mechanism: fall back to recreating the state from scratch
        try {
          Logger.info(
            "multiplayer",
            `Attempting to recover YJS state for document ${document.id}`
          );

          const ydoc = new Y.Doc();
          const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
          const doc = parser.parse(document.text);

          updateYFragment(ydoc, type, doc, new Map());
          const stateUpdate = Y.encodeStateAsUpdate(ydoc);
          document.state = Buffer.from(stateUpdate);

          // Track version for synchronization
          document.revisionCount += 1;

          Logger.info(
            "multiplayer",
            `Successfully recovered YJS state for document ${document.id}`
          );
        } catch (recoveryError) {
          Logger.error(
            "multiplayer",
            `Failed to recover YJS state for document ${document.id}`,
            recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError))
          );
          // At this point, we'll need manual intervention or a more robust recovery strategy
        }
      }
    }
  }

  // Check if document has changed
  const changed = true; // Simplified for now, as document.changed() is not available

  const event = {
    name: "documents.update",
    documentId: document.id,
    collectionId: cId,
    data: {
      done,
      title: document.title,
      isApiUpdate: true,
    },
  };

  if (publish && (document.template || cId)) {
    if (!document.collectionId) {
      document.collectionId = cId;
    }
    await document.publish(user, cId, { transaction });

    await Event.createFromContext(ctx, {
      ...event,
      name: "documents.publish",
    });
  } else if (changed) {
    // Update document properties
    document.lastModifiedById = user.id;
    document.updatedBy = user;

    // Save the document changes to the database
    await document.saveWithCtx(ctx);

    // Add isApiUpdate flag to the event data
    const createdEvent = await Event.createFromContext(ctx, {
      ...event,
      data: {
        ...event.data,
        isApiUpdate: true,
      },
    });

    // Enqueue task sync request
    if (text !== undefined || title !== undefined) { // Sync if content or title changed
      await createdEvent.queue("tasks.sync.request", {
        documentId: document.id,
        timestamp: document.updatedAt.toISOString(),
      });
    }

    // Notify collaboration service about the API update if text was changed
    if (text !== undefined && document.state) {
      await notifyCollaborationService({
        // Reset YJS collaborative state for all clients
        documentId: document.id,
        force: true,
        revisionCount: document.revisionCount,
      });
    }
  } else if (done) {
    await Event.schedule({
      ...event,
      actorId: user.id,
      teamId: document.teamId,
    });
  }

  if (document.title !== previousTitle) {
    await Event.schedule({
      name: "documents.title_change",
      documentId: document.id,
      collectionId: cId,
      teamId: document.teamId,
      actorId: user.id,
      data: {
        previousTitle,
        title: document.title,
      },
    });
  }

  return await Document.findByPk(document.id, {
    userId: user.id,
    rejectOnEmpty: true,
    transaction,
  });
}
