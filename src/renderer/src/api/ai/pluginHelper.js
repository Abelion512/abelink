// Force recompile
export const getPluginPromptStr = async () => {
  try {
    const plugins = await window.api.getPlugins()
    if (!plugins || plugins.length === 0) return ''

    let promptStr = `\n\n[EKSTENSI: KEMAMPUAN TOOLS TAMBAHAN (PLUGINS)]\nKamu JUGA BISA menggunakan *action* dari plugin berikut jika sesuai dengan permintaan user:\n`

    plugins.forEach((plugin) => {
      if (plugin.actions) {
        plugin.actions.forEach((act) => {
          promptStr += `- JIKA ${act.triggerHint || 'dibutuhkan'}, gunakan action "${act.name}" dan isi query dengan format yang sesuai. Deskripsi: ${act.description}\n`
        })
      }
    })
    return promptStr
  } catch (e) {
    console.error(e)
    return ''
  }
}

export const getPluginActionsArray = async () => {
  try {
    const plugins = await window.api.getPlugins()
    if (!plugins || plugins.length === 0) return []

    let actions = []
    plugins.forEach((plugin) => {
      if (plugin.actions) {
        plugin.actions.forEach((act) => {
          actions.push(act.name)
        })
      }
    })
    return actions
  } catch (e) {
    console.error(e)
    return []
  }
}
