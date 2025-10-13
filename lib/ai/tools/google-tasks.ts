import { tool } from "ai";
import { z } from "zod";
import { googleOAuth } from "@/lib/google/auth-oauth";
import {
  formatDateForGoogle,
  formatDateForDisplay,
  validateTask,
  sanitizeText,
  googleRateLimiter,
  withRetry,
  logGoogleOperation,
  handleGoogleApiError
} from "@/lib/google/utils";

// Task interface
interface Task {
  id?: string;
  title: string;
  notes?: string;
  due?: string | Date;
  status?: string;
  completed?: string;
  created?: string;
  updated?: string;
  position?: string;
}

// Create Task Tool
export const createTask = tool({
  description: "Create a new task in Google Tasks with specified details including title, optional notes, and due date.",
  inputSchema: z.object({
    title: z.string().min(1).max(200).describe("Task title (required)"),
    notes: z.string().max(1000).optional().describe("Task notes or description"),
    due: z.string().or(z.date()).optional().describe("Task due date/time (ISO string or Date object)"),
    taskListId: z.string().optional().describe("Task list ID (uses default if not provided)"),
  }),
  execute: async ({ title, notes, due, taskListId }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      // Validate and sanitize input
      const sanitizedTitle = sanitizeText(title);
      const sanitizedNotes = notes ? sanitizeText(notes) : undefined;

      const taskData = {
        title: sanitizedTitle,
        notes: sanitizedNotes,
        due,
      };

      validateTask(taskData);

      const tasks = googleOAuth.getTasksClient();
      const defaultTaskListId = taskListId || googleOAuth.getDefaultTaskListId();

      logGoogleOperation('CREATE', 'Task', {
        title: sanitizedTitle,
        due: due ? formatDateForGoogle(due) : 'Not set',
        taskListId: defaultTaskListId
      });

      const task = {
        title: sanitizedTitle,
        notes: sanitizedNotes,
        ...(due && {
          due: formatDateForGoogle(due)
        }),
      };

      const response = await withRetry(async () => {
        return await tasks.tasks.insert({
          tasklist: defaultTaskListId,
          requestBody: task,
        });
      });

      if (!response.data) {
        throw new Error('No data returned from Google Tasks API');
      }

      const createdTask: Task = {
        id: response.data.id,
        title: response.data.title || '',
        notes: response.data.notes,
        due: response.data.due,
        status: response.data.status,
        completed: response.data.completed,
        created: response.data.created,
        updated: response.data.updated,
        position: response.data.position,
      };

      return {
        success: true,
        message: `✅ Successfully created task: "${sanitizedTitle}"`,
        task: createdTask,
      };

    } catch (error) {
      handleGoogleApiError(error, 'create task');
    }
  },
});

// Read Tasks Tool
export const readTasks = tool({
  description: "Retrieve tasks from Google Tasks. Can get all tasks from a task list, filter by status, or get a specific task by ID.",
  inputSchema: z.object({
    taskListId: z.string().optional().describe("Task list ID (uses default if not provided)"),
    taskId: z.string().optional().describe("Specific task ID to retrieve (if provided, ignores other filters)"),
    maxResults: z.number().min(1).max(100).default(20).describe("Maximum number of tasks to return"),
    showCompleted: z.boolean().default(true).describe("Include completed tasks in results"),
    showHidden: z.boolean().default(false).describe("Include hidden tasks in results"),
    updatedMin: z.string().or(z.date()).optional().describe("Only return tasks updated after this time"),
  }),
  execute: async ({ taskListId, taskId, maxResults = 20, showCompleted = true, showHidden = false, updatedMin }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      const tasks = googleOAuth.getTasksClient();
      const defaultTaskListId = taskListId || googleOAuth.getDefaultTaskListId();

      // If specific task ID is provided, get that task
      if (taskId) {
        logGoogleOperation('READ', 'Task', { taskId, taskListId: defaultTaskListId });

        const response = await withRetry(async () => {
          return await tasks.tasks.get({
            tasklist: defaultTaskListId,
            task: taskId,
          });
        });

        if (!response.data) {
          return {
            success: false,
            message: `Task with ID "${taskId}" not found`,
            tasks: [],
          };
        }

        const task: Task = {
          id: response.data.id,
          title: response.data.title || '',
          notes: response.data.notes,
          due: response.data.due,
          status: response.data.status,
          completed: response.data.completed,
          created: response.data.created,
          updated: response.data.updated,
          position: response.data.position,
        };

        return {
          success: true,
          message: `✅ Found task: "${task.title}"`,
          tasks: [task],
        };
      }

      // Otherwise, list tasks with filters
      logGoogleOperation('LIST', 'Tasks', {
        taskListId: defaultTaskListId,
        maxResults,
        showCompleted,
        showHidden,
        updatedMin: updatedMin ? formatDateForGoogle(updatedMin) : 'Not set'
      });

      const response = await withRetry(async () => {
        return await tasks.tasks.list({
          tasklist: defaultTaskListId,
          maxResults,
          showCompleted,
          showHidden,
          ...(updatedMin && { updatedMin: formatDateForGoogle(updatedMin) }),
        });
      });

      const tasksList: Task[] = (response.data.items || []).map((item: any) => ({
        id: item.id,
        title: item.title || '',
        notes: item.notes,
        due: item.due,
        status: item.status,
        completed: item.completed,
        created: item.created,
        updated: item.updated,
        position: item.position,
      }));

      return {
        success: true,
        message: `✅ Found ${tasksList.length} task${tasksList.length === 1 ? '' : 's'}`,
        tasks: tasksList,
      };

    } catch (error) {
      handleGoogleApiError(error, 'read tasks');
    }
  },
});

// Update Task Tool
export const updateTask = tool({
  description: "Update an existing task with new details. Requires the task ID and at least one field to update.",
  inputSchema: z.object({
    taskId: z.string().min(1).describe("ID of the task to update (required)"),
    taskListId: z.string().optional().describe("Task list ID (uses default if not provided)"),
    title: z.string().min(1).max(200).optional().describe("New task title"),
    notes: z.string().max(1000).optional().describe("New task notes or description"),
    due: z.string().or(z.date()).optional().describe("New task due date/time"),
    status: z.enum(['needsAction', 'completed']).optional().describe("New task status"),
  }),
  execute: async ({ taskId, taskListId, title, notes, due, status }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      if (!taskId) {
        throw new Error('Task ID is required');
      }

      // Check if at least one field is provided for update
      if (!title && !notes && !due && !status) {
        throw new Error('At least one field must be provided for update');
      }

      // Sanitize inputs
      const sanitizedTitle = title ? sanitizeText(title) : undefined;
      const sanitizedNotes = notes ? sanitizeText(notes) : undefined;

      const tasks = googleOAuth.getTasksClient();
      const defaultTaskListId = taskListId || googleOAuth.getDefaultTaskListId();

      // Build the updated task object
      const updatedTask: any = {};

      if (sanitizedTitle) updatedTask.title = sanitizedTitle;
      if (sanitizedNotes !== undefined) updatedTask.notes = sanitizedNotes;
      if (due) updatedTask.due = formatDateForGoogle(due);
      if (status) updatedTask.status = status;

      logGoogleOperation('UPDATE', 'Task', {
        taskId,
        taskListId: defaultTaskListId,
        updates: Object.keys(updatedTask)
      });

      const response = await withRetry(async () => {
        return await tasks.tasks.update({
          tasklist: defaultTaskListId,
          task: taskId,
          requestBody: updatedTask,
        });
      });

      if (!response.data) {
        throw new Error('No data returned from Google Tasks API');
      }

      const updatedTaskData: Task = {
        id: response.data.id,
        title: response.data.title || '',
        notes: response.data.notes,
        due: response.data.due,
        status: response.data.status,
        completed: response.data.completed,
        created: response.data.created,
        updated: response.data.updated,
        position: response.data.position,
      };

      return {
        success: true,
        message: `✅ Successfully updated task: "${updatedTaskData.title}"`,
        task: updatedTaskData,
      };

    } catch (error) {
      handleGoogleApiError(error, 'update task');
    }
  },
});

// Delete Task Tool
export const deleteTask = tool({
  description: "Delete a task by its ID. This action cannot be undone.",
  inputSchema: z.object({
    taskId: z.string().min(1).describe("ID of the task to delete (required)"),
    taskListId: z.string().optional().describe("Task list ID (uses default if not provided)"),
  }),
  execute: async ({ taskId, taskListId }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      if (!taskId) {
        throw new Error('Task ID is required');
      }

      const tasks = googleOAuth.getTasksClient();
      const defaultTaskListId = taskListId || googleOAuth.getDefaultTaskListId();

      logGoogleOperation('DELETE', 'Task', { taskId, taskListId: defaultTaskListId });

      await withRetry(async () => {
        await tasks.tasks.delete({
          tasklist: defaultTaskListId,
          task: taskId,
        });
      });

      return {
        success: true,
        message: `✅ Successfully deleted task with ID: "${taskId}"`,
      };

    } catch (error) {
      handleGoogleApiError(error, 'delete task');
    }
  },
});

// Mark Task Complete Tool
export const markTaskComplete = tool({
  description: "Mark a task as completed with current timestamp.",
  inputSchema: z.object({
    taskId: z.string().min(1).describe("ID of the task to mark complete (required)"),
    taskListId: z.string().optional().describe("Task list ID (uses default if not provided)"),
  }),
  execute: async ({ taskId, taskListId }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      if (!taskId) {
        throw new Error('Task ID is required');
      }

      const tasks = googleOAuth.getTasksClient();
      const defaultTaskListId = taskListId || googleOAuth.getDefaultTaskListId();

      logGoogleOperation('COMPLETE', 'Task', { taskId, taskListId: defaultTaskListId });

      const response = await withRetry(async () => {
        return await tasks.tasks.update({
          tasklist: defaultTaskListId,
          task: taskId,
          requestBody: {
            status: 'completed',
            completed: new Date().toISOString(),
          },
        });
      });

      if (!response.data) {
        throw new Error('No data returned from Google Tasks API');
      }

      const completedTask: Task = {
        id: response.data.id,
        title: response.data.title || '',
        notes: response.data.notes,
        due: response.data.due,
        status: response.data.status,
        completed: response.data.completed,
        created: response.data.created,
        updated: response.data.updated,
        position: response.data.position,
      };

      return {
        success: true,
        message: `✅ Successfully marked task as completed: "${completedTask.title}"`,
        task: completedTask,
      };

    } catch (error) {
      handleGoogleApiError(error, 'mark task complete');
    }
  },
});