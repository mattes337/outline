# Global Task List Implementation

This document outlines the implementation plan for adding a global task list feature to the Outline application. The task list will aggregate all tasks from documents across the workspace and display them in a centralized location.

## Overview

The global task list feature will:
1. Add a "Tasks" menu item in the sidebar below the "Drafts" item
2. Display all tasks from documents in a table format
3. Allow users to check/uncheck tasks directly from the list
4. Provide a link to navigate to the source document for each task

## Implementation Steps

### 1. Add Tasks Link to Sidebar

**File: `app/components/Sidebar/App.tsx`**

Add a new `TasksLink` component import and include it in the sidebar below the `DraftsLink` component:

```typescript
import { TasksLink } from "./components/TasksLink";

// In the JSX:
<Section>
  <SidebarLink
    to={homePath()}
    icon={<HomeIcon />}
    exact={false}
    label={t("Home")}
  />
  <SidebarLink
    to={searchPath()}
    icon={<SearchIcon />}
    label={t("Search")}
    exact={false}
  />
  {can.createDocument && <DraftsLink />}
  {can.createDocument && <TasksLink />}
</Section>
```

### 2. Create TasksLink Component

**File: `app/components/Sidebar/components/TasksLink.tsx`**

Create a new component for the Tasks link in the sidebar:

```typescript
import { observer } from "mobx-react";
import { CheckboxIcon } from "outline-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import useStores from "~/hooks/useStores";
import { tasksPath } from "~/utils/routeHelpers";
import SidebarLink from "./SidebarLink";

export const TasksLink = observer(() => {
  const { t } = useTranslation();
  const { documents } = useStores();

  return (
    <SidebarLink
      to={tasksPath()}
      icon={<CheckboxIcon />}
      label={t("Tasks")}
    />
  );
});
```

### 3. Add Tasks Route Helper

**File: `app/utils/routeHelpers.ts`**

Add a new route helper for the tasks path:

```typescript
export function tasksPath(): string {
  return "/tasks";
}
```

### 4. Create Tasks Scene

**File: `app/scenes/Tasks.tsx`**

Create a new scene component for the Tasks page:

```typescript
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import styled from "styled-components";
import CenteredContent from "~/components/CenteredContent";
import Empty from "~/components/Empty";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import PageTitle from "~/components/PageTitle";
import PaginatedList from "~/components/PaginatedList";
import Scene from "~/components/Scene";
import Text from "~/components/Text";
import useStores from "~/hooks/useStores";
import { documentPath } from "~/utils/routeHelpers";
import TasksStore from "~/stores/TasksStore";
import { Task } from "~/types";

function Tasks() {
  const { t } = useTranslation();
  const { tasks } = useStores() as { tasks: TasksStore };
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    tasks.fetchPage().finally(() => setIsLoading(false));
  }, [tasks]);

  return (
    <Scene title={t("Tasks")}>
      <PageTitle title={t("Tasks")} />
      <CenteredContent>
        <Heading>{t("Tasks")}</Heading>
        <PaginatedList
          items={tasks.orderedData}
          empty={
            <Empty>{t("No outstanding tasks at the moment")}</Empty>
          }
          fetch={tasks.fetchPage}
          renderItem={(task: Task) => (
            <TaskItem key={`${task.documentId}-${task.id}`} task={task} />
          )}
        />
      </CenteredContent>
    </Scene>
  );
}

type TaskItemProps = {
  task: Task;
};

const TaskItem = observer(({ task }: TaskItemProps) => {
  const { documents, tasks } = useStores();
  const document = documents.get(task.documentId);

  const handleCheckboxChange = React.useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      await tasks.updateTask({
        ...task,
        completed: ev.target.checked,
      });
    },
    [task, tasks]
  );

  if (!document) return null;

  return (
    <TaskRow align="center">
      <Checkbox
        type="checkbox"
        checked={task.completed}
        onChange={handleCheckboxChange}
      />
      <TaskText $completed={task.completed}>{task.text}</TaskText>
      <DocumentLink to={documentPath(document.url)}>
        {document.title}
      </DocumentLink>
    </TaskRow>
  );
});

const TaskRow = styled(Flex)`
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 4px;
  
  &:hover {
    background: ${(props) => props.theme.secondaryBackground};
  }
`;

const Checkbox = styled.input`
  margin-right: 8px;
`;

const TaskText = styled(Text)<{ $completed: boolean }>`
  flex-grow: 1;
  margin-right: 8px;
  text-decoration: ${(props) => (props.$completed ? "line-through" : "none")};
  color: ${(props) => (props.$completed ? props.theme.textTertiary : props.theme.text)};
`;

const DocumentLink = styled(Link)`
  color: ${(props) => props.theme.textSecondary};
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  &:hover {
    color: ${(props) => props.theme.text};
    text-decoration: underline;
  }
`;

export default observer(Tasks);
```

### 5. Create Tasks Store

**File: `app/stores/TasksStore.ts`**

Create a new store for managing tasks:

```typescript
import { action, runInAction, observable } from "mobx";
import RootStore from "./RootStore";
import BaseStore from "./BaseStore";
import { ProsemirrorHelper } from "@shared/utils/ProsemirrorHelper";
import { Task } from "~/types";

export default class TasksStore extends BaseStore<Task> {
  @observable isLoaded: boolean = false;

  constructor(rootStore: RootStore) {
    super(rootStore, Task);
  }

  @action
  fetchPage = async (options = {}): Promise<Task[]> => {
    this.isFetching = true;

    try {
      const res = await this.rootStore.apiClient.post("/tasks.list", options);
      
      runInAction(() => {
        this.isLoaded = true;
        this.isFetching = false;
        
        if (res?.data) {
          res.data.tasks.forEach(this.add);
          return res.data.tasks;
        }
      });
      
      return [];
    } catch (err) {
      this.isFetching = false;
      throw err;
    }
  };

  @action
  updateTask = async (task: Task): Promise<Task> => {
    const res = await this.rootStore.apiClient.post("/tasks.update", {
      id: task.id,
      documentId: task.documentId,
      completed: task.completed,
    });
    
    if (res?.data) {
      this.add(res.data);
      return res.data;
    }
    
    return task;
  };
}
```

### 6. Add Tasks Store to Root Store

**File: `app/stores/index.ts`**

Add the TasksStore to the RootStore:

```typescript
import TasksStore from "./TasksStore";

// In the RootStore class:
tasks: TasksStore;

// In the constructor:
this.tasks = new TasksStore(this);
```

### 7. Add Task Type

**File: `app/types.ts`**

Add a Task type:

```typescript
export type Task = {
  id: string;
  documentId: string;
  text: string;
  completed: boolean;
};
```

### 8. Add Tasks API Endpoint

**File: `server/routes/api/tasks.ts`**

Create a new API endpoint for tasks:

```typescript
import Router from "koa-router";
import { Transaction } from "sequelize";
import { Document, User } from "@server/models";
import auth from "@server/middlewares/authentication";
import { ProsemirrorHelper } from "@shared/utils/ProsemirrorHelper";
import { authorize } from "@server/policies";
import { APIContext } from "@server/types";
import { TasksUpdateSchema, TasksListSchema } from "./schema";

const router = new Router();

router.post("tasks.list", auth(), async (ctx: APIContext) => {
  const { user } = ctx.state;
  const documents = await Document.findAll({
    where: {
      teamId: user.teamId,
    },
  });

  const tasks = [];
  
  for (const document of documents) {
    if (!authorize(user, "read", document)) {
      continue;
    }
    
    const documentTasks = ProsemirrorHelper.getTasks(document.toJSON().state);
    
    for (let i = 0; i < documentTasks.length; i++) {
      tasks.push({
        id: `${i}`,
        documentId: document.id,
        text: documentTasks[i].text,
        completed: documentTasks[i].completed,
      });
    }
  }
  
  ctx.body = {
    data: {
      tasks,
    },
  };
});

router.post("tasks.update", auth(), async (ctx: APIContext) => {
  const { user } = ctx.state;
  const { id, documentId, completed } = TasksUpdateSchema.parse(ctx.request.body);
  
  const document = await Document.findByPk(documentId);
  if (!document || !authorize(user, "update", document)) {
    ctx.throw(403);
  }
  
  // Update the task in the document
  const documentJson = document.toJSON();
  const documentTasks = ProsemirrorHelper.getTasks(documentJson.state);
  const taskIndex = parseInt(id, 10);
  
  if (taskIndex >= 0 && taskIndex < documentTasks.length) {
    documentTasks[taskIndex].completed = completed;
    
    // Update the document with the modified tasks
    // This is a simplified approach - in a real implementation,
    // you would need to update the actual Prosemirror nodes
    await document.update({
      text: document.text, // This would need to be updated based on the new task state
    });
    
    ctx.body = {
      data: {
        id,
        documentId,
        text: documentTasks[taskIndex].text,
        completed,
      },
    };
  } else {
    ctx.throw(404);
  }
});

export default router;
```

### 9. Add Route to App

**File: `app/routes/index.tsx`**

Add the Tasks route to the application:

```typescript
import Tasks from "~/scenes/Tasks";

// In the routes array:
{
  path: "/tasks",
  component: Tasks,
  exact: true,
  authenticated: true,
},
```

## Security Considerations

- Ensure that users can only see tasks from documents they have access to
- Validate task updates to prevent unauthorized modifications
- Implement proper error handling for failed task updates

## Future Enhancements

- Add filtering options (by collection, document, completion status)
- Add sorting options (by document, creation date, etc.)
- Add task assignment functionality
- Add due dates for tasks
- Implement task notifications
