import { getAnswer } from '../../api/ai/chat'
import { playVoice } from '../../api/ai/utils'
import { insertMemory, updateMemory, deleteMemory, getAllMemory } from '../../api/db'
import { getRelevantMemory } from '../../api/vectorMemory'

export const useMarkChat = ({
  chatData, setChatData, config, isAction, isSpeak, abortControllerRef, setIsLoading, setMessage,
  handleYoutubeSearch, handleSearchCommand, handleYoutubeSummary, handleMusic
}) => {
  const handleAIResponse = async (userInput) => {
    if (!userInput) return
    setIsLoading(true)
    const userMessage = { role: 'user', content: userInput }
    const thinkingMessage = { role: 'ai', content: '...', isThinking: true }
    const rawSession = [
      ...chatData
        .filter(
          (item) =>
            item.role !== 'command' && !item.isThinking && !item.isSearching && !item.isSummarizing
        )
        .map((item) => ({ role: item.role === 'ai' ? 'assistant' : 'user', content: item.content }))
    ]

    let chatSession = []
    rawSession.forEach((item, index) => {
      if (index > 0 && item.role === chatSession[chatSession.length - 1].role) {
        chatSession[chatSession.length - 1].content =
          chatSession[chatSession.length - 1].content + `\n ${item.content}`
      } else {
        chatSession.push(item)
      }
    })

    chatSession = [...chatSession].slice(-1 * (config[0]?.context || 10))
    chatSession = [...chatSession, userMessage]
    setChatData((prev) => [...prev, userMessage, thinkingMessage])
    abortControllerRef.current = new AbortController()

    try {
      const allMemory = await getAllMemory()
      const memoryReference = await getRelevantMemory(userInput, allMemory)

      const answer = await getAnswer(
        userInput,
        memoryReference,
        chatSession,
        abortControllerRef.current.signal,
        isAction.web
      )

      if (!answer || !answer.answer) throw new Error('Gagal mengurai jawaban dari Mark menjadi format JSON.')

      if (isSpeak) {
        playVoice(answer.answer)
      }

      if (answer.memory && answer.command?.action !== 'search') {
        const actions = { insert: insertMemory, update: updateMemory, delete: deleteMemory }
        if (actions[answer.memory.action]) {
          const memoryData = { ...answer.memory }
          memoryData.memory = memoryData.memory
            .trim()
            .replace(/^[\\"]+|[\\"]+$/g, '')
            .replace(/\\n/g, '\n')
          await actions[answer.memory.action](memoryData)
        }
      }

      if (answer.command?.action === 'yt-search') {
        handleYoutubeSearch(answer, abortControllerRef.current.signal)
      } else {
        setChatData((prev) => {
          const filtered = prev.filter((item) => !item.isThinking)
          const aiResponse = {
            role: 'ai',
            content: answer.answer,
            reasoning: answer.reasoning,
            isMemorySaved:
              answer.memory?.action === 'insert' && answer.command?.action !== 'search',
            isMemoryUpdated: answer.memory?.action === 'update',
            isMemoryDeleted: answer.memory?.action === 'delete'
          }
          if (answer.command?.run && String(answer.command.run).toLowerCase() !== 'null' && String(answer.command.run).trim() !== '' && (!answer.command.action || answer.command.action === 'none')) {
            return [
              ...filtered,
              aiResponse,
              { role: 'command', content: answer.command.run, risk: answer.command.risk }
            ]
          }
          return [...filtered, aiResponse]
        })
      }

      if (answer.command?.action === 'search') {
        await handleSearchCommand(
          userInput,
          answer.command.query,
          abortControllerRef.current.signal,
          chatSession
        )
      }
      if (answer.command?.action === 'yt-summary') {
        await handleYoutubeSummary(answer.command.query, abortControllerRef.current.signal)
      } else if (answer.command?.action?.startsWith('music')) {
        await handleMusic(answer.command.action, answer.command?.query)
      } else if (answer.command?.action && answer.command.action !== 'none' && answer.command.action !== 'search' && answer.command.action !== 'yt-search') {
        const act = answer.command.action
        const qry = answer.command.query

        setChatData((prev) => [
          ...prev,
          { role: 'ai', content: `Mengeksekusi plugin: ${act}...`, isThinking: true }
        ])

        const res = await window.api.executePlugin(act, qry)
        
        setChatData((prev) => prev.filter(item => !item.isThinking))

        if (res.success) {
          const summary = res.data
          const summaryStr = typeof summary === 'string' ? summary : JSON.stringify(summary)
          
          setChatData((prev) => [
            ...prev,
            { role: 'ai', content: 'Membaca hasil eksekusi...', isThinking: true }
          ])

          const finalChatSession = [
            ...chatSession,
            { role: 'user', content: userInput },
            { role: 'assistant', content: answer.answer }
          ]

          const followUpInput = `[SYSTEM: HASIL PLUGIN ${act}]\nBerikut hasil dari eksekusi plugin:\n${summaryStr}\n\nTolong jawab kembali pertanyaanku sebelumnya berdasarkan hasil plugin ini secara natural.`
          
          const followUp = await getAnswer(followUpInput, null, finalChatSession, abortControllerRef.current.signal, false)

          setChatData((prev) => [
            ...prev.filter(item => !item.isThinking),
            { role: 'ai', content: `[Plugin digunakan: ${act}]\n\n${followUp.answer}`, command: followUp.command }
          ])

          if (isSpeak && config[0]?.voiceMode === 'ON' && followUp.answer) {
            playVoice(followUp.answer)
          }

        } else {
           console.log("Plugin action not found or failed:", res.error)
        }
      }
      setMessage('')
      setIsLoading(false)
    } catch (error) {
      setIsLoading(false)
      if (error.name === 'AbortError' && !error.message?.includes('Timeout')) {
        setChatData((prev) => [...prev.filter((item) => !item.isThinking)])
        setChatData((prev) => prev.slice(0, -1))
      } else if (
        error?.code === 'LM_STUDIO_OFFLINE' ||
        error?.message?.includes('LM Studio mati')
      ) {
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          {
            role: 'ai',
            content:
              'LM Studio lagi mati bro. Nyalain dulu server-nya di port 1234, baru gue lanjut jawab.'
          }
        ])
      } else {
        console.error('AI Response Error:', error)
        setChatData((prev) => [
          ...prev.filter((item) => !item.isThinking),
          { role: 'ai', content: `Maaf, terjadi kesalahan: ${error.message}` }
        ])
      }
    }
  }


  return { handleAIResponse }
}
