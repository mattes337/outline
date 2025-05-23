import Router from "koa-router";
import { Op, Transaction } from "sequelize";
import { auth } from "@server/middlewares/authentication";
import { validate }s from "@server/middlewares/validator";
import { Task, Document, TaskComment, User }s from "@server/models";
import { Event }s from "@server/models";
import { authorize }s from "@server/policies/task";
import { presentTask, presentTasks }s from "@server/presenters/task";
import { presentTaskComment }s from "@server/presenters/taskComment";
import { APIContext }s from "@server/types";
import { pagination }s from "@server/middlewares/pagination";
import { NotFoundError, ValidationError }s from "@server/errors";
import { jobManager }s from "@server/queues";
import { DocumentHelper }s from "@server/models/helpers/DocumentHelper";
import { ProsemirrorNode }s from "prosemirror-model";
import { defaultRouter }s from "."; // For default error handling

const router = new Router();

// Helper function to get tasks by status and team
const getTasksByStatusAndTeam = async (
  ctx: APIContext,
  status: "open" | "completed",
  orderBy: [string, "ASC" | "DESC"][]
) => {
  const user = ctx.state.auth.user;
  authorize(user, "list");

  const tasks = await Task.findAll({
    where: {
      status,
    },
    include: [
      {
        model: Document,
        as: "document",
        required: true,
        where: { teamId: user.teamId },
        attributes: ["id", "title", "urlId", "teamId"], // Minimal attributes
      },
      {
        model: User,
        as: "assignee",
        required: false,
      },
    ],
    order: orderBy,
    ...pagination(ctx),
  });
  return tasks;
};

// GET /api/tasks/my
router.get(
  "/tasks.my",
  auth(),
  async (ctx: APIContext) => {
    const user = ctx.state.auth.user;
    authorize(user, "list");

    const tasks = await Task.findAll({
      where: {
        userId: user.id,
        status: "open",
      },
      include: [
        {
          model: Document,
          as: "document",
          required: true,
          attributes: ["id", "title", "urlId", "teamId"],
        },
        {
          model: User,
          as: "assignee",
          required: false, // assignee might be null
        },
      ],
      order: [["priority", "ASC"]],
      ...pagination(ctx),
    });

    ctx.body = {
      data: presentTasks(tasks),
      pagination: ctx.state.pagination,
    };
  }
);

// GET /api/tasks/open
router.get(
  "/tasks.open",
  auth(),
  async (ctx: APIContext) => {
    const tasks = await getTasksByStatusAndTeam(ctx, "open", [
      ["priority", "ASC"],
    ]);
    ctx.body = {
      data: presentTasks(tasks),
      pagination: ctx.state.pagination,
    };
  }
);

// GET /api/tasks/done
router.get(
  "/tasks.done",
  auth(),
  async (ctx: APIContext) => {
    const tasks = await getTasksByStatusAndTeam(ctx, "completed", [
      ["updatedAt", "DESC"],
    ]);
    ctx.body = {
      data: presentTasks(tasks),
      pagination: ctx.state.pagination,
    };
  }
);

// GET /api/tasks/:guid
router.get(
  "/tasks.info",
  auth(),
  validate("params", {
    guid: "uuid",
  }),
  async (ctx: APIContext) => {
    const { guid } = ctx.input.params;
    const user = ctx.state.auth.user;

    const task = await Task.findOne({
      where: { guid },
      include: [
        {
          model: Document,
          as: "document",
          required: true,
        },
        {
          model: User,
          as: "assignee",
        },
        {
          model: TaskComment,
          as: "comments",
          include: [
            {
              model: User,
              as: "user", // This alias must match your TaskComment model association
            },
          ],
          order: [["createdAt", "ASC"]], // Order comments by creation time
        },
      ],
    });

    if (!task) {
      throw new NotFoundError("Task not found");
    }
    authorize(user, "read", task);

    ctx.body = { data: presentTask(task) };
  }
);

// PUT /api/tasks/:guid
router.put(
  "/tasks.update",
  auth(),
  validate("params", {
    guid: "uuid",
  }),
  validate("body", {
    title: "string?",
    body: "string?",
    status: "stringIn?|open,completed",
    priority: "integer?",
    userId: "uuid?", // Assignee ID
  }),
  async (ctx: APIContext) => {
    const { guid } = ctx.input.params;
    const body = ctx.input.body;
    const user = ctx.state.auth.user;

    const task = await Task.findOne({
        where: { guid },
        include: [{model: Document, as: "document"}]
    });
    if (!task) {
      throw new NotFoundError("Task not found");
    }
    authorize(user, "update", task);

    const oldStatus = task.status;

    if (body.title !== undefined) task.title = body.title;
    if (body.body !== undefined) task.body = body.body;
    if (body.status !== undefined) task.status = body.status;
    if (body.priority !== undefined) task.priority = body.priority;
    if (body.userId !== undefined) task.userId = body.userId; // Allows clearing assignee with null

    await task.save();

    // If status changed, enqueue a job to update the document node
    if (body.status && body.status !== oldStatus) {
      await jobManager.enqueue(
        "tasks.update_document_node",
        {
          taskId: task.id,
          documentId: task.documentId,
          newCheckedState: task.status === "completed",
        }
      );
    }
    
    // Reload task with associations for presenter
    const reloadedTask = await Task.findOne({
      where: { id: task.id },
      include: [
        { model: Document, as: "document" },
        { model: User, as: "assignee" },
        { model: TaskComment, as: "comments", include: [{model: User, as: "user"}] },
      ],
    });

    ctx.body = { data: presentTask(reloadedTask!) };
  }
);

// POST /api/tasks/:guid/comments
router.post(
  "/tasks.createComment",
  auth(),
  validate("params", {
    guid: "uuid",
  }),
  validate("body", {
    content: "string",
  }),
  async (ctx: APIContext) => {
    const { guid } = ctx.input.params;
    const { content } = ctx.input.body;
    const user = ctx.state.auth.user;

    const task = await Task.findOne({ where: { guid } });
    if (!task) {
      throw new NotFoundError("Task not found");
    }
    authorize(user, "createComment", task);

    const comment = await TaskComment.create({
      taskId: task.id,
      userId: user.id,
      content,
    });
    
    // Reload comment with author for presenter
    const reloadedComment = await TaskComment.findByPk(comment.id, {
        include: [{model: User, as: "user"}]
    });

    ctx.body = { data: presentTaskComment(reloadedComment!) };
  }
);

// PUT /api/tasks/reorder
router.put(
  "/tasks.reorder",
  auth(),
  validate("body", {
    orderedGuids: "array|uuid", // Array of UUIDs
  }),
  async (ctx: APIContext) => {
    const { orderedGuids } = ctx.input.body;
    const user = ctx.state.auth.user;

    authorize(user, "reorder");

    await ctx.sequelize.transaction(async (transaction: Transaction) => {
      const tasks = await Task.findAll({
        where: { guid: { [Op.in]: orderedGuids } },
        include: [{ model: Document, as: "document", attributes: ["teamId"] }],
        transaction,
      });

      if (tasks.length !== orderedGuids.length) {
        throw new ValidationError("One or more tasks not found.");
      }

      for (const task of tasks) {
        if (task.document?.teamId !== user.teamId) {
          throw new ValidationError(
            "One or more tasks do not belong to your team."
          );
        }
        const newPriority = orderedGuids.indexOf(task.guid);
        if (task.priority !== newPriority) {
          task.priority = newPriority;
          await task.save({ transaction });
        }
      }
    });

    ctx.body = { success: true };
  }
);

export default router;
