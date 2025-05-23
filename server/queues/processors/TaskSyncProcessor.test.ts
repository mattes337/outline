import { Op, Transaction, Sequelize } from "sequelize";
import { Event, Document, Task } from "@server/models";
import { DocumentHelper }s from "@server/models/helpers/DocumentHelper";
import { ProsemirrorNode }s from "prosemirror-model";
import TaskSyncProcessor from "./TaskSyncProcessor";
import { jobManager }s from "@server/queues"; // Assuming jobManager is the actual queue manager
import env from "@server/env";
import Logger from "@server/logging/Logger";

// Mock models and helpers
jest.mock("@server/models/Document");
jest.mock("@server/models/Task");
jest.mock("@server/models/helpers/DocumentHelper");
jest.mock("@server/queues", () => ({
  jobManager: {
    enqueue: jest.fn(),
  },
}));
jest.mock("@server/logging/Logger");

const mockTransaction = {} as Transaction; // Simple mock for transaction

describe("TaskSyncProcessor", () => {
  let processor: TaskSyncProcessor;
  let mockSequelize: Sequelize;

  beforeEach(() => {
    // Mock Sequelize instance if your processor uses `this.sequelize.transaction`
    mockSequelize = {
      transaction: jest.fn((callback) => callback(mockTransaction)),
    } as any as Sequelize;
    processor = new TaskSyncProcessor(mockSequelize); // Pass mock sequelize

    // Clear mocks
    jest.clearAllMocks();
    (Document.scope as jest.Mock).mockClear();
    (Document.findByPk as jest.Mock).mockClear();
    (Task.findAll as jest.Mock).mockClear();
    (Task.create as jest.Mock).mockClear();
    (Task.prototype.save as jest.Mock).mockClear();
    (DocumentHelper.toProsemirror as jest.Mock).mockClear();
    (jobManager.enqueue as jest.Mock).mockClear();
  });

  describe("perform - tasks.sync.request", () => {
    it("should enqueue a tasks.sync.execute job with a delay", async () => {
      const event = new Event({
        name: "tasks.sync.request",
        data: { documentId: "doc-id-1", timestamp: new Date().toISOString() },
        transaction: mockTransaction,
      });

      await processor.perform(event);

      expect(jobManager.enqueue).toHaveBeenCalledTimes(1);
      expect(jobManager.enqueue).toHaveBeenCalledWith(
        "tasks.sync.execute",
        {
          documentId: "doc-id-1",
          originalTimestamp: event.data.timestamp,
        },
        {
          delay: env.TASK_SYNC_DELAY_MS || 30 * 1000,
          transaction: mockTransaction,
        }
      );
    });

    it("should log an error if documentId or timestamp is missing", async () => {
      const event = new Event({
        name: "tasks.sync.request",
        data: { documentId: "doc-id-1" }, // Missing timestamp
      });
      await processor.perform(event);
      expect(Logger.error).toHaveBeenCalled();
      expect(jobManager.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("perform - tasks.sync.execute", () => {
    const documentId = "doc-id-execute";
    const originalTimestamp = new Date("2023-01-01T10:00:00.000Z").toISOString();
    const mockEventData = { documentId, originalTimestamp };

    it("should log an error if documentId or originalTimestamp is missing", async () => {
        const event = new Event({
          name: "tasks.sync.execute",
          data: { documentId }, // Missing originalTimestamp
        });
        await processor.perform(event);
        expect(Logger.error).toHaveBeenCalled();
      });

    it("should warn if document is not found", async () => {
      (Document.scope as jest.Mock).mockReturnValue({
        findByPk: jest.fn().mockResolvedValue(null),
      });
      const event = new Event({
        name: "tasks.sync.execute",
        data: mockEventData,
      });
      await processor.perform(event);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.any(String), // processor class name
        `Document ${documentId} not found for task sync.`,
        event
      );
    });

    it("should skip if document is newer than originalTimestamp", async () => {
      const newerDocument = {
        id: documentId,
        updatedAt: new Date("2023-01-01T11:00:00.000Z"), // Newer than originalTimestamp
      };
      (Document.scope as jest.Mock).mockReturnValue({
        findByPk: jest.fn().mockResolvedValue(newerDocument),
      });
      const event = new Event({
        name: "tasks.sync.execute",
        data: mockEventData,
      });
      await processor.perform(event);
      expect(Logger.info).toHaveBeenCalledWith(
        expect.any(String),
        `Skipping task sync for document ${documentId}; a newer version exists.`,
        expect.any(Object)
      );
    });

    it("should warn if document cannot be converted to Prosemirror node", async () => {
        const document = {
            id: documentId,
            updatedAt: new Date("2023-01-01T09:00:00.000Z"), // Older
        };
        (Document.scope as jest.Mock).mockReturnValue({
            findByPk: jest.fn().mockResolvedValue(document),
        });
        (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(null);
        const event = new Event({ name: "tasks.sync.execute", data: mockEventData });
        await processor.perform(event);
        expect(Logger.warn).toHaveBeenCalledWith(
            expect.any(String),
            `Could not convert document ${document.id} to Prosemirror node.`,
            { documentId: document.id }
        );
    });

    describe("core sync logic", () => {
      const mockDocument = {
        id: documentId,
        updatedAt: new Date("2023-01-01T09:00:00.000Z"), // Older
        lastModifiedById: "user-doc-modifier",
      };
      const mockProsemirrorNode = {
        descendants: jest.fn(),
      } as any as ProsemirrorNode;

      beforeEach(() => {
        (Document.scope as jest.Mock).mockReturnValue({
          findByPk: jest.fn().mockResolvedValue(mockDocument),
        });
        (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(
          mockProsemirrorNode
        );
      });

      const setupDescendants = (tasksInDoc: any[]) => {
        mockProsemirrorNode.descendants = (callback: (node: any) => boolean) => {
          tasksInDoc.forEach(task => callback({
            type: { name: "task_item" },
            attrs: { guid: task.guid, checked: task.checked },
            textContent: task.title,
          }));
        };
      };

      it("should create new tasks found in document", async () => {
        setupDescendants([
          { guid: "task-guid-1", checked: false, title: "New Task 1" },
        ]);
        (Task.findAll as jest.Mock).mockResolvedValue([]); // No existing tasks

        const event = new Event({ name: "tasks.sync.execute", data: mockEventData });
        await processor.perform(event);

        expect(Task.create).toHaveBeenCalledTimes(1);
        expect(Task.create).toHaveBeenCalledWith(
          {
            documentId,
            guid: "task-guid-1",
            title: "New Task 1",
            status: "open",
          },
          { transaction: mockTransaction }
        );
      });

      it("should update existing tasks (title and status)", async () => {
        const existingTask = {
          id: "db-task-id-1",
          guid: "task-guid-1",
          title: "Old Title",
          status: "open",
          save: jest.fn().mockResolvedValue(this),
        };
        setupDescendants([
          { guid: "task-guid-1", checked: true, title: "New Title" },
        ]);
        (Task.findAll as jest.Mock).mockResolvedValue([existingTask]);

        const event = new Event({ name: "tasks.sync.execute", data: mockEventData });
        await processor.perform(event);

        expect(existingTask.title).toBe("New Title");
        expect(existingTask.status).toBe("completed");
        expect(existingTask.save).toHaveBeenCalledTimes(1);
        expect(Task.create).not.toHaveBeenCalled();
      });
      
      it("should update existing task status from orphaned to open/completed", async () => {
        const existingTask = {
          id: "db-task-id-2",
          guid: "task-guid-2",
          title: "Orphaned Task",
          status: "orphaned", // Was orphaned
          save: jest.fn().mockResolvedValue(this),
        };
        setupDescendants([
          { guid: "task-guid-2", checked: false, title: "Orphaned Task Is Back" }, // Now present in doc
        ]);
        (Task.findAll as jest.Mock).mockResolvedValue([existingTask]);

        const event = new Event({ name: "tasks.sync.execute", data: mockEventData });
        await processor.perform(event);

        expect(existingTask.status).toBe("open"); // Should change from orphaned to open
        expect(existingTask.title).toBe("Orphaned Task Is Back");
        expect(existingTask.save).toHaveBeenCalledTimes(1);
      });


      it("should mark tasks not in document as orphaned", async () => {
        const existingTaskToOrphan = {
          id: "db-task-id-orphan",
          guid: "task-guid-orphan",
          title: "To Be Orphaned",
          status: "open",
          save: jest.fn().mockResolvedValue(this),
        };
        setupDescendants([]); // No tasks in document
        (Task.findAll as jest.Mock).mockResolvedValue([existingTaskToOrphan]);

        const event = new Event({ name: "tasks.sync.execute", data: mockEventData });
        await processor.perform(event);

        expect(existingTaskToOrphan.status).toBe("orphaned");
        expect(existingTaskToOrphan.save).toHaveBeenCalledTimes(1);
        expect(Task.create).not.toHaveBeenCalled();
      });

      it("should handle a mix of new, updated, and orphaned tasks", async () => {
        const taskToUpdate = {
            id: "db-id-update", guid: "guid-update", title: "Old Update", status: "open", save: jest.fn()
        };
        const taskToOrphan = {
            id: "db-id-orphan", guid: "guid-orphan", title: "Old Orphan", status: "open", save: jest.fn()
        };
        const taskUnchanged = { // This task is in doc and DB, but no changes needed
            id: "db-id-unchanged", guid: "guid-unchanged", title: "Unchanged", status: "completed", save: jest.fn()
        };

        (Task.findAll as jest.Mock).mockResolvedValue([taskToUpdate, taskToOrphan, taskUnchanged]);

        setupDescendants([
            { guid: "guid-new", checked: false, title: "New Task" }, // New
            { guid: "guid-update", checked: true, title: "New Update Title" }, // Updated
            { guid: "guid-unchanged", checked: true, title: "Unchanged" }, // Unchanged
        ]);
        
        const event = new Event({ name: "tasks.sync.execute", data: mockEventData });
        await processor.perform(event);

        // New task
        expect(Task.create).toHaveBeenCalledTimes(1);
        expect(Task.create).toHaveBeenCalledWith(
          expect.objectContaining({ guid: "guid-new", title: "New Task", status: "open" }),
          { transaction: mockTransaction }
        );

        // Updated task
        expect(taskToUpdate.title).toBe("New Update Title");
        expect(taskToUpdate.status).toBe("completed");
        expect(taskToUpdate.save).toHaveBeenCalledTimes(1);

        // Orphaned task
        expect(taskToOrphan.status).toBe("orphaned");
        expect(taskToOrphan.save).toHaveBeenCalledTimes(1);
        
        // Unchanged task
        expect(taskUnchanged.save).not.toHaveBeenCalled();
      });
    });
  });

  describe("extractTasksFromNode", () => {
    // Accessing the private method for testing (common in Jest)
    const processorInstance = new TaskSyncProcessor(new Sequelize({ dialect: 'postgres'})); // Need a real Sequelize instance for this.sequelize
    const extractTasks = (processorInstance as any).extractTasksFromNode.bind(processorInstance);

    it("should extract tasks correctly from Prosemirror node", () => {
      const mockNode = {
        descendants: (callback: (node: any, pos: number, parent: any) => boolean) => {
          callback({
            type: { name: "task_item" },
            attrs: { guid: "guid1", checked: true },
            textContent: "[x] Task 1 Content",
          }, 0, {} as any);
          callback({
            type: { name: "task_item" },
            attrs: { guid: "guid2", checked: false },
            textContent: "[ ] Task 2 Content",
          }, 0, {} as any);
          callback({ // Should ignore non-task_item nodes
            type: { name: "paragraph" },
            attrs: {},
            textContent: "Some other text",
          }, 0, {} as any);
           callback({ // Task item without guid should be logged but not included (or handled as per impl.)
            type: { name: "task_item" },
            attrs: { checked: false }, // No guid
            textContent: "Task without guid",
          }, 0, {} as any);
        },
      } as ProsemirrorNode;

      const tasks = extractTasks(mockNode);
      expect(tasks).toHaveLength(2); // Only tasks with GUIDs
      expect(tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ guid: "guid1", checked: true, title: "Task 1 Content" }),
          expect.objectContaining({ guid: "guid2", checked: false, title: "Task 2 Content" }),
        ])
      );
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.any(String), // processor class name
        "Found task_item node without a guid",
        { nodeAttrs: { checked: false } }
      );
    });

    it("should use default title if textContent is empty", () => {
        const mockNode = {
            descendants: (callback: (node: any) => boolean) => {
              callback({
                type: { name: "task_item" },
                attrs: { guid: "guid-empty", checked: false },
                textContent: "", // Empty content
              });
            },
          } as ProsemirrorNode;
    
          const tasks = extractTasks(mockNode);
          expect(tasks).toHaveLength(1);
          expect(tasks[0].title).toBe("Untitled Task");
    });
  });
});
