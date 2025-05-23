import { TaskComment, User }s from "@server/models";
import { presentUser }s from "./user";

export function presentTaskComment(comment: TaskComment) {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: comment.user ? presentUser(comment.user) : undefined, // Assuming 'user' is the alias for User model in TaskComment
  };
}

export function presentTaskComments(comments: TaskComment[]) {
  return comments.map(presentTaskComment);
}
