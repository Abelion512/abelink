

export const YoutubeSummaryBubble = ({ youtubeLink }: { youtubeLink: unknown }) => {
  const getYouTubeID = (text: string) => {
    const ytRegex =
      /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    const match = text.match(ytRegex)
    return match ? match[1] : null
  }

  const linkStr = typeof youtubeLink === 'string' ? youtubeLink : ''
  const youtubeVideoId = getYouTubeID(linkStr)
  const youtubeEmbedUrl = youtubeVideoId
    ? `https://www.youtube.com/embed/${youtubeVideoId}?rel=0&origin=${encodeURIComponent(window.location.origin)}`
    : null

  return (
    <div className="p-3 bg-base-300 rounded-xl my-2 space-y-3">
      {youtubeEmbedUrl ? (
        <iframe
          className="w-full aspect-video rounded-xl"
          src={youtubeEmbedUrl}
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen; origin"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        ></iframe>
      ) : (
        <div className="aspect-video rounded-xl bg-base-200 flex items-center justify-center text-sm text-base-content/70 text-center px-4">
          Tidak bisa memuat pemutar YouTube untuk tautan ini.
        </div>
      )}
      <button
        type="button"
        onClick={() => window.api.openExternal(linkStr)}
        className="btn btn-sm btn-neutral w-full normal-case"
      >
        Watch on YouTube
      </button>
    </div>
  )
}
