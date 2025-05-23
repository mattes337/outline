import { Task, Document, User } from "@server/models";
import { AdminRequiredError, SameTeamRequiredError } from "@server/errors";
import { AccessControl } from "./base";

export class TaskAccessControl extends AccessControl {
  // Policy to view a specific task by its GUID.
  // User must have access to the document the task belongs to.
  async read(task: Task): Promise<boolean> {
    if (!this.user) return false;
    const document = await Document.findByPk(task.documentId, {
      userId: this.user.id, // This ensures document policies (membership/team) are checked
    });
    return !!document;
  }

  // Policy to update a task.
  // User must be the assignee, or an admin, or have editor rights on the document.
  async update(task: Task): Promise<boolean> {
    if (!this.user) return false;
    if (this.user.isAdmin) return true;
    if (task.userId === this.user.id) return true;

    const document = await Document.findByPk(task.documentId, {
      userId: this.user.id,
    });
    if (document && (await document.isMember(this.user.id) || this.user.isAdmin)) { // Assuming isMember implies edit rights for simplicity
        // More granular check: document.getMembership(this.user.id)?.permission === "edit"
        return true;
    }
    return false;
  }

  // Policy to create a comment on a task.
  // User must have access to the task (which implies document access).
  async createComment(task: Task): Promise<boolean> {
    return this.read(task);
  }

  // Policy for listing tasks (e.g., /my, /open, /done).
  // Generally, if a user is authenticated, they can see lists filtered by their team/assignments.
  // Specific filtering logic is in the route handlers.
  async list(user?: User): Promise<boolean> {
    return !!(user || this.user);
  }
  
  // Policy for reordering tasks. User must be authenticated.
  // Further checks (e.g. all tasks belong to user's team) will be in the route handler.
  async reorder(): Promise<boolean> {
    return !!this.user;
  }
}

export function can(
  user: User | undefined,
  action: keyof TaskAccessControl,
  subject?: Task | User // User for 'list' action if listing for a specific user
) {
  const access = new TaskAccessControl(user);
  if (subject instanceof Task) {
    return access[action](subject as Task);
  }
  if (subject instanceof User && action === "list") {
    return access[action](subject as User);
  }
  if (action === "list" || action === "reorder") {
     // For general list actions not tied to a specific user or reorder
    return (access[action] as () => Promise<boolean>)();
  }
  return false;
}

export function authorize(
  user: User | undefined,
  action: keyof TaskAccessControl,
  subject?: Task | User
) {
  if (!can(user, action, subject)) {
    // Customize error based on action or subject if needed
    throw new AdminRequiredError(); // Or a more specific error
  }
  return true;
}
