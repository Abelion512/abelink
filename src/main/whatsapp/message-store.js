const messageStore = new Map()

// Format internal message: { id, sender, text, timestamp, isFromMe, rawMsg }

export const addMessage = (jid, msgObject) => {
  if (!messageStore.has(jid)) {
    messageStore.set(jid, [])
  }
  const chatMessages = messageStore.get(jid)
  
  // Hanya simpan pesan yang ada text-nya atau media
  const text = msgObject.message?.conversation || msgObject.message?.extendedTextMessage?.text || '[Media]'
  let senderName = msgObject.pushName || msgObject.key.participant || jid
  if (msgObject.key.fromMe) {
    senderName = 'Mark'
  }
  
  const simplifiedMsg = {
    id: msgObject.key.id,
    sender: senderName,
    text: text,
    timestamp: msgObject.messageTimestamp,
    isFromMe: msgObject.key.fromMe,
    rawMsg: msgObject
  }

  chatMessages.push(simplifiedMsg)
  
  // Simpan maksimal 50 pesan terakhir per chat
  if (chatMessages.length > 50) {
    chatMessages.shift()
  }
}

export const getMessages = (jid, count = 10) => {
  const chatMessages = messageStore.get(jid) || []
  return chatMessages.slice(-count)
}

export const clearChat = (jid) => {
  messageStore.delete(jid)
}

export const getAllChats = () => {
  return messageStore
}
