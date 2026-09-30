import { getAuthClient, getGoogle } from './google-service.ts'

/**
 * Helper to initialize the Gmail API.
 */
export async function getGmailApi(clientId?: string, clientSecret?: string) {
  const auth = await getAuthClient(clientId, clientSecret)
  if (!auth) throw new Error('Not connected to Google Workspace.')
  const google = await getGoogle()
  return google.gmail({ version: 'v1', auth })
}

/**
 * gmail-search: Search emails.
 */
export async function searchEmails(clientId?: string, clientSecret?: string, query = 'is:unread', maxResults = 10) {
  const gmail = await getGmailApi(clientId, clientSecret)
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults
  })
  
  if (!res.data.messages) return []

  // Fetch details for each message
  const messages = await Promise.all(res.data.messages.map(async (msg: { id?: string }) => {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date']
    })
    
    const headers = (detail.data.payload?.headers || []) as Array<{ name?: string; value?: string }>
    return {
      id: detail.data.id,
      snippet: detail.data.snippet,
      from: headers.find((h) => h.name === 'From')?.value || 'Unknown',
      subject: headers.find((h) => h.name === 'Subject')?.value || 'No Subject',
      date: headers.find((h) => h.name === 'Date')?.value || ''
    }
  }))
  
  return messages
}

/**
 * gmail-read: Get full body of an email.
 */
export async function readEmail(clientId?: string, clientSecret?: string, messageId?: string) {
  const gmail = await getGmailApi(clientId, clientSecret)
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  })
  
  // Gmail bodies are base64url encoded. We need to decode it.
  const getBody = (payload: any): string => {
    if (payload.body && payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8')
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain') {
          return Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
      }
    }
    return 'No plain text body found.'
  }

  const body = getBody(res.data.payload)
  const headers = (res.data.payload?.headers || []) as Array<{ name?: string; value?: string }>
  
  return {
    id: res.data.id,
    from: headers.find((h) => h.name === 'From')?.value,
    subject: headers.find((h) => h.name === 'Subject')?.value,
    date: headers.find((h) => h.name === 'Date')?.value,
    body
  }
}

/**
 * gmail-send: Send an email.
 */
export async function sendEmail(clientId?: string, clientSecret?: string, to?: string, subject?: string, bodyText?: string) {
  const gmail = await getGmailApi(clientId, clientSecret)
  
  // Construct raw email according to RFC 2822
  const rawEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    bodyText
  ].join('\n')
  
  // Base64url encode
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail
    }
  })
  return res.data
}

/**
 * gmail-abelink-read: tandai email sebagai sudah dibaca.
 */
export async function markAsRead(clientId?: string, clientSecret?: string, messageId?: string) {
  const gmail = await getGmailApi(clientId, clientSecret)
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  })
  return { success: true, messageId }
}

