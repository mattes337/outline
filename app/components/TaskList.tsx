import React from "react";
import { observer } from "mobx-react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  ResponderProvided,
  DraggableProvided,
  DraggableStateSnapshot,
  DroppableProvided,
} from "react-beautiful-dnd";
import { Task } from "@shared/types/Tasks";
import Avatar from "@shared/components/Avatar";
import Checkbox from "@shared/components/Checkbox";
import Flex from "@shared/components/Flex";
import Text from "@shared/components/Text";
import { DocumentIcon }s from "@shared/components/icons";

type Props = {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onReorder?: (orderedGuids: string[]) => void; // Callback with new order of GUIDs
  droppableId: string; // Unique ID for the droppable area
  isReorderEnabled: boolean; // To enable/disable dnd on this list
  className?: string;
};

const TaskListItemContainer = styled.div<{ isDragging?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid ${(props) => props.theme.divider};
  cursor: pointer;
  transition: background-color 0.1s ease-in-out;
  background-color: ${(props) =>
    props.isDragging ? props.theme.listItemHoverBackground : "transparent"};

  &:hover {
    background-color: ${(props) => props.theme.listItemHoverBackground};
  }

  .checkbox-container {
    margin-right: 12px;
    // Prevent click on checkbox from triggering onTaskClick for the row if not dragging
    pointer-events: ${(props) => (props.isDragging ? "auto" : "none")};
  }

  .details {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  .title {
    font-weight: 500;
    margin-bottom: 4px;
  }

  .meta {
    display: flex;
    align-items: center;
    color: ${(props) => props.theme.textSecondary};
    font-size: 13px;

    .document-link {
      display: flex;
      align-items: center;
      color: ${(props) => props.theme.textSecondary};
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }

      svg {
        margin-right: 4px;
      }
    }
  }

  .assignee-avatar {
    margin-left: 12px;
    flex-shrink: 0;
  }
`;

const TaskListContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const TaskListItem: React.FC<{ task: Task; onClick: () => void }> = observer(
  ({
    task,
    onClick,
    provided,
    snapshot,
  }: {
    task: Task;
    onClick: () => void;
    provided: DraggableProvided;
    snapshot: DraggableStateSnapshot;
  }) => (
    <TaskListItemContainer
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      onClick={onClick}
      isDragging={snapshot.isDragging}
    >
      <div className="checkbox-container">
        <Checkbox
          type="checkbox"
          checked={task.status === "completed"}
          readOnly
        />
      </div>
      <div className="details">
        <Text className="title" as="span" size="medium" truncate>
          {task.title}
        </Text>
        <div className="meta">
          {task.document && (
            <Link
              to={task.document.path}
              className="document-link"
              onClick={(e) => e.stopPropagation()}
            >
              <DocumentIcon size={16} />
              {task.document.title}
            </Link>
          )}
        </div>
      </div>
      {task.assignee && (
        <Avatar
          className="assignee-avatar"
          model={task.assignee}
          size={24}
        />
      )}
    </TaskListItemContainer>
  )
);

const TaskList: React.FC<Props> = observer(
  ({ tasks, onTaskClick, onReorder, droppableId, isReorderEnabled, className }) => {
    const handleDragEnd = (result: DropResult, provided?: ResponderProvided) => {
      if (!result.destination || !onReorder) {
        return;
      }

      if (result.destination.index === result.source.index) {
        return;
      }

      const newTasks = Array.from(tasks);
      const [removed] = newTasks.splice(result.source.index, 1);
      newTasks.splice(result.destination.index, 0, removed);

      const orderedGuids = newTasks.map((t) => t.guid);
      onReorder(orderedGuids);
      // Note: Optimistic update is handled by the parent component re-passing tasks prop
    };

    if (!tasks.length) {
      return <Text color="tertiary">No tasks here.</Text>;
    }

    if (!isReorderEnabled) {
      return (
        <TaskListContainer className={className}>
          {tasks.map((task) => (
            // Simplified rendering without Draggable/Droppable for non-reorderable lists
             <TaskListItemContainer onClick={() => onTaskClick(task)} key={task.id}>
                <div className="checkbox-container">
                    <Checkbox type="checkbox" checked={task.status === "completed"} readOnly />
                </div>
                <div className="details">
                    <Text className="title" as="span" size="medium" truncate>{task.title}</Text>
                    <div className="meta">
                    {task.document && (
                        <Link to={task.document.path} className="document-link" onClick={(e) => e.stopPropagation()}>
                        <DocumentIcon size={16} />{task.document.title}
                        </Link>
                    )}
                    </div>
                </div>
                {task.assignee && <Avatar className="assignee-avatar" model={task.assignee} size={24} />}
            </TaskListItemContainer>
          ))}
        </TaskListContainer>
      );
    }
    
    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId={droppableId}>
          {(provided: DroppableProvided) => (
            <TaskListContainer
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={className}
            >
              {tasks.map((task, index) => (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(providedDraggable, snapshot) => (
                    <TaskListItem
                      task={task}
                      onClick={() => onTaskClick(task)}
                      provided={providedDraggable}
                      snapshot={snapshot}
                    />
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </TaskListContainer>
          )}
        </Droppable>
      </DragDropContext>
    );
  }
);

export default TaskList;
