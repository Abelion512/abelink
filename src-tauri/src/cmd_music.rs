use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent, Emitter};

const AD_BLASTER_SCRIPT: &str = r#"
(function() {
  console.log('[Abelink YTM] Ultra Ad-Blaster & Sync script initialized');
  let isAdMuted = false;
  let lastTrackInfo = { title: '', artist: '', paused: true };

  // 0. Inject GPU/RAM optimization & Ad CSS suppression
  if (!document.getElementById('abelink-audio-throttle')) {
    const style = document.createElement('style');
    style.id = 'abelink-audio-throttle';
    style.textContent = `
      ytmusic-player #cinematics,
      ytmusic-cinematics,
      #player-page canvas,
      .ytmusic-player-bar-waveform,
      .ytp-ad-overlay-container,
      .ytp-ad-message-container,
      ytmusic-mealbar-promo-renderer,
      .video-ads,
      .ytp-ad-module,
      ytmusic-popup-container {
        display: none !important;
      }
      #player.ytmusic-player-page { max-height: 200px !important; }
      ytmusic-player-page video { object-fit: contain !important; }
    `;
    document.head.appendChild(style);
  }

  function obliterateAds() {
    try {
      const video = document.querySelector('video');
      
      // Deteksi indikator iklan YouTube Music
      const adEl = document.querySelector(
        '.ad-showing, .ad-interrupting, .video-ads, .ytp-ad-player-overlay, .ytp-ad-module, [class*="ytp-ad"], [class*="ad-showing"]'
      );
      const sponsoredText = document.querySelector('.ytp-ad-text, .badge-style-type-ad, .ytp-ad-preview-container');
      const isAd = Boolean(adEl || sponsoredText);

      if (isAd && video) {
        // A. Mute instan suara iklan
        if (!video.muted) {
          video.muted = true;
          isAdMuted = true;
        }

        // B. Instant skip: lompatkan waktu video langsung ke akhir iklan
        if (!isNaN(video.duration) && isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }

        // C. Fast-forward maksimal jika lompatan dicegah player
        if (video.readyState >= 2) {
          video.playbackRate = 16;
        }

        // D. Klik agresif seluruh variasi tombol Skip Ad
        const skipButtons = document.querySelectorAll(
          '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-slot button, button[id*="skip"]'
        );
        skipButtons.forEach(btn => {
          try { btn.click(); } catch (_) {}
        });
      } else if (video) {
        if (isAdMuted) {
          video.muted = false;
          isAdMuted = false;
        }
        if (video.playbackRate !== 1) {
          video.playbackRate = 1;
        }
      }

      // Dismiss dialog promo login & popup mengganggu
      const dismissBtns = document.querySelectorAll(
        'ytmusic-modal-with-title-and-button-renderer yt-button-renderer, ' +
        'ytmusic-sign-in-promo-renderer .dismiss-button, ' +
        'button[aria-label="No thanks"], button[aria-label="Lain kali"], ' +
        'button[aria-label="Dismiss"], button[aria-label="Lewati"], ' +
        'button[aria-label="Reject all"], button[aria-label="Tolak semua"], ' +
        'button[aria-label="Accept all"], button[aria-label="Terima semua"]'
      );
      dismissBtns.forEach(btn => {
        try { btn.click(); } catch (_) {}
      });

      // Confirm "Are you still watching/listening"
      const confirmBtn = document.querySelector('ytmusic-you-there-renderer button, .ytmusic-you-there-renderer button');
      if (confirmBtn) confirmBtn.click();

    } catch (err) {
      console.warn('[Abelink YTM] Ad blaster error:', err);
    }
  }

  // Interval cepat 150ms agar iklan terdeteksi & terlewati sebelum terdengar
  setInterval(obliterateAds, 150);

  // Sync track info setiap 1 detik
  setInterval(() => {
    try {
      const video = document.querySelector('video');
      const titleEl = document.querySelector('yt-formatted-string.title.ytmusic-player-bar, .title.ytmusic-player-bar');
      const subtitleEl = document.querySelector('span.subtitle.ytmusic-player-bar, .byline.ytmusic-player-bar');
      const imgEl = document.querySelector('img.image.ytmusic-player-bar, .thumbnail.ytmusic-player img');
      const title = titleEl ? (titleEl.getAttribute('title') || titleEl.innerText || titleEl.textContent || '').trim() : '';
      const artist = subtitleEl ? (subtitleEl.getAttribute('title') || subtitleEl.innerText || subtitleEl.textContent || '').trim() : '';
      const thumbnail = imgEl ? (imgEl.src || '') : '';
      const paused = video ? video.paused : true;

      if (title && (title !== lastTrackInfo.title || artist !== lastTrackInfo.artist || paused !== lastTrackInfo.paused)) {
        lastTrackInfo = { title, artist, thumbnail, paused };
        if (window.__TAURI__ && window.__TAURI__.event) {
          window.__TAURI__.event.emit('ytm-track-changed', { title, artist, thumbnail, paused });
        }
      }
    } catch (_) {}
  }, 1000);
})();
"#;

fn anchor_window_bottom_right(win: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = win.current_monitor() {
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let win_w = 420.0 * scale;
        let win_h = 640.0 * scale;
        let x = (size.width as f64 - win_w - (24.0 * scale)).max(0.0) as i32;
        let y = (size.height as f64 - win_h - (70.0 * scale)).max(0.0) as i32;
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(x, y)));
    }
}

#[tauri::command]
pub fn music_player_toggle(app: AppHandle) -> Result<bool, String> {
    if let Some(win) = app.get_webview_window("music_player") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
            let _ = app.emit("ytm-window-state", false);
            Ok(false)
        } else {
            anchor_window_bottom_right(&win);
            let _ = win.show();
            let _ = win.set_focus();
            let _ = app.emit("ytm-window-state", true);
            Ok(true)
        }
    } else {
        let win = create_music_window(&app, "https://music.youtube.com", true)?;
        anchor_window_bottom_right(&win);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("ytm-window-state", true);
        Ok(true)
    }
}

#[tauri::command]
pub fn music_player_show(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("music_player") {
        anchor_window_bottom_right(&win);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("ytm-window-state", true);
    } else {
        let win = create_music_window(&app, "https://music.youtube.com", true)?;
        anchor_window_bottom_right(&win);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("ytm-window-state", true);
    }
    Ok(())
}

#[tauri::command]
pub fn music_player_hide(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("music_player") {
        let _ = win.hide();
        let _ = app.emit("ytm-window-state", false);
    }
    Ok(())
}

#[tauri::command]
pub fn music_player_play_url(app: AppHandle, url: String) -> Result<(), String> {
    let target_url = if url.trim().is_empty() {
        "https://music.youtube.com".to_string()
    } else {
        url
    };

    if let Some(win) = app.get_webview_window("music_player") {
        let script = format!("window.location.href = '{}';", target_url.replace('\'', "\\'"));
        let _ = win.eval(&script);
    } else {
        // Playback background secara senyap tanpa memunculkan window popup di tengah layar
        create_music_window(&app, &target_url, false)?;
    }
    Ok(())
}

#[tauri::command]
pub fn music_player_command(app: AppHandle, command: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("music_player") {
        let script = match command.as_str() {
            "playPause" | "toggle" => {
                r#"
                (function() {
                    const btn = document.querySelector('.play-pause-button, #play-pause-button, ytmusic-player-bar .play-pause-button, ytmusic-player-bar #play-pause-button');
                    if (btn) btn.click();
                    else {
                        const v = document.querySelector('video');
                        if (v) {
                            if (v.paused) v.play();
                            else v.pause();
                        }
                    }
                })();
                "#
            }
            "next" => {
                r#"
                (function() {
                    const btn = document.querySelector('.next-button, #next-button, ytmusic-player-bar .next-button, ytmusic-player-bar #next-button');
                    if (btn) btn.click();
                })();
                "#
            }
            "prev" => {
                r#"
                (function() {
                    const btn = document.querySelector('.previous-button, #previous-button, ytmusic-player-bar .previous-button, ytmusic-player-bar #previous-button');
                    if (btn) btn.click();
                })();
                "#
            }
            _ => return Err(format!("Unknown music command: {}", command)),
        };
        let _ = win.eval(script);
        Ok(())
    } else {
        Err("Music player window is not running".into())
    }
}

fn create_music_window(app: &AppHandle, start_url: &str, start_visible: bool) -> Result<tauri::WebviewWindow, String> {
    let parsed_url = start_url
        .parse()
        .map_err(|e| format!("Invalid URL: {e}"))?;

    let win = WebviewWindowBuilder::new(
        app,
        "music_player",
        WebviewUrl::External(parsed_url),
    )
    .title("Abelink - YouTube Music")
    .inner_size(420.0, 640.0)
    .min_inner_size(360.0, 480.0)
    .resizable(true)
    .visible(start_visible)
    .decorations(true)
    .initialization_script(AD_BLASTER_SCRIPT)
    .build()
    .map_err(|e| format!("Failed to build music player window: {e}"))?;

    let win_clone = win.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_clone.hide();
        }
    });

    #[cfg(target_os = "linux")]
    {
        use webkit2gtk::{SettingsExt, WebViewExt};
        let _ = win.with_webview(|wv| {
            if let Some(settings) = wv.inner().settings() {
                settings.set_media_playback_requires_user_gesture(false);
                settings.set_media_playback_allows_inline(true);
                settings.set_enable_webgl(false);
                settings.set_enable_smooth_scrolling(false);
            }
        });
    }

    Ok(win)
}
