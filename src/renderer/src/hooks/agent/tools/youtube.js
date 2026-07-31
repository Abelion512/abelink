// Tool: yt-search, yt-summary
export async function executeYoutubeTool(ctx) {
  const { tool, query, setChatData, getYoutubeData, getYoutubeSummary, abortControllerRef } = ctx
  if (tool === 'yt-search') {
    const ytResults = await window.api.searchYoutube(query)
    return JSON.stringify(ytResults)
  }
  // yt-summary
  setChatData((prev) => [
    ...prev,
    {
      role: 'ai',
      content: 'Menonton video youtube...',
      isSummarizing: true,
      youtubeLink: query
    }
  ])
  const yData = await getYoutubeData(query)
  const result = await getYoutubeSummary(query, yData, abortControllerRef.current.signal)
  setChatData((prev) => prev.filter((item) => !item.isSummarizing))
  return result
}
