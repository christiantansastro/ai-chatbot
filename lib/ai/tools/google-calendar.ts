import { tool } from "ai";
import { z } from "zod";
import { googleOAuth } from "@/lib/google/auth-oauth";
import {
  formatDateForGoogle,
  formatDateForDisplay,
  validateCalendarEvent,
  sanitizeText,
  googleRateLimiter,
  withRetry,
  logGoogleOperation,
  handleGoogleApiError
} from "@/lib/google/utils";

// Calendar event interface
interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: string | Date;
  end: string | Date;
  attendees?: string[];
  location?: string;
  status?: string;
  created?: string;
  updated?: string;
}

// Create Calendar Event Tool
export const createCalendarEvent = tool({
  description: "Create a new event in Google Calendar with specified details including title, description, start/end times, and optional attendees.",
  inputSchema: z.object({
    summary: z.string().min(1).max(200).describe("Event title/summary (required)"),
    description: z.string().max(1000).optional().describe("Event description or notes"),
    start: z.string().or(z.date()).describe("Event start date/time (ISO string or Date object)"),
    end: z.string().or(z.date()).describe("Event end date/time (ISO string or Date object)"),
    attendees: z.array(z.string().email()).optional().describe("Array of attendee email addresses"),
    location: z.string().max(500).optional().describe("Event location"),
  }),
  execute: async ({ summary, description, start, end, attendees, location }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      // Validate and sanitize input
      const sanitizedSummary = sanitizeText(summary);
      const sanitizedDescription = description ? sanitizeText(description) : undefined;
      const sanitizedLocation = location ? sanitizeText(location) : undefined;

      const eventData = {
        summary: sanitizedSummary,
        description: sanitizedDescription,
        start,
        end,
        attendees: attendees || [],
        location: sanitizedLocation,
      };

      validateCalendarEvent(eventData);

      const calendar = googleOAuth.getCalendarClient();
      const calendarId = googleOAuth.getDefaultCalendarId();

      logGoogleOperation('CREATE', 'Calendar Event', {
        summary: sanitizedSummary,
        start: formatDateForGoogle(start),
        end: formatDateForGoogle(end),
        attendees: attendees?.length || 0
      });

      const calendarEvent = {
        summary: sanitizedSummary,
        description: sanitizedDescription,
        start: {
          dateTime: formatDateForGoogle(start),
          timeZone: 'UTC',
        },
        end: {
          dateTime: formatDateForGoogle(end),
          timeZone: 'UTC',
        },
        ...(sanitizedLocation && { location: sanitizedLocation }),
        ...(attendees && attendees.length > 0 && {
          attendees: attendees.map(email => ({ email }))
        }),
      };

      const response = await withRetry(async () => {
        return await calendar.events.insert({
          calendarId,
          requestBody: calendarEvent,
        });
      });

      if (!response.data) {
        throw new Error('No data returned from Google Calendar API');
      }

      const createdEvent: CalendarEvent = {
        id: response.data.id,
        summary: response.data.summary || '',
        description: response.data.description,
        start: response.data.start?.dateTime || response.data.start?.date || '',
        end: response.data.end?.dateTime || response.data.end?.date || '',
        attendees: response.data.attendees?.map((a: any) => a.email || '') || [],
        location: response.data.location,
        status: response.data.status,
        created: response.data.created,
        updated: response.data.updated,
      };

      return {
        success: true,
        message: `✅ Successfully created calendar event: "${sanitizedSummary}"`,
        event: createdEvent,
      };

    } catch (error) {
      handleGoogleApiError(error, 'create calendar event');
    }
  },
});

// Read Calendar Events Tool
export const readCalendarEvents = tool({
  description: "Retrieve calendar events from Google Calendar within a specified date range or get a specific event by ID.",
  inputSchema: z.object({
    startDate: z.string().or(z.date()).optional().describe("Start date for event search (defaults to today)"),
    endDate: z.string().or(z.date()).optional().describe("End date for event search (defaults to 30 days from start)"),
    eventId: z.string().optional().describe("Specific event ID to retrieve (if provided, ignores date range)"),
    maxResults: z.number().min(1).max(100).default(10).describe("Maximum number of events to return"),
    searchQuery: z.string().optional().describe("Search query to filter events by title or description"),
  }),
  execute: async ({ startDate, endDate, eventId, maxResults = 10, searchQuery }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      const calendar = googleOAuth.getCalendarClient();
      const calendarId = googleOAuth.getDefaultCalendarId();

      // If specific event ID is provided, get that event
      if (eventId) {
        logGoogleOperation('READ', 'Calendar Event', { eventId });

        const response = await withRetry(async () => {
          return await calendar.events.get({
            calendarId,
            eventId,
          });
        });

        if (!response.data) {
          return {
            success: false,
            message: `Event with ID "${eventId}" not found`,
            events: [],
          };
        }

        const event: CalendarEvent = {
          id: response.data.id,
          summary: response.data.summary || '',
          description: response.data.description,
          start: response.data.start?.dateTime || response.data.start?.date || '',
          end: response.data.end?.dateTime || response.data.end?.date || '',
          attendees: response.data.attendees?.map((a: any) => a.email || '') || [],
          location: response.data.location,
          status: response.data.status,
          created: response.data.created,
          updated: response.data.updated,
        };

        return {
          success: true,
          message: `✅ Found event: "${event.summary}"`,
          events: [event],
        };
      }

      // Otherwise, list events in date range
      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(start.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days later

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid start or end date');
      }

      logGoogleOperation('LIST', 'Calendar Events', {
        startDate: formatDateForGoogle(start),
        endDate: formatDateForGoogle(end),
        maxResults,
        searchQuery
      });

      const response = await withRetry(async () => {
        return await calendar.events.list({
          calendarId,
          timeMin: formatDateForGoogle(start),
          timeMax: formatDateForGoogle(end),
          maxResults,
          singleEvents: true,
          orderBy: 'startTime',
          q: searchQuery,
        });
      });

      const events: CalendarEvent[] = (response.data.items || []).map((item: any) => ({
        id: item.id,
        summary: item.summary || '',
        description: item.description,
        start: item.start?.dateTime || item.start?.date || '',
        end: item.end?.dateTime || item.end?.date || '',
        attendees: item.attendees?.map((a: any) => a.email || '') || [],
        location: item.location,
        status: item.status,
        created: item.created,
        updated: item.updated,
      }));

      return {
        success: true,
        message: `✅ Found ${events.length} calendar event${events.length === 1 ? '' : 's'}`,
        events,
      };

    } catch (error) {
      handleGoogleApiError(error, 'read calendar events');
    }
  },
});

// Update Calendar Event Tool
export const updateCalendarEvent = tool({
  description: "Update an existing calendar event with new details. Requires the event ID and at least one field to update.",
  inputSchema: z.object({
    eventId: z.string().min(1).describe("ID of the event to update (required)"),
    summary: z.string().min(1).max(200).optional().describe("New event title/summary"),
    description: z.string().max(1000).optional().describe("New event description or notes"),
    start: z.string().or(z.date()).optional().describe("New event start date/time"),
    end: z.string().or(z.date()).optional().describe("New event end date/time"),
    attendees: z.array(z.string().email()).optional().describe("New array of attendee email addresses"),
    location: z.string().max(500).optional().describe("New event location"),
  }),
  execute: async ({ eventId, summary, description, start, end, attendees, location }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      if (!eventId) {
        throw new Error('Event ID is required');
      }

      // Check if at least one field is provided for update
      if (!summary && !description && !start && !end && !attendees && !location) {
        throw new Error('At least one field must be provided for update');
      }

      // Sanitize inputs
      const sanitizedSummary = summary ? sanitizeText(summary) : undefined;
      const sanitizedDescription = description ? sanitizeText(description) : undefined;
      const sanitizedLocation = location ? sanitizeText(location) : undefined;

      const calendar = googleOAuth.getCalendarClient();
      const calendarId = googleOAuth.getDefaultCalendarId();

      // First, get the existing event to preserve unchanged fields
      const getResponse = await withRetry(async () => {
        return await calendar.events.get({
          calendarId,
          eventId,
        });
      });

      if (!getResponse.data) {
        throw new Error(`Event with ID "${eventId}" not found`);
      }

      // Build the updated event object
      const updatedEvent: any = {};

      if (sanitizedSummary) updatedEvent.summary = sanitizedSummary;
      if (sanitizedDescription !== undefined) updatedEvent.description = sanitizedDescription;
      if (sanitizedLocation !== undefined) updatedEvent.location = sanitizedLocation;

      if (start) {
        updatedEvent.start = {
          dateTime: formatDateForGoogle(start),
          timeZone: 'UTC',
        };
      }

      if (end) {
        updatedEvent.end = {
          dateTime: formatDateForGoogle(end),
          timeZone: 'UTC',
        };
      }

      if (attendees) {
        updatedEvent.attendees = attendees.map(email => ({ email }));
      }

      logGoogleOperation('UPDATE', 'Calendar Event', {
        eventId,
        updates: Object.keys(updatedEvent)
      });

      const response = await withRetry(async () => {
        return await calendar.events.update({
          calendarId,
          eventId,
          requestBody: updatedEvent,
        });
      });

      if (!response.data) {
        throw new Error('No data returned from Google Calendar API');
      }

      const updatedEventData: CalendarEvent = {
        id: response.data.id,
        summary: response.data.summary || '',
        description: response.data.description,
        start: response.data.start?.dateTime || response.data.start?.date || '',
        end: response.data.end?.dateTime || response.data.end?.date || '',
        attendees: response.data.attendees?.map((a: any) => a.email || '') || [],
        location: response.data.location,
        status: response.data.status,
        created: response.data.created,
        updated: response.data.updated,
      };

      return {
        success: true,
        message: `✅ Successfully updated calendar event: "${updatedEventData.summary}"`,
        event: updatedEventData,
      };

    } catch (error) {
      handleGoogleApiError(error, 'update calendar event');
    }
  },
});

// Delete Calendar Event Tool
export const deleteCalendarEvent = tool({
  description: "Delete a calendar event by its ID. This action cannot be undone.",
  inputSchema: z.object({
    eventId: z.string().min(1).describe("ID of the event to delete (required)"),
  }),
  execute: async ({ eventId }) => {
    try {
      // Initialize the authentication service if not already done
      await googleOAuth.initialize();

      await googleRateLimiter.waitForSlot();

      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const calendar = googleOAuth.getCalendarClient();
      const calendarId = googleOAuth.getDefaultCalendarId();

      logGoogleOperation('DELETE', 'Calendar Event', { eventId });

      await withRetry(async () => {
        await calendar.events.delete({
          calendarId,
          eventId,
        });
      });

      return {
        success: true,
        message: `✅ Successfully deleted calendar event with ID: "${eventId}"`,
      };

    } catch (error) {
      handleGoogleApiError(error, 'delete calendar event');
    }
  },
});