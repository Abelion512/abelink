// Tool: music-* (play/next/prev/toggle/search)
export async function executeMusicTool(ctx) {
  const { tool, query, handleMusic } = ctx
  return handleMusic(tool, query)
}
