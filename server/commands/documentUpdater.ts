import * as Y from "yjs";
import { updateYFragment } from "y-prosemirror";
import { Event, Document, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { parser } from "@server/editor";
import { APIContext } from "@server/types";
import notifyCollaborationService from "./notifyCollaborationService";

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
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, document.state);

      // Apply the new content to the YJS document
      const type = ydoc.get("default", Y.XmlFragment) as Y.XmlFragment;
      const doc = parser.parse(document.text);

      if (!type.doc) {
        throw new Error("type.doc not found");
      }

      // Clear existing content and apply new content
      type.delete(0, type.length);
      updateYFragment(type.doc, type, doc, new Map());

      // Update the state
      document.state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
      document.changed("state", true);
    }
  }

  const changed = document.changed();

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
    document.lastModifiedById = user.id;
    document.updatedBy = user;
    await document.save({ transaction });

    await Event.createFromContext(ctx, event);

    // Notify collaboration service about the API update if text was changed
    if (text !== undefined && document.state) {
      await notifyCollaborationService({
        documentId: document.id,
        force: true,
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
      ip: ctx.request.ip,
    });
  }

  return await Document.findByPk(document.id, {
    userId: user.id,
    rejectOnEmpty: true,
    transaction,
  });
}
