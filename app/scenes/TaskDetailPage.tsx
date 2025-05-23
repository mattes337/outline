import React, { useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react";
import { useParams, useHistory, Link } from "react-router-dom";
import styled from "styled-components";
import { Task }from "@shared/types/Tasks"; // Assuming this type exists from API contract
import useStores from "@hooks/useStores";
import CenteredContent from "@components/CenteredContent";
import PageTitle from "@components/PageTitle";
import LoadingIndicator from "@components/LoadingIndicator";
import Empty from "@components/Empty";
import Text from "@shared/components/Text";
import Flex from "@shared/components/Flex";
import Button from "@components/Button";
import Avatar from "@shared/components/Avatar";
import { DocumentIcon }s from "@shared/components/icons";
import Editor from "@components/Editor"; // Assuming standard editor component

// Basic User Select Placeholder
const BasicUserSelect = styled.select`
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid ${(props) => props.theme.divider};
  background: ${(props) => props.theme.inputBackground};
  color: ${(props) => props.theme.text};
  min-width: 150px; // Adjust as needed
`;

const Container = styled(CenteredContent)`
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const TaskHeader = styled(Flex)`
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${(props) => props.theme.divider};
`;

const TaskTitleInput = styled.input`
  font-size: 24px;
  font-weight: 600;
  border: none;
  outline: none;
  padding: 4px 8px;
  margin: -4px -8px; // Offset padding for seamless look
  width: 100%;
  background: transparent;

  &:hover, &:focus {
    background: ${(props) => props.theme.inputHoverBackground};
  }
`;

const MetaSection = styled(Flex)`
  margin-top: 16px;
  gap: 24px;
`;

const MetaItem = styled(Flex)`
  align-items: center;
  gap: 8px;
  color: ${(props) => props.theme.textSecondary};
`;

const TaskBody = styled.div`
  margin-top: 16px;
  margin-bottom: 32px;
`;

const CommentsSection = styled.div`
  margin-top: 32px;
  h3 {
    margin-bottom: 16px;
  }
`;

const CommentItem = styled.div`
  display: flex;
  margin-bottom: 16px;
  padding: 8px;
  border: 1px solid ${(props) => props.theme.divider};
  border-radius: 4px;

  .author-avatar {
    margin-right: 12px;
    flex-shrink: 0;
  }
  .comment-content {
    flex-grow: 1;
  }
`;

const AddCommentForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 8px;

  textarea {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid ${(props) => props.theme.divider};
    resize: vertical;
  }
`;


type TaskDetailPageParams = {
  guid: string;
};

const TaskDetailPage: React.FC = observer(() => {
  const { guid } = useParams<TaskDetailPageParams>();
  const { tasks: tasksStore, users: usersStore, ui: uiStore } = useStores();
  const history = useHistory();

  const [task, setTask] = useState<Task | null | undefined>(undefined); // undefined for loading, null for not found
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingBody, setEditingBody] = useState<string | undefined>(undefined);
  const [newComment, setNewComment] = useState("");

  const fetchTaskDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedTask = await tasksStore.fetchTask(guid);
      setTask(fetchedTask);
      if (fetchedTask) {
        setEditingTitle(fetchedTask.title);
        setEditingBody(fetchedTask.body || ""); // Initialize editor content
      }
    } catch (err: any) {
      if (err.status === 404) {
        setTask(null); // Not found
      } else {
        setError("Failed to load task details.");
        uiStore.showToast("Failed to load task details", "error");
      }
    } finally {
      setLoading(false);
    }
  }, [guid, tasksStore, uiStore]);

  useEffect(() => {
    fetchTaskDetails();
  }, [fetchTaskDetails]);

  // Placeholder for users list for assignee selection
  // useEffect(() => {
  // usersStore.fetchPage({ limit: 100 }); // Fetch users for assignee dropdown
  // }, [usersStore]);


  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTitle(event.target.value);
  };

  const handleTitleBlur = async () => {
    if (!task || task.title === editingTitle) return;
    try {
      const updatedTask = await tasksStore.updateTask(task.guid, { title: editingTitle });
      setTask(updatedTask); // Update with full response
      setEditingTitle(updatedTask.title);
      uiStore.showToast("Task title updated", "success");
    } catch (err) {
      uiStore.showToast("Failed to update title", "error");
      setEditingTitle(task.title); // Revert
    }
  };

  const handleTitleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      setEditingTitle(task?.title || "");
      event.currentTarget.blur();
    }
  };

  const handleEditorChange = (value: () => string) => {
    // This callback often provides a function that returns the content
    const newBody = value();
    setEditingBody(newBody);
  };

  const handleEditorSave = async () => {
    if (!task || task.body === editingBody) return;
    try {
      const updatedTask = await tasksStore.updateTask(task.guid, { body: editingBody });
      setTask(updatedTask); // Update with full response
      setEditingBody(updatedTask.body || "");
      uiStore.showToast("Task description updated", "success");
    } catch (err) {
      uiStore.showToast("Failed to update description", "error");
      // Revert or handle error display
    }
  };

  const handleStatusChange = async () => {
    if (!task) return;
    const newStatus = task.status === "open" ? "completed" : "open";
    try {
      const updatedTask = await tasksStore.updateTask(task.guid, { status: newStatus });
      setTask(updatedTask); // Update local state with full response
      uiStore.showToast(`Task marked as ${newStatus}`, "success");
    } catch (err) {
      uiStore.showToast("Failed to update status", "error");
    }
  };
  
  const handleAssigneeChange = async (userId: string | null) => {
    if (!task) return;
    try {
      const updatedTask = await tasksStore.updateTask(task.guid, { userId });
      setTask(updatedTask); // Update with response which should include new assignee object
      uiStore.showToast("Assignee updated", "success");
    } catch (err) {
      uiStore.showToast("Failed to update assignee", "error");
    }
  };

  const handleCommentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task || !newComment.trim()) return;
    try {
      const createdComment = await tasksStore.createComment(task.guid, newComment);
      // Optimistically add comment or re-fetch task
      // For now, re-fetching to get all comments correctly associated
      setNewComment("");
      fetchTaskDetails(); // Re-fetch to get the new comment
      uiStore.showToast("Comment added", "success");
    } catch (err) {
      uiStore.showToast("Failed to add comment", "error");
    }
  };

  if (loading) {
    return <LoadingIndicator />;
  }

  if (error) {
    return <Empty>{error}</Empty>;
  }

  if (task === null) {
    return <Empty>Task not found.</Empty>;
  }
  
  if (!task) { // Should be caught by null above, but for type safety
    return <Empty>Something went wrong.</Empty>;
  }
  
  const teamUsers = usersStore.users; // Assuming usersStore.users holds the list of team users

  return (
    <Container>
      <PageTitle title={task.title || "Task"} />
      <TaskHeader justify="space-between" align="center">
        <TaskTitleInput
            type="text"
            value={editingTitle}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            disabled={task.status === "completed"}
        />
        <Button 
            onClick={handleStatusChange} 
            neutral={task.status === "open"} 
            primary={task.status === "completed"} // Visual cue
        >
          {task.status === "open" ? "Mark as Complete" : "Re-open Task"}
        </Button>
      </TaskHeader>

      <MetaSection>
        <MetaItem>
          <Text color="tertiary">Assignee:</Text>
            {teamUsers && teamUsers.length > 0 ? (
              <BasicUserSelect
                value={task.userId || ""}
                onChange={(e) => handleAssigneeChange(e.target.value || null)}
                disabled={task.status === "completed"}
              >
                <option value="">Unassigned</option>
                {teamUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </BasicUserSelect>
            ) : task.assignee ? (
            <Flex align="center" gap={4}>
              <Avatar model={task.assignee} size={24} /> {task.assignee.name}
            </Flex>
          ) : (
              <Text>Unassigned (no users to select)</Text>
          )}
        </MetaItem>
        {task.document && (
          <MetaItem>
            <Text color="tertiary">Document:</Text>
            <Link to={task.document.path}>
              <Flex align="center" gap={4}>
                <DocumentIcon size={16} /> {task.document.title}
              </Flex>
            </Link>
          </MetaItem>
        )}
         <MetaItem>
            <Text color="tertiary">Priority:</Text>
            <Text>{task.priority}</Text> {/* Display only, not editable here */}
        </MetaItem>
      </MetaSection>

      <TaskBody>
        <h4>Description</h4>
        {/* Placeholder for Markdown Editor / Renderer */}
        {task.status !== "completed" ? (
          <Editor
            id={`task-body-${task.id}`}
            defaultValue={editingBody || ""}
            onChange={handleEditorChange}
            onSave={handleEditorSave} // Assuming editor has an onSave prop or similar mechanism
            // onBlur={handleEditorSave} // Alternative: save on blur
            // Add other necessary props like `uploadFile`, `onClickLink` etc. if the editor needs them
            // For simplicity, assuming a basic editor setup for now.
            placeholder="Add a description..."
            readOnly={task.status === "completed"} // Should be handled by conditional rendering below
            autoFocus={false} // Don't autofocus the body editor
          />
        ) : (
          // Rendered markdown for completed tasks (read-only)
          // This might require a separate Markdown renderer component if Editor doesn't have a pure read-only mode
          // For now, let's assume Editor handles readOnly prop well for display.
          // If not, a component like `Markdown from "@components/Markdown"` would be used.
          <Editor
            id={`task-body-${task.id}`}
            defaultValue={task.body || "No description."}
            readOnly
          />
        )}
      </TaskBody>

      <CommentsSection>
        <h3>Comments</h3>
        {task.comments && task.comments.length > 0 ? (
          task.comments.map((comment) => (
            <CommentItem key={comment.id}>
              {comment.author && <Avatar className="author-avatar" model={comment.author} size={32} />}
              <div className="comment-content">
                <Text weight="bold">{comment.author?.name || "Unknown User"}</Text>
                {/* Placeholder for rendering comment content as Markdown */}
                {/* <Markdown source={comment.content} /> */}
                <Text as="p" style={{ whiteSpace: "pre-wrap" }}>
                  {comment.content}
                </Text>
                <Text size="small" color="tertiary">
                  {new Date(comment.createdAt).toLocaleString()}
                </Text>
              </div>
            </CommentItem>
          ))
        ) : (
          <Text color="tertiary">No comments yet.</Text>
        )}
        <AddCommentForm onSubmit={handleCommentSubmit}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
          />
          <Button type="submit" disabled={!newComment.trim()}>Add Comment</Button>
        </AddCommentForm>
      </CommentsSection>
    </Container>
  );
});

export default TaskDetailPage;
