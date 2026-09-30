import { getAuthClient, getGoogle } from './google-service.ts'

/**
 * Helper to initialize the Calendar API.
 */
export async function getCalendarApi(clientId?: string, clientSecret?: string) {
  const auth = await getAuthClient(clientId, clientSecret)
  if (!auth) throw new Error('Not connected to Google Workspace.')
  const google = await getGoogle()
  return google.calendar({ version: 'v3', auth })
}

/**
 * gcalendar-list: Get upcoming events.
 */
export async function listEvents(clientId?: string, clientSecret?: string, maxResults = 10, timeMin: string = new Date().toISOString()) {
  const calendar = await getCalendarApi(clientId, clientSecret)
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  })
  return (res.data.items || []).map((event: any) => ({
    id: event.id,
    summary: event.summary,
    description: event.description,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    link: event.htmlLink
  }))
}

/**
 * gcalendar-create: Create a new event.
 */
export async function createEvent(clientId?: string, clientSecret?: string, summary?: string, description?: string, startTime?: string, endTime?: string) {
  const calendar = await getCalendarApi(clientId, clientSecret)
  const event = {
    summary,
    description,
    start: {
      dateTime: new Date(startTime ?? Date.now()).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: new Date(endTime ?? Date.now()).toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  }
  const res = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  })
  return res.data
}

/**
 * gcalendar-delete: Delete an event.
 */
export async function deleteEvent(clientId?: string, clientSecret?: string, eventId?: string) {
  const calendar = await getCalendarApi(clientId, clientSecret)
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  })
  return { success: true, message: 'Event deleted successfully.' }
}
