# Outline Task Management Implementation Guide (Revised)

## Scope
This document describes the implementation of a robust task management system for Outline, supporting multi-user assignment, mention-based parsing, and a modern frontend with three main task views: User Tasks, Unassigned Tasks, and Completed Tasks. The system ensures tasks can be assigned via mentions, supports tasks without assignees, and provides traceability for debugging.

## Summary
- Tasks can be assigned to multiple users using @mentions in documents (Outline mention logic).
- Tasks without direct mentions check the preceding paragraph for assignees.
- Tasks can exist without any assignee.
- The frontend provides three tabs: User Tasks, Unassigned Tasks, Completed Tasks.
- All backend and parsing logic includes trace logging for easy debugging.

---

## Step 1: Database Schema Adjustments
### 1.1 Update Migration File
```bash
npx sequelize migration:generate --name add-task-assignees
```

### 1.2 Revised Schema
```typescript
module.exports = {
  up: async ({ context }) => {
    // Remove old user_id column
    await context.query('ALTER TABLE tasks DROP COLUMN user_id;');

    // Create many-to-many join table
    await context.query(`
      CREATE TABLE task_assignees (
        task_id INT REFERENCES tasks(id),
        user_id INT REFERENCES users(id),
        PRIMARY KEY (task_id, user_id)
      );
    `);
  },
  down: async ({ context }) => {
    await context.query('DROP TABLE task_assignees;');
    await context.query('ALTER TABLE tasks ADD COLUMN user_id INT REFERENCES users(id) NOT NULL;');
  }
};
```

---

## Step 2: Task Model Enhancements
### 2.3 Add Associations
```typescript
// server/models/Task.ts
Task.belongsToMany(User, {
  through: 'task_assignees',
  foreignKey: 'task_id',
  otherKey: 'user_id'
});
```

---

## Step 3: Mention Parsing Service
### 3.3 New Service File
```typescript
// server/services/taskParser.ts
import { Document } from '../models';

export async function parseDocumentMentions(documentContent: string, documentId: number) {
  const tasks = extractTasksFromContent(documentContent);
  
  for (const task of tasks) {
    const mentions = extractMentionsFromContent(task.content);
    const precedingParagraphMentions = extractMentionsFromContent(getPrecedingParagraph(task));

    const userIdsMentions = [...mentions, ...precedingParagraphMentions].map(getUserIdFromMention);

    await Task.updateAssignees(task.id, userIdsMentions);
  }
}
```

---

## Step 4: API Enhancements
### 4.2 Update Endpoints
```typescript
// server/routes/api/tasks/index.ts
router.get('/assigned', async (ctx) => {
  const assignedTasks = await Task.findAll({
    include: [{
      model: User,
      through: { attributes: [] }
    },
    where: {
      '$task_assignees.user_id$': ctx.state.user.id
    }
  });
  ctx.body = assignedTasks;
});
```

---

## Step 5: Frontend Enhancements
### 5.2 Display Assignees
```typescript
// app/components/TaskList/TaskList.tsx
{task.assignees.map(user => (
  <span key={user.id} className="assignee">@{user.username}</span>
)}
```

---

## Step 6: Document Save Hook
### 6.1 Add Save Listener
```typescript
// server/models/Document.ts
Document.afterUpdate(async (document) => {
  await parseDocumentMentions(document.content, document.id);
});
```

---

## Step 7: Security Enhancements
### 7.1 Input Sanitization
```typescript
// server/validators/taskValidator.ts
function validateMentions(mentions: string[]) {
  return mentions.filter(m => User.exists(m));
    .replace('@', '')
    .trim()
  ));
}
```

---

## Step 8: New Testing Steps
### 8.1 Mention Parsing Test
```bash
# Test mention parsing
yarn test server/services/taskParser.spec.ts
```

---

## Step 9: Task Management Page (Three Tabs)

### 9.1 Overview
Implement a task management page with three tabs:
- **User Tasks**: Tasks assigned to the current user.
- **Unassigned Tasks**: Tasks with no assignees.
- **Completed Tasks**: Tasks marked as completed, assigned to the current user or unassigned.

### 9.2 Table Columns
Each tab displays a table with the following columns:
- **Assignees**: All assigned users, shown as mentions (using Outline's mention logic).
- **Summary**: Task summary or title.
- **Document**: Link to the document containing the task.
- **Completion State**: Checkbox or indicator for completion.

### 9.3 Tab Logic
- **User Tasks Tab**:  
  - Shows all tasks where the current user is an assignee.
  - Each task row displays all assignees as mentions.

- **Unassigned Tasks Tab**:  
  - Shows all tasks with no assignees.
  - Each task row includes a pill-like user selector to assign one or more users.
  - On assignment, updates the backend and refreshes the table.

- **Completed Tasks Tab**:  
  - Shows all tasks marked as completed, where the current user is an assignee or the task is unassigned.

### 9.4 Mention Logic (Assignment)
- When parsing tasks from documents, use Outline's mention logic to extract assignees:
  - If a task line contains mentions, assign those users.
  - If not, check the preceding paragraph for mentions.
  - If no mentions are found, the task remains unassigned.
- When users are assigned via the UI, use the same mention logic to display and update assignees.

### 9.5 API Enhancements
- **GET `/api/tasks/assigned`**: Returns tasks assigned to the current user.
- **GET `/api/tasks/unassigned`**: Returns tasks with no assignees.
- **GET `/api/tasks/completed`**: Returns completed tasks assigned to the current user or unassigned.
- **POST `/api/tasks/:id/assignees`**: Updates the assignees for a task. Accepts an array of user IDs.

### 9.6 Trace Logging
- Add trace logging to all backend endpoints and mention parsing logic for debugging and traceability.

### 9.7 Example Frontend Usage
```tsx
// app/components/TaskTable/TaskTable.tsx
<Table>
  <thead>
    <tr>
      <th>Assignees</th>
      <th>Summary</th>
      <th>Document</th>
      <th>Completed</th>
    </tr>
  </thead>
  <tbody>
    {tasks.map(task => (
      <tr key={task.id}>
        <td>
          {task.assignees.map(user => (
            <Mention key={user.id} user={user} />
          ))}
          {isUnassignedTab && (
            <UserPillSelector
              onAssign={userIds => assignUsersToTask(task.id, userIds)}
            />
          )}
        </td>
        <td>{task.summary}</td>
        <td>
          <a href={`/doc/${task.documentId}`}>View Document</a>
        </td>
        <td>
          <Checkbox checked={task.completed} />
        </td>
      </tr>
    ))}
  </tbody>
</Table>
```

---

## Appendix: Task Management Page Logic

| Tab              | Filter Logic                                              | Assignment UI         |
|------------------|----------------------------------------------------------|----------------------|
| User Tasks       | Assignees include current user                           | No                   |
| Unassigned Tasks | No assignees                                             | Pill selector        |
| Completed Tasks  | Completed, and (assigned to user OR unassigned)          | No                   |

---

## Appendix: Key Updates
| Component       | Changes Made                                  |
|----------------|---------------------------------------------|
| Database       | Added task_assignees join table            |
| Models         | Many-to many user relationship               |
| Services       | Automatic mention parsing on document save  |
| Frontend       | Display multiple assignees in task list      |
| Security       | Mention validation middleware                |

---

## Critical Changes Summary
1. **Database Schema**:
   - Removed `user_id` from tasks table
   - Added `task_assignees` join table
2. **Mention Parsing Logic:**
   - Parses `@User` mentions in:
     - Task line content
     - Preceding paragraph if no direct mentions
   - Updates assignments automatically on document save
   - Reuses mention logic for both parsing and UI assignment
3. **Frontend Display:**
   - Shows all assigned users via `@User` mentions
   - Maintains support for unassigned tasks
   - Three-tab view: User Tasks, Unassigned Tasks, Completed Tasks
   - Pill selector for assigning users in Unassigned tab
4. **API Enhancements:**
   - `/api/tasks/assigned` endpoint for user's tasks
   - `/api/tasks/unassigned` for unassigned tasks
   - `/api/tasks/completed` for completed tasks
   - `/api/tasks/:id/assignees` for updating assignees
   - Full task details include `assignees` array
5. **Trace Logging:**
   - All backend endpoints and mention parsing include trace logging for debugging

---

## Compatibility Notes
- Maintains backward compatibility with existing tasks
- Existing `user_id` data should be migrated to new format
- Gracefully handles tasks without any assignees

---

## Future Enhancements
1. Add UI for manual assignment override
2. Mention autocomplete in task creation
3. Assignment notifications system
4. Task assignment history tracking
```

This implementation maintains architectural consistency while adding:
- Many-to-many user assignment
- Automatic mention parsing
- Paragraph fallback logic
- Security validations
- Full API coverage
- Frontend display enhancements
