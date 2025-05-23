import { Transaction } from "sequelize";
import { Event, Document, Task, User } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { ProsemirrorNode }s from "prosemirror-model";
import BaseProcessor from "./BaseProcessor";
import Logger from "@server/logging/Logger";
import { jobManager }s from ".."; // For potential future use or if this processor needs to enqueue other jobs
import { documentUpdater }s from "@server/commands"; // Assuming this is the correct import path
import { InvalidArgumentError }s from "@server/errors";

/**
 * Data structure for the `tasks.update_document_node` event.
 */
interface TaskDocumentNodeUpdateData {
  taskId: string;          // ID of the Task model instance
  documentId: string;      // ID of the Document model instance to update
  newCheckedState: boolean; // The new 'checked' state for the task_item node
  actorId?: string;        // Optional: ID of the user who initiated this change
}

/**
 * TaskDocumentNodeUpdateProcessor handles events that require updating the
 * Prosemirror `task_item` node directly within a document's content.
 * This is typically triggered when a task's status is changed from outside
 * the document editor (e.g., from the Task Detail Page or API).
 *
 * The processor will:
 * 1. Load the specified document and task.
 * 2. Convert the document's content to a Prosemirror node structure.
 * 3. Recursively find the `task_item` node matching the task's GUID.
 * 4. Update the `checked` attribute of that Prosemirror node.
 * 5. Convert the modified Prosemirror structure back to document content (JSON and text/markdown).
 * 6. Save the document.
 * 7. Manually enqueue a `tasks.sync.request` job to ensure the main `TaskSyncProcessor`
 *    runs eventually, maintaining consistency (though this specific update should already
 *    make the document and task DB align for this particular task).
 */
export default class TaskDocumentNodeUpdateProcessor extends BaseProcessor {
  static applicableEvents = ["tasks.update_document_node"];

  async perform(event: Event): Promise<void> {
    const { data } = event; // `transaction` from event creation is not used here for document update
    const {
      taskId,
      documentId,
      newCheckedState,
      actorId,
    } = data as TaskDocumentNodeUpdateData;

    Logger.info(
      "processor.TaskDocumentNodeUpdateProcessor",
      `Processing tasks.update_document_node for task ${taskId} in document ${documentId}`,
      data
    );

    if (!taskId || !documentId || typeof newCheckedState !== "boolean") {
      Logger.error(
        "processor.TaskDocumentNodeUpdateProcessor",
        "Missing required data: taskId, documentId, or newCheckedState.",
        data
      );
      throw new InvalidArgumentError(
        "Missing required data for TaskDocumentNodeUpdateProcessor"
      );
    }

    const task = await Task.findByPk(taskId); // No transaction needed for this read
    if (!task) {
      Logger.warn(
        "processor.TaskDocumentNodeUpdateProcessor",
        `Task ${taskId} not found. Skipping document node update.`,
        data
      );
      return;
    }

    const document = await Document.findByPk(documentId, {
      // Load with `withState` if DocumentHelper.toProsemirror needs `document.state`
      // and it's not loaded by default by findByPk.
      // For this processor, it's safer to ensure the full content/state is available.
      // This might depend on findByPk's default scope.
    });

    if (!document) {
      Logger.warn(
        "processor.TaskDocumentNodeUpdateProcessor",
        `Document ${documentId} not found. Skipping document node update.`,
        data
      );
      return;
    }

    const taskGuid = task.guid;
    let prosemirrorNode = await DocumentHelper.toProsemirror(document);

    if (!prosemirrorNode) {
      Logger.error(
        "processor.TaskDocumentNodeUpdateProcessor",
        `Could not convert document ${documentId} to Prosemirror node.`,
        data
      );
      return;
    }

    let nodeUpdated = false;

    /**
     * Recursively traverses the Prosemirror node tree to find and update
     * the specified task_item node.
     * @param pmNode The current ProsemirrorNode to process.
     * @returns A new ProsemirrorNode if updated, or the original if no change.
     */
    function findAndUpdateNode(
      pmNode: ProsemirrorNode
    ): ProsemirrorNode {
      // Check if the current node is the target task_item
      if (pmNode.type.name === "task_item" && pmNode.attrs.guid === taskGuid) {
        if (pmNode.attrs.checked !== newCheckedState) {
          nodeUpdated = true;
          // Create a new node with updated attributes
          return pmNode.type.create(
            { ...pmNode.attrs, checked: newCheckedState },
            pmNode.content, // Preserve existing content (e.g., text of the task)
            pmNode.marks
          );
        }
        return pmNode; // No change needed for this node
      }

      // If the node has children, recursively process them
      if (!pmNode.content || pmNode.content.childCount === 0) {
        return pmNode;
      }

      const newContent: ProsemirrorNode[] = [];
      let contentChangedInChildren = false;
      for (let i = 0; i < pmNode.content.childCount; i++) {
        const child = pmNode.content.child(i);
        const updatedChild = findAndUpdateNode(child);
        if (updatedChild !== child) {
          contentChangedInChildren = true;
        }
        newContent.push(updatedChild);
      }

      // If any child was updated, create a new parent node with the new content
      if (contentChangedInChildren) {
        return pmNode.type.create(pmNode.attrs, newContent, pmNode.marks);
      }
      return pmNode; // No changes in this subtree
    }

    const updatedProsemirrorNode = findAndUpdateNode(prosemirrorNode);

    if (nodeUpdated && updatedProsemirrorNode) {
      Logger.info(
        "processor.TaskDocumentNodeUpdateProcessor",
        `TaskItem node ${taskGuid} updated in document ${documentId}. New checked state: ${newCheckedState}. Saving document.`,
        data
      );
      
      // Convert the modified Prosemirror node structure back to the formats needed for storage.
      const newTextContent = DocumentHelper.toMarkdown(updatedProsemirrorNode, {includeTitle: false});
      const newJsonContent = DocumentHelper.toProsemirrorJSON(updatedProsemirrorNode);


      const user = actorId
        ? await User.findByPk(actorId)
        : await User.findByPk(document.lastModifiedById); // Fallback to last modifier

      if (!user) {
        Logger.error(
          "processor.TaskDocumentNodeUpdateProcessor",
          `Actor/User not found for document update. ActorId: ${actorId}, Fallback: ${document.lastModifiedById}`,
          data
        );
        throw new Error("User not found to perform document update for task node.");
      }
      
      // Perform document update in a new transaction.
      await this.sequelize.transaction(async (docUpdateTransaction: Transaction) => {
        // Directly update document fields.
        // The Document model's hooks (BeforeUpdate, AfterUpdate) should handle
        // tasks like YJS state updates if `document.content` (JSONB) is changed,
        // and potentially re-serializing `document.text` from `document.content`.
        // It's crucial that these model hooks are robust.
        document.content = newJsonContent;
        document.text = newTextContent; // Also update text directly for consistency, though model hooks might also do this.
        document.lastModifiedById = user.id;
        // `document.updatedBy = user;` might be needed if the model uses this association directly.
            
        await document.save({ transaction: docUpdateTransaction });

        // After successfully saving the document, enqueue a `tasks.sync.request`.
        // This is important for a few reasons:
        // 1. Consistency: It mirrors the flow of `documentUpdater` command.
        // 2. Robustness: If there were other concurrent changes or if the main sync needs
        //    to perform other checks (e.g., for orphaned tasks from other sources),
        //    this ensures the TaskSyncProcessor will eventually run for this document.
        // Note: We create a new Event model instance to use its `queue` method.
        const createdEvent = await Event.create(
          {
            name: "documents.update", // Mimic an event that would trigger task sync
            documentId: document.id,
            collectionId: document.collectionId,
            teamId: document.teamId,
            actorId: user.id, // Attributing the event to the user who caused the task update
            data: {
              title: document.title,
              isSystemUpdate: true, // Custom flag to indicate this was a system-initiated update
            },
          },
          { transaction: docUpdateTransaction }
        );
        await createdEvent.queue(
          "tasks.sync.request",
          {
            documentId: document.id,
            timestamp: document.updatedAt.toISOString(), // Use the new updatedAt timestamp
          },
          { transaction: docUpdateTransaction } // Ensure queueing is part of the same transaction
        );
      });
      Logger.info(
        "processor.TaskDocumentNodeUpdateProcessor",
        `Document ${documentId} saved successfully after task node update.`,
        data
      );

    } else if (!nodeUpdated) {
      Logger.info(
        "processor.TaskDocumentNodeUpdateProcessor",
        `TaskItem node ${taskGuid} in document ${documentId} already had the correct state or was not found. No update performed.`,
        data
      );
    } else { // Should not happen if nodeUpdated is true, means updatedProsemirrorNode was unexpectedly null
         Logger.error(
        "processor.TaskDocumentNodeUpdateProcessor",
        `Updated Prosemirror node was null, which should not happen if nodeUpdated is true. Document ${documentId}.`,
        data
      );
    }
  }
}
