# Task API Documentation

This document details the API endpoints for managing tasks within Outline.

## Base URL

All API endpoints are prefixed with `/api`.

## Authentication

All task-related endpoints require authentication via a valid JWT token passed in the request (typically as a POST body parameter `token` or via an `Authorization: Bearer <token>` header, depending on server setup). Standard Outline policies apply.

---

### 1. List My Open Tasks

*   **Endpoint:** `GET /tasks.my` (or `POST /api/tasks.my` if using POST for all API calls)
*   **Description:** Fetches all open (uncompleted) tasks assigned to the currently authenticated user.
*   **Permissions:** Authenticated user.
*   **URL Parameters:** None.
*   **Request Body Parameters:**
    *   `token` (string, required): Authentication token.
    *   Pagination parameters (optional, e.g., `offset`, `limit`).
*   **Example Request (using POST):**
    ```json
    {
      "token": "your_jwt_token"
    }
    ```
*   **Example Successful Response (200 OK):**
    ```json
    {
      "data": [
        {
          "id": "task-uuid-1",
          "guid": "task-guid-abc",
          "title": "My first open task",
          "body": "Detailed description of the task.",
          "status": "open",
          "priority": 0,
          "createdAt": "2023-01-15T10:00:00.000Z",
          "updatedAt": "2023-01-15T10:00:00.000Z",
          "document": {
            "id": "doc-uuid-1",
            "title": "Source Document Title",
            "urlId": "doc-urlid-xyz",
            "path": "/doc/source-document-title-doc-urlid-xyz" 
          },
          "assignee": {
            "id": "user-uuid-self",
            "name": "Current User",
            "avatarUrl": "/avatar.png"
          },
          "comments": []
        }
      ],
      "pagination": { "offset": 0, "limit": 25, "total": 1 }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: If the token is invalid or missing.

---

### 2. List All Open Tasks

*   **Endpoint:** `GET /tasks.open` (or `POST /api/tasks.open`)
*   **Description:** Fetches all open tasks for the user's team.
*   **Permissions:** Authenticated user.
*   **URL Parameters:** None.
*   **Request Body Parameters:**
    *   `token` (string, required): Authentication token.
    *   Pagination parameters (optional).
*   **Example Successful Response (200 OK):** Similar structure to `/tasks.my`, but includes tasks assigned to anyone in the team or unassigned.

---

### 3. List Done Tasks

*   **Endpoint:** `GET /tasks.done` (or `POST /api/tasks.done`)
*   **Description:** Fetches all completed tasks for the user's team.
*   **Permissions:** Authenticated user.
*   **URL Parameters:** None.
*   **Request Body Parameters:**
    *   `token` (string, required): Authentication token.
    *   Pagination parameters (optional).
*   **Example Successful Response (200 OK):** Similar structure to `/tasks.my`, showing completed tasks.

---

### 4. Get Task Information

*   **Endpoint:** `GET /tasks.info` (or `POST /api/tasks.info`)
*   **Description:** Fetches details for a specific task by its GUID.
*   **Permissions:** Authenticated user with access to the task's parent document.
*   **URL Parameters (if using GET):** `guid=<task-guid>`
*   **Request Body Parameters (if using POST):**
    *   `token` (string, required): Authentication token.
    *   `guid` (string, required): The GUID of the task.
*   **Example Request (using POST):**
    ```json
    {
      "token": "your_jwt_token",
      "guid": "task-guid-abc"
    }
    ```
*   **Example Successful Response (200 OK):**
    ```json
    {
      "data": {
        "id": "task-uuid-1",
        "guid": "task-guid-abc",
        "title": "Task Title",
        "body": "Markdown content of the task description.",
        "status": "open",
        "priority": 0,
        "createdAt": "2023-01-15T10:00:00.000Z",
        "updatedAt": "2023-01-15T10:00:00.000Z",
        "document": {
          "id": "doc-uuid-1",
          "title": "Source Document",
          "urlId": "doc-urlid-xyz",
          "path": "/doc/source-document-doc-urlid-xyz"
        },
        "assignee": {
          "id": "user-uuid-assignee",
          "name": "Assignee Name",
          "avatarUrl": "/avatar.png"
        },
        "comments": [
          {
            "id": "comment-uuid-1",
            "content": "First comment on the task.",
            "createdAt": "2023-01-16T10:00:00.000Z",
            "updatedAt": "2023-01-16T10:00:00.000Z",
            "author": {
              "id": "user-uuid-commenter",
              "name": "Commenter Name",
              "avatarUrl": "/avatar.png"
            }
          }
        ]
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`: Invalid/missing token.
    *   `403 Forbidden`: User does not have access to the task's document.
    *   `404 Not Found`: Task with the given GUID not found.
    *   `400 Bad Request`: Invalid GUID format.

---

### 5. Update Task

*   **Endpoint:** `PUT /tasks.update` (or `POST /api/tasks.update`)
*   **Description:** Updates properties of a specific task.
*   **Permissions:** Authenticated user who is an admin, the task assignee, or has edit rights on the parent document.
*   **URL Parameters (if using PUT):** `guid=<task-guid>`
*   **Request Body Parameters (if using POST):**
    *   `token` (string, required): Authentication token.
    *   `guid` (string, required): The GUID of the task to update.
    *   `title` (string, optional): New title for the task.
    *   `body` (string, optional): New Markdown body for the task.
    *   `status` (string, optional): New status, either "open" or "completed".
    *   `priority` (integer, optional): New priority (integer, lower is higher).
    *   `userId` (string/uuid, optional): New assignee's user ID. Pass `null` to unassign.
*   **Example Request (using POST):**
    ```json
    {
      "token": "your_jwt_token",
      "guid": "task-guid-abc",
      "title": "Updated Task Title",
      "status": "completed"
    }
    ```
*   **Example Successful Response (200 OK):** Returns the updated task object (similar to `/tasks.info` response).
*   **Error Responses:**
    *   `401 Unauthorized`
    *   `403 Forbidden`
    *   `404 Not Found`
    *   `400 Bad Request`: Invalid parameters (e.g., invalid status value, non-integer priority).

---

### 6. Create Task Comment

*   **Endpoint:** `POST /tasks.createComment` (or `POST /api/tasks.createComment`)
*   **Description:** Adds a comment to a specific task.
*   **Permissions:** Authenticated user with access to the task.
*   **URL Parameters (if using POST with query params):** `guid=<task-guid>`
*   **Request Body Parameters:**
    *   `token` (string, required): Authentication token.
    *   `guid` (string, required): The GUID of the task to comment on.
    *   `content` (string, required): The content of the comment.
*   **Example Request (using POST):**
    ```json
    {
      "token": "your_jwt_token",
      "guid": "task-guid-abc",
      "content": "This is my insightful comment."
    }
    ```
*   **Example Successful Response (200 OK):** Returns the newly created comment object.
    ```json
    {
      "data": {
        "id": "comment-uuid-new",
        "content": "This is my insightful comment.",
        "createdAt": "2023-01-17T10:00:00.000Z",
        "updatedAt": "2023-01-17T10:00:00.000Z",
        "author": {
          "id": "user-uuid-self",
          "name": "Current User",
          "avatarUrl": "/avatar.png"
        }
      }
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`
    *   `403 Forbidden`
    *   `404 Not Found`: Task not found.
    *   `400 Bad Request`: Missing content.

---

### 7. Reorder Tasks

*   **Endpoint:** `PUT /tasks.reorder` (or `POST /api/tasks.reorder`)
*   **Description:** Updates the priority of multiple tasks based on their new order.
*   **Permissions:** Authenticated user.
*   **Request Body Parameters:**
    *   `token` (string, required): Authentication token.
    *   `orderedGuids` (array of strings, required): An array of task GUIDs in their new desired order. The index in the array determines the new priority.
*   **Example Request (using POST):**
    ```json
    {
      "token": "your_jwt_token",
      "orderedGuids": ["task-guid-xyz", "task-guid-abc", "task-guid-def"]
    }
    ```
*   **Example Successful Response (200 OK):**
    ```json
    {
      "success": true
    }
    ```
*   **Error Responses:**
    *   `401 Unauthorized`
    *   `400 Bad Request`: If `orderedGuids` is missing, not an array, or contains invalid GUIDs. Or if any task belongs to a different team.
    *   `404 Not Found`: If one or more task GUIDs in the list do not correspond to existing tasks.

---

## Data Models (Brief Overview)

### Task Object (as returned by API)

```json
{
  "id": "string (uuid)",
  "guid": "string (uuid, client-generated)",
  "title": "string",
  "body": "string (Markdown, optional)",
  "status": "string ('open' or 'completed')",
  "priority": "integer",
  "createdAt": "ISO8601 DateTime string",
  "updatedAt": "ISO8601 DateTime string",
  "document": { // Simplified document object
    "id": "string (uuid)",
    "title": "string",
    "urlId": "string",
    "path": "string (frontend path)"
  },
  "assignee": { // Simplified user object, null if unassigned
    "id": "string (uuid)",
    "name": "string",
    "avatarUrl": "string (URL)"
  },
  "comments": [ /* Array of TaskComment objects */ ]
}
```

### TaskComment Object

```json
{
  "id": "string (uuid)",
  "content": "string",
  "createdAt": "ISO8601 DateTime string",
  "updatedAt": "ISO8601 DateTime string",
  "author": { // Simplified user object
    "id": "string (uuid)",
    "name": "string",
    "avatarUrl": "string (URL)"
  }
}
```
