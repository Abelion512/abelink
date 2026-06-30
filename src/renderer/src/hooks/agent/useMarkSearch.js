import { getSearchResult } from '../../api/ai/tools'
import { insertMemory } from '../../api/db'

export const useMarkSearch = (setChatData, chatData, searchProp, pushProcess, dismissProcess) => {
  const receiveSearchResult = async (search, result) => {
    setChatData((prev) => [
      ...prev.filter((item) => !item.isSearching),
      { role: 'ai', content: '...', isSummarizing: true }
    ])
    if (result.length > 0) {
      try {
        const searchSummary = await getSearchResult(
          search,
          result,
          searchProp.current.userInput,
          searchProp.current.signal,
          searchProp.current.chatSession
        )
        setChatData((prev) => [
          ...prev.filter((item, index) => !item.isSummarizing || index === chatData.length - 2),
          {
            role: 'ai',
            content: searchSummary.answer,
            sources: searchSummary.sources,
            isMemorySaved: true
          }
        ])
        insertMemory({
          type: 'fact',
          key: 'misc',
          memory: JSON.stringify(searchSummary.answer)
        })
      } catch (error) {
        console.error('Search Technical Error:', error)
        if (error.name === 'AbortError') {
          setChatData((prev) => [...prev.filter((item) => !item.isSearching)])
          setChatData((prev) => prev.slice(0, -1))
        } else {
          setChatData((prev) => [
            ...prev.filter((item) => !item.isSummarizing),
            {
              role: 'ai',
              content:
                'Gagal dapet info dari internet nih, koneksi atau captcha mungkin bermasalah.'
            }
          ])
        }
      }
    } else {
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSummarizing),
        {
          role: 'ai',
          content: 'Gagal dapet info dari internet nih, koneksi atau captcha mungkin bermasalah.'
        }
      ])
    }
  }

  const handleSearchCommand = async (userInput, query, signal, chatSession) => {
    searchProp.current = { userInput, signal, chatSession }
    
    const processId = `search-${Date.now()}`;
    pushProcess({
      id: processId,
      type: 'web-search',
      status: 'active',
      data: {
        query: query,
        sendDataWebSearch: (search, result) => {
          pushProcess({
            id: processId,
            type: 'web-search',
            status: 'done',
            data: { query }
          });
          receiveSearchResult(search, result);
        }
      }
    });

    setChatData((prev) => [
      ...prev,
      {
        role: 'ai',
        content: 'Mencari informasi di internet...',
        isSearching: true,
        query: query
      }
    ])
  }


  return { receiveSearchResult, handleSearchCommand }
}
