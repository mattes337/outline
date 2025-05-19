# Outline Task Management Implementation Guide (Revised)

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
1. **Database Schema**:**
   - Removed `user_id` from tasks table
   - Added `task_assignees` join table

2. **Mention Parsing Logic:**
   - Parses `@User` mentions in:
     - Task line content
     - Preceding paragraph if no direct mentions
   - Updates assignments automatically on document save

3. **Frontend Display:**
   - Shows all assigned users via `@User` mentions
   - Maintains support for unassigned tasks

4. **API Enhancements:**
   - `/api/tasks/assigned` endpoint for user's tasks
   - Full task details include `assignees` array

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
