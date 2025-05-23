import { Transaction } from "sequelize";
import { Event, Document, Task } from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { ProsemirrorNode } from "prosemirror-model";
import BaseProcessor from "./BaseProcessor";
import { jobManager } from ".."; // Assuming jobManager is exported from here for enqueueing
import env from "@server/env";
import Logger from "@server/logging/Logger";

// Debounce delay for task synchronization to avoid processing too frequently during rapid document edits.
const TASK_SYNC_DELAY_MS = env.TASK_SYNC_DELAY_MS || 30 * 1000; // Default to 30 seconds

/**
 * Represents the structure of task data extracted from a Prosemirror document node.
 */
interface TaskData {
  guid: string;
  checked: boolean;
  title: string;
}

/**
 * TaskSyncProcessor handles the synchronization of tasks between Prosemirror document content
 * and the `tasks` table in the database. It uses a two-step process:
 * 1. `tasks.sync.request`: An event is emitted when a document is updated. This processor
 *    catches this event and enqueues a delayed `tasks.sync.execute` job. This debounces
 *    the synchronization to prevent excessive processing during rapid edits.
 * 2. `tasks.sync.execute`: This job performs the actual synchronization. It compares tasks
 *    extracted from the document content with tasks in the database for that document,
 *    creating, updating, or marking tasks as orphaned as needed.
 */
export default class TaskSyncProcessor extends BaseProcessor {
  static applicableEvents = ["tasks.sync.request", "tasks.sync.execute"];

  async perform(event: Event): Promise<void> {
    const { name, data, transaction } = event;
    const { documentId, timestamp, originalTimestamp } = data as {
      documentId: string;
      timestamp?: string; // For 'tasks.sync.request', this is the document's updatedAt timestamp
      originalTimestamp?: string; // For 'tasks.sync.execute', this is the timestamp from the original request
    };

    Logger.info("processor.TaskSyncProcessor", `Received event ${name}`, {
      documentId,
      timestamp: name === "tasks.sync.request" ? timestamp : originalTimestamp,
    });

    if (name === "tasks.sync.request") {
      // This event signals that a document has been updated and its tasks might need syncing.
      // We enqueue a delayed job to handle the actual sync.
      if (!documentId || !timestamp) {
        Logger.error(
          "processor.TaskSyncProcessor",
          `Missing documentId or timestamp for tasks.sync.request`,
          event
        );
        return;
      }
      await jobManager.enqueue(
        "tasks.sync.execute", // The job name for the actual sync logic
        { documentId, originalTimestamp: timestamp }, // Pass along documentId and the timestamp of the document update
        { delay: TASK_SYNC_DELAY_MS, transaction } // Apply delay and pass transaction context
      );
      Logger.info(
        "processor.TaskSyncProcessor",
        `Enqueued tasks.sync.execute for document ${documentId}`,
        { delay: TASK_SYNC_DELAY_MS }
      );
    } else if (name === "tasks.sync.execute") {
      // This event executes the task synchronization logic.
      if (!documentId || !originalTimestamp) {
        Logger.error(
          "processor.TaskSyncProcessor",
          `Missing documentId or originalTimestamp for tasks.sync.execute`,
          event
        );
        return;
      }

      const document = await Document.scope([
        "withDrafts", // Ensure we can access draft documents if applicable
        "withState",  // Ensure `document.state` (Prosemirror state) is loaded
      ]).findByPk(documentId);

      if (!document) {
        Logger.warn(
          "processor.TaskSyncProcessor",
          `Document ${documentId} not found for task sync.`,
          event
        );
        return;
      }

      // Crucial check: If the document has been updated *after* the original sync request was made,
      // skip this execution. A new `tasks.sync.request` (and subsequent `tasks.sync.execute`)
      // will have been enqueued for that more recent update. This prevents race conditions
      // and ensures we only process the latest known state.
      if (
        new Date(document.updatedAt).toISOString() >
        new Date(originalTimestamp).toISOString()
      ) {
        Logger.info(
          "processor.TaskSyncProcessor",
          `Skipping task sync for document ${documentId}; a newer version exists.`,
          {
            documentUpdatedAt: document.updatedAt.toISOString(),
            originalTimestamp,
          }
        );
        return;
      }

      // Perform the synchronization within a database transaction to ensure atomicity.
      await this.sequelize.transaction(async (dbTransaction) => {
        await this.syncTasksForDocument(document, dbTransaction);
      });
    }
  }

  /**
   * Synchronizes tasks for a given document.
   * Extracts tasks from the document's Prosemirror content, compares them with existing
   * tasks in the database, and performs creates, updates, or marks tasks as orphaned.
   * @param document The document to sync tasks for.
   * @param transaction The Sequelize transaction.
   */
  private async syncTasksForDocument(
    document: Document,
    transaction: Transaction
  ): Promise<void> {
    const prosemirrorNode = await DocumentHelper.toProsemirror(document);
    if (!prosemirrorNode) {
      Logger.warn(
        "processor.TaskSyncProcessor",
        `Could not convert document ${document.id} to Prosemirror node.`,
        { documentId: document.id }
      );
      return;
    }

    // Extract all task_item nodes from the document's Prosemirror content.
    const documentTasks = this.extractTasksFromNode(prosemirrorNode);
    
    // Fetch all existing tasks for this document from the database.
    const existingTasksRaw = await Task.findAll({
      where: { documentId: document.id },
      transaction,
    });
    const existingTasksMap = new Map<string, Task>(
      existingTasksRaw.map((task) => [task.guid, task])
    );

    const seenGuids = new Set<string>();

    // Iterate over tasks found in the document content.
    for (const docTask of documentTasks) {
      seenGuids.add(docTask.guid);
      const existingTask = existingTasksMap.get(docTask.guid);

      if (existingTask) {
        // Task exists in both document and database: Update if necessary.
        let needsUpdate = false;
        if (existingTask.title !== docTask.title) {
          existingTask.title = docTask.title;
          needsUpdate = true;
        }
        const newStatus = docTask.checked ? "completed" : "open";
        if (existingTask.status !== newStatus) {
          existingTask.status = newStatus;
          needsUpdate = true;
        }
        // If an orphaned task reappears in the document, un-orphan it.
        if (existingTask.status === "orphaned" && newStatus !== "orphaned") {
            existingTask.status = newStatus;
            needsUpdate = true;
        }

        if (needsUpdate) {
          Logger.info(
            "processor.TaskSyncProcessor",
            `Updating task ${existingTask.id} for document ${document.id}`,
            { guid: docTask.guid, title: docTask.title, checked: docTask.checked }
          );
          await existingTask.save({ transaction });
        }
      } else {
        // Task exists in document but not in database: Create it.
        Logger.info(
          "processor.TaskSyncProcessor",
          `Creating new task for document ${document.id}`,
          { guid: docTask.guid, title: docTask.title, checked: docTask.checked }
        );
        await Task.create(
          {
            documentId: document.id,
            guid: docTask.guid,
            title: docTask.title,
            status: docTask.checked ? "completed" : "open",
            // Assignee (userId) is handled by the Task model/API, not directly from document content here.
            // Priority is also managed via API, defaults on creation.
          },
          { transaction }
        );
      }
    }

    // Iterate over tasks in the database to find any that were not seen in the document.
    // These tasks are considered "orphaned" (i.e., deleted from the document content).
    for (const [guid, task] of existingTasksMap) {
      if (!seenGuids.has(guid) && task.status !== "orphaned") {
        Logger.info(
          "processor.TaskSyncProcessor",
          `Marking task ${task.id} as orphaned for document ${document.id}`,
          { guid }
        );
        task.status = "orphaned";
        await task.save({ transaction });
      }
    }
    Logger.info(
        "processor.TaskSyncProcessor",
        `Task synchronization completed for document ${document.id}. Found ${documentTasks.length} tasks in document, updated/created tasks accordingly. Marked ${existingTasksMap.size - seenGuids.size} tasks as orphaned if applicable.`,
        { documentId: document.id }
    );
  }

  /**
   * Extracts task data (GUID, checked state, title) from Prosemirror task_item nodes.
   * @param node The root Prosemirror node of the document.
   * @returns An array of TaskData objects.
   */
  private extractTasksFromNode(node: ProsemirrorNode): TaskData[] {
    const tasks: TaskData[] = [];
    node.descendants((n) => {
      if (n.type.name === "task_item") {
        const guid = n.attrs.guid;
        const checked = n.attrs.checked;
        
        // The title of the task is the text content of the task_item node.
        // Prosemirror's `textContent` gives a string representation of all text within the node.
        // This assumes task_item nodes primarily contain text for their title.
        // If complex inline nodes (like mentions, links) are part of the "title",
        // `textContent` will serialize them, which might be desired or might need refinement.
        let title = n.textContent.trim();
        
        // The Prosemirror node's textContent might still include the "[ ] " or "[x] " prefix
        // if the `toMarkdown` output was parsed and then re-serialized by Prosemirror without
        // specific stripping of this prefix during node creation from markdown.
        // This check attempts to clean it up if present.
        if (title.startsWith("[ ] ") || title.startsWith("[x] ")) {
            title = title.substring(4);
        }

        if (guid) {
          tasks.push({
            guid,
            checked,
            title: title || "Untitled Task", // Use a default title if extracted title is empty
          });
        } else {
          // This should ideally not happen if tasks are always created with GUIDs.
          Logger.warn(
            "processor.TaskSyncProcessor",
            "Found task_item node without a guid",
            { nodeAttrs: n.attrs }
          );
        }
      }
      return true; // Continue descending through the document tree
    });
    return tasks;
  }
}
