import { Op, Transaction, Sequelize } from "sequelize";
import { Event, Document, Task, User } from "@server/models";
import { DocumentHelper }s from "@server/models/helpers/DocumentHelper";
import { ProsemirrorNode, Schema }s from "prosemirror-model";
import TaskDocumentNodeUpdateProcessor from "./TaskDocumentNodeUpdateProcessor";
import { jobManager }s from "@server/queues";
import Logger from "@server/logging/Logger";
import { InvalidArgumentError }s from "@server/errors";

// Mock models and helpers
jest.mock("@server/models/Document");
jest.mock("@server/models/Task");
jest.mock("@server/models/User");
jest.mock("@server/models/helpers/DocumentHelper");
jest.mock("@server/queues", () => ({
  jobManager: {
    enqueue: jest.fn(),
  },
}));
jest.mock("@server/logging/Logger");
jest.mock("@server/models/Event", () => ({
  create: jest.fn().mockResolvedValue({
    queue: jest.fn().mockResolvedValue(undefined),
  }),
}));


const mockTransaction = {} as Transaction;

// A basic Prosemirror schema for creating test nodes
const testSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*" },
    task_item: {
      attrs: { guid: { default: "" }, checked: { default: false } },
      content: "text*", // Allow text content within task_item
      inline: false,
      group: "block",
    },
    text: { group: "inline" },
  },
});

describe("TaskDocumentNodeUpdateProcessor", () => {
  let processor: TaskDocumentNodeUpdateProcessor;
  let mockSequelize: Sequelize;

  beforeEach(() => {
    mockSequelize = {
      transaction: jest.fn((callback) => callback(mockTransaction)),
    } as any as Sequelize;
    processor = new TaskDocumentNodeUpdateProcessor(mockSequelize);

    jest.clearAllMocks();
    (Document.findByPk as jest.Mock).mockClear();
    (Task.findByPk as jest.Mock).mockClear();
    (User.findByPk as jest.Mock).mockClear();
    (DocumentHelper.toProsemirror as jest.Mock).mockClear();
    (DocumentHelper.toMarkdown as jest.Mock).mockClear();
    (DocumentHelper.toProsemirrorJSON as jest.Mock).mockClear();
    (jobManager.enqueue as jest.Mock).mockClear();
    (Event.create as jest.Mock).mockClear();
  });

  const actorId = "user-actor-id";
  const documentId = "doc-id-for-node-update";
  const taskIdToUpdate = "task-id-to-update";
  const taskGuid = "task-guid-for-node-update";

  const mockEventData = {
    taskId: taskIdToUpdate,
    documentId,
    newCheckedState: true,
    actorId,
  };
  
  const mockTask = {
    id: taskIdToUpdate,
    guid: taskGuid,
    documentId,
  } as Task;

  const mockDocument = {
    id: documentId,
    teamId: "team-id",
    collectionId: "collection-id",
    lastModifiedById: "some-user-id",
    content: {}, // Will be ProsemirrorJSON
    text: "",
    title: "Test Document",
    updatedAt: new Date(),
    save: jest.fn().mockResolvedValue(this),
    // Add other fields Document model might have if they are accessed
  } as any as Document; // Cast to allow mocking save


  it("should throw InvalidArgumentError if taskId is missing", async () => {
    const event = new Event({
      name: "tasks.update_document_node",
      data: { ...mockEventData, taskId: undefined },
    });
    await expect(processor.perform(event)).rejects.toThrow(InvalidArgumentError);
  });

  it("should warn and return if task not found", async () => {
    (Task.findByPk as jest.Mock).mockResolvedValue(null);
    const event = new Event({ name: "tasks.update_document_node", data: mockEventData });
    await processor.perform(event);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      `Task ${taskIdToUpdate} not found. Skipping document node update.`,
      mockEventData
    );
  });

  it("should warn and return if document not found", async () => {
    (Task.findByPk as jest.Mock).mockResolvedValue(mockTask);
    (Document.findByPk as jest.Mock).mockResolvedValue(null);
    const event = new Event({ name: "tasks.update_document_node", data: mockEventData });
    await processor.perform(event);
    expect(Logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        `Document ${documentId} not found. Skipping document node update.`,
        mockEventData
    );
  });

  it("should log error if document cannot be converted to Prosemirror node", async () => {
    (Task.findByPk as jest.Mock).mockResolvedValue(mockTask);
    (Document.findByPk as jest.Mock).mockResolvedValue(mockDocument);
    (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(null);
    const event = new Event({ name: "tasks.update_document_node", data: mockEventData });
    await processor.perform(event);
    expect(Logger.error).toHaveBeenCalledWith(
        expect.any(String),
        `Could not convert document ${documentId} to Prosemirror node.`,
        mockEventData
    );
  });
  
  it("should log if actorId is provided but user not found, and throw error", async () => {
    (Task.findByPk as jest.Mock).mockResolvedValue(mockTask);
    (Document.findByPk as jest.Mock).mockResolvedValue(mockDocument);
    const pmNode = testSchema.node("doc", null, [
        testSchema.node("task_item", { guid: taskGuid, checked: false }, [testSchema.text("Test task")])
    ]);
    (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(pmNode);
    (User.findByPk as jest.Mock).mockResolvedValue(null); // Actor not found

    const event = new Event({ name: "tasks.update_document_node", data: mockEventData });
    await expect(processor.perform(event)).rejects.toThrow("User not found to perform document update for task node.");
    expect(Logger.error).toHaveBeenCalledWith(
        expect.any(String),
        `Actor/User not found for document update. ActorId: ${actorId}, Fallback: ${mockDocument.lastModifiedById}`,
        mockEventData
    );
  });


  describe("successful node update", () => {
    let mockUser: User;

    beforeEach(() => {
        mockUser = { id: actorId, teamId: "team-id" } as User;
        (Task.findByPk as jest.Mock).mockResolvedValue(mockTask);
        (Document.findByPk as jest.Mock).mockResolvedValue(mockDocument);
        (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
        
        // Reset document's save mock for each test in this block
        (mockDocument.save as jest.Mock).mockClear();
        (Event.create as jest.Mock).mockClear();
        ((Event.create as jest.Mock).mockResolvedValue({ queue: jest.fn() }) as any).mockClear?.();


    });

    it("should update task item node, save document, and enqueue sync request", async () => {
        const initialPmNode = testSchema.node("doc", null, [
            testSchema.node("task_item", { guid: taskGuid, checked: false }, [testSchema.text("Task content")])
        ]);
        (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(initialPmNode);
        
        const expectedUpdatedText = "Updated Markdown"; // Mocked return from toMarkdown
        (DocumentHelper.toMarkdown as jest.Mock).mockReturnValue(expectedUpdatedText);
        
        const expectedUpdatedJson = { type: "doc", content: [ /* ... updated content ... */ ]}; // Mocked return
        (DocumentHelper.toProsemirrorJSON as jest.Mock).mockReturnValue(expectedUpdatedJson);

        const event = new Event({ name: "tasks.update_document_node", data: mockEventData });
        await processor.perform(event);

        expect(DocumentHelper.toProsemirror).toHaveBeenCalledWith(mockDocument);
        expect(mockDocument.content).toEqual(expectedUpdatedJson);
        expect(mockDocument.text).toEqual(expectedUpdatedText);
        expect(mockDocument.lastModifiedById).toEqual(actorId);
        expect(mockDocument.save).toHaveBeenCalledTimes(1);
        
        expect(Event.create).toHaveBeenCalledTimes(1);
        expect(Event.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: "documents.update", documentId: mockDocument.id, actorId }),
            expect.any(Object)
        );
        
        const mockCreatedEvent = await Event.create({} as any); // Get the mocked return value
        expect(mockCreatedEvent.queue).toHaveBeenCalledTimes(1);
        expect(mockCreatedEvent.queue).toHaveBeenCalledWith(
            "tasks.sync.request",
            expect.objectContaining({ documentId: mockDocument.id, timestamp: mockDocument.updatedAt.toISOString() }),
            expect.any(Object)
        );

        expect(Logger.info).toHaveBeenCalledWith(
            expect.any(String),
            `TaskItem node ${taskGuid} updated in document ${documentId}. New checked state: ${mockEventData.newCheckedState}. Saving document.`,
            mockEventData
        );
        expect(Logger.info).toHaveBeenCalledWith(
            expect.any(String),
            `Document ${documentId} saved successfully after task node update.`,
            mockEventData
        );
    });

    it("should log if node already had correct state and not save", async () => {
        const initialPmNode = testSchema.node("doc", null, [
            testSchema.node("task_item", { guid: taskGuid, checked: true }, [testSchema.text("Task content")]) // Already checked
        ]);
        (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(initialPmNode);
        
        const event = new Event({ name: "tasks.update_document_node", data: mockEventData }); // newCheckedState is true
        await processor.perform(event);

        expect(mockDocument.save).not.toHaveBeenCalled();
        expect(Event.create).not.toHaveBeenCalled();
        expect(jobManager.enqueue).not.toHaveBeenCalled(); // Because Event.create().queue() is not called
        expect(Logger.info).toHaveBeenCalledWith(
            expect.any(String),
            `TaskItem node ${taskGuid} in document ${documentId} already had the correct state or was not found. No update performed.`,
            mockEventData
        );
    });
    
    it("should correctly update a nested task item node", async () => {
        const initialPmNode = testSchema.node("doc", null, [
            testSchema.node("paragraph", null, [ // Task item nested inside a paragraph
                testSchema.node("task_item", { guid: taskGuid, checked: false }, [testSchema.text("Nested Task")])
            ])
        ]);
        (DocumentHelper.toProsemirror as jest.Mock).mockResolvedValue(initialPmNode);
        (DocumentHelper.toMarkdown as jest.Mock).mockReturnValue("Updated Nested Markdown");
        (DocumentHelper.toProsemirrorJSON as jest.Mock).mockReturnValue({ type: "doc", content: [] });


        const event = new Event({ name: "tasks.update_document_node", data: mockEventData });
        await processor.perform(event);

        expect(mockDocument.save).toHaveBeenCalledTimes(1);
        expect(mockDocument.text).toBe("Updated Nested Markdown");
        expect(Event.create).toHaveBeenCalledTimes(1);
         const mockCreatedEvent = await Event.create({} as any);
        expect(mockCreatedEvent.queue).toHaveBeenCalledTimes(1);
    });
  });
});
