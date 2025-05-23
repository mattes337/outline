import { Task, User, Document } from "@server/models";
import { presentUser } from "./user";
import { presentDocument }s from "./document";
import { presentTaskComment }s from "./taskComment"; // Assuming this will be created

export function presentTask(task: Task) {
  return {
    id: task.id,
    guid: task.guid,
    title: task.title,
    body: task.body,
    status: task.status,
    priority: task.priority,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    document: task.document ? presentDocument(task.document) : undefined,
    assignee: task.assignee ? presentUser(task.assignee) : undefined,
    comments: task.comments?.map(presentTaskComment) || [],
  };
}

export function presentTasks(tasks: Task[]) {
  return tasks.map(presentTask);
}
