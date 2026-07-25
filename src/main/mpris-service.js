/**
 * MPRIS D-Bus Service
 *
 * Registers Mark's music player on the Linux D-Bus so desktop environments
 * (GNOME, KDE, etc.) can control playback via media keys, lockscreen controls,
 * and notification center widgets.
 *
 * Uses `mpris-service` (npm) — implements the MPRIS 2.1 spec.
 */

import Mpris from 'mpris-service'

let mpris = null
let currentTrack = null
let isPlaying = false

/** Callbacks set by index.js */
let onPlayPause = null
let onNext = null
let onPrevious = null
let onStop = null

/** Guard: check if D-Bus connection is alive before sending */
function isMprisAlive() {
  try {
    return mpris && mpris.connection
  } catch {
    return false
  }
}

/** Safe property setter — catches D-Bus stream closed errors and marks destroyed */
function safeSetProperty(prop, value) {
  try {
    if (!isMprisAlive()) return
    mpris[prop] = value
  } catch (err) {
    // D-Bus stream closed or destroyed — mark dead and never touch again
    if (err.message?.includes('closed') || err.message?.includes('destroyed') || err.message?.includes('Cannot send message')) {
      console.warn('[MPRIS] D-Bus stream dead, destroying MPRIS service')
      try { mpris?.destroy() } catch {}
      mpris = null
    }
  }
}

export function initMpris() {
  if (mpris) return // Already initialized

  try {
    mpris = Mpris({
      name: 'mark',
      identity: 'Mark AI Music Player',
      supportedUriSchemes: ['file', 'https'],
      supportedMimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/flac'],
      supportedInterfaces: ['player']
    })

    mpris.canRaise = false
    mpris.canQuit = false
    mpris.canSetFullscreen = false
    mpris.hasTrackList = false

    mpris.canGoNext = true
    mpris.canGoPrevious = true
    mpris.canPause = true
    mpris.canPlay = true
    mpris.canControl = true

    // Listen for D-Bus signals from desktop
    mpris.on('playpause', () => { try { onPlayPause?.() } catch {} })
    mpris.on('next', () => { try { onNext?.() } catch {} })
    mpris.on('previous', () => { try { onPrevious?.() } catch {} })
    mpris.on('stop', () => { try { onStop?.() } catch {} })
    mpris.on('play', () => { try { onPlayPause?.() } catch {} })
    mpris.on('pause', () => { try { onPlayPause?.() } catch {} })

    console.log('[MPRIS] Service registered on D-Bus')
  } catch (err) {
    console.error('[MPRIS] Failed to register:', err.message)
  }
}

/**
 * Update the currently playing track metadata for MPRIS.
 * @param {Object} track — { title, artist, album, duration, thumbnail }
 * @param {boolean} playing
 */
export function updateMprisTrack(track, playing = true) {
  if (!mpris) return

  currentTrack = track
  isPlaying = playing

  if (!track) {
    safeSetProperty('metadata', mpris.metadata) // Reset
    safeSetProperty('playbackStatus', 'Stopped')
    return
  }

  try {
    mpris.metadata = {
      'mpris:trackid': mpris.objectPath('track/' + (track.id || '0')),
      'mpris:length': (track.duration || 0) * 1000000, // microseconds
      'mpris:artUrl': track.thumbnail || '',
      'xesam:title': track.title || 'Unknown Track',
      'xesam:artist': [track.artist || 'Unknown Artist'],
      'xesam:album': track.album || ''
    }
  } catch (err) {
    if (err.message?.includes('closed')) {
      console.warn('[MPRIS] D-Bus stream closed during metadata update')
    }
  }

  safeSetProperty('playbackStatus', playing ? 'Playing' : 'Paused')
}

export function setMprisPlaybackStatus(playing) {
  if (!mpris) return
  isPlaying = playing
  safeSetProperty('playbackStatus', playing ? 'Playing' : 'Paused')
  // If the setter killed mpris (stream dead), also kill IPC listeners
  if (!mpris) {
    // cleanup will be handled during next lifecycle
  }
}

export function setMprisCallbacks(cbs) {
  onPlayPause = cbs.onPlayPause || null
  onNext = cbs.onNext || null
  onPrevious = cbs.onPrevious || null
  onStop = cbs.onStop || null
}

export function stopMpris() {
  if (mpris) {
    try { mpris.destroy() } catch {}
    mpris = null
  }
}
