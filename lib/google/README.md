# Google Calendar & Tasks Integration

This integration provides native AI tools for seamless interaction with Google Calendar and Google Tasks, enabling your AI agent to create, read, update, and delete calendar events and tasks.

## 🚀 Features

### Google Calendar Tools
- **Create Events**: Schedule new calendar events with title, description, attendees, and location
- **Read Events**: Retrieve events by date range, search query, or specific event ID
- **Update Events**: Modify existing events with new details
- **Delete Events**: Remove events from calendar

### Google Tasks Tools
- **Create Tasks**: Add new tasks with title, notes, and due dates
- **Read Tasks**: Retrieve tasks with filtering options
- **Update Tasks**: Modify task details and status
- **Delete Tasks**: Remove tasks from task lists
- **Mark Complete**: Mark tasks as completed with timestamp

## 📋 Prerequisites

1. **Google Cloud Project** with Calendar API and Tasks API enabled
2. **Service Account** with domain-wide delegation (if using Google Workspace)
3. **Environment Variables** configured in `.env.local`

## 🔧 Setup Instructions

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Enable required APIs:
   - Google Calendar API
   - Google Tasks API
4. Create a Service Account:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Configure with appropriate name and description
   - Create and download the JSON key file

### 2. Environment Variables

Add the following variables to your `.env.local` file:

```env
# Google Service Account Credentials
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----\n
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_CLIENT_ID=your-client-id

# Calendar and Tasks Configuration
GOOGLE_CALENDAR_ID=primary
GOOGLE_TASKS_LIST_ID=@default
```

### 3. Domain-Wide Delegation (Optional)

If using Google Workspace domain:

1. Go to "Security" > "API controls" in Google Admin Console
2. Add the service account email as a domain-wide delegate
3. Grant the following scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/tasks`

## 📖 Usage Examples

### Calendar Operations

```typescript
// Create a calendar event
const { createCalendarEvent } = await import('./lib/ai/tools/google-calendar');
const result = await createCalendarEvent({
  summary: "Team Meeting",
  description: "Weekly team sync meeting",
  start: "2024-01-15T10:00:00Z",
  end: "2024-01-15T11:00:00Z",
  attendees: ["colleague@company.com"],
  location: "Conference Room A"
});

// Read calendar events
const { readCalendarEvents } = await import('./lib/ai/tools/google-calendar');
const events = await readCalendarEvents({
  startDate: "2024-01-15",
  maxResults: 10,
  searchQuery: "meeting"
});

// Update an event
const { updateCalendarEvent } = await import('./lib/ai/tools/google-calendar');
const updated = await updateCalendarEvent({
  eventId: "event-id-here",
  summary: "Updated Meeting Title",
  location: "Conference Room B"
});

// Delete an event
const { deleteCalendarEvent } = await import('./lib/ai/tools/google-calendar');
await deleteCalendarEvent({
  eventId: "event-id-here"
});
```

### Task Operations

```typescript
// Create a task
const { createTask } = await import('./lib/ai/tools/google-tasks');
const result = await createTask({
  title: "Complete project proposal",
  notes: "Draft and finalize the Q1 project proposal",
  due: "2024-01-20T17:00:00Z"
});

// Read tasks
const { readTasks } = await import('./lib/ai/tools/google-tasks');
const tasks = await readTasks({
  maxResults: 20,
  showCompleted: false
});

// Mark task as complete
const { markTaskComplete } = await import('./lib/ai/tools/google-tasks');
await markTaskComplete({
  taskId: "task-id-here"
});

// Update a task
const { updateTask } = await import('./lib/ai/tools/google-tasks');
await updateTask({
  taskId: "task-id-here",
  title: "Updated task title",
  status: "completed"
});

// Delete a task
const { deleteTask } = await import('./lib/ai/tools/google-tasks');
await deleteTask({
  taskId: "task-id-here"
});
```

## 🛠️ Testing

Run the integration test to verify everything is working:

```bash
# Set up environment variables first
cp .env.example .env.local
# Edit .env.local with your actual credentials

# Run the test
npx tsx lib/google/test-integration.ts
```

## 🔒 Security Features

- **Input Sanitization**: All text inputs are sanitized to prevent injection attacks
- **Rate Limiting**: Built-in rate limiting to respect Google API quotas (100 requests/minute)
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Logging**: Detailed logging for debugging and monitoring
- **Validation**: Input validation for dates, emails, and required fields

## 📊 Rate Limits & Quotas

- **Calendar API**: 1,000,000 requests per day
- **Tasks API**: 1,000,000 requests per day
- **Rate Limiting**: 100 requests per minute (configurable)

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify service account credentials in `.env.local`
   - Ensure the service account key is correctly formatted
   - Check that the Google Cloud Project has required APIs enabled

2. **Permission Denied**
   - Verify service account has proper permissions
   - Check domain-wide delegation setup for Google Workspace
   - Ensure calendar/task list IDs are correct

3. **Rate Limit Exceeded**
   - The integration includes automatic rate limiting
   - If you hit rate limits frequently, consider implementing exponential backoff

4. **Invalid Date Formats**
   - Use ISO 8601 format: `2024-01-15T10:00:00Z`
   - All dates are converted to UTC automatically

### Debug Mode

Enable detailed logging by setting:

```env
DEBUG=google:*
```

## 📁 File Structure

```
lib/google/
├── auth.ts              # Authentication and client setup
├── utils.ts             # Utility functions and helpers
├── test-integration.ts  # Integration test script
└── README.md           # This documentation

lib/ai/tools/
├── google-calendar.ts   # Calendar AI tools
└── google-tasks.ts     # Tasks AI tools
```

## 🔄 Integration with AI Agent

The Google Calendar and Tasks tools are designed to work seamlessly with your existing AI agent system. They follow the same patterns as your `query-clients` tool and integrate with Vercel's AI SDK.

### Available Tools

- `createCalendarEvent` - Create new calendar events
- `readCalendarEvents` - Retrieve calendar events
- `updateCalendarEvent` - Update existing events
- `deleteCalendarEvent` - Delete events
- `createTask` - Create new tasks
- `readTasks` - Retrieve tasks
- `updateTask` - Update existing tasks
- `deleteTask` - Delete tasks
- `markTaskComplete` - Mark tasks as completed

## 🎯 Best Practices

1. **Error Handling**: Always check the `success` field in tool responses
2. **Input Validation**: Validate user inputs before calling tools
3. **Rate Limiting**: The tools include built-in rate limiting, but be mindful of usage
4. **Logging**: Monitor the logs for API usage and errors
5. **Testing**: Run integration tests regularly to ensure everything works

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the Google Cloud Console logs
3. Verify your credentials and permissions
4. Run the integration test script

---

**Note**: This integration uses service account authentication for system-wide access. Make sure your service account has the minimum required permissions to maintain security.