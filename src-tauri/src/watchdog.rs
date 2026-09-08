// Watchdog eksternal Fase 2: pagar otonomi yang TIDAK bisa dijangkau agen.
//
// Prinsip (Kill Switch Act / CISA 2026): switch harus independen dari runtime
// agen dan tidak bisa diakali dari JS. Karena itu penghitung hidup di Rust,
// bukan di renderer/sidecar. Renderer hanya menerima event + akibatnya.
//
// Dua respons, keduanya membiarkan engine TETAP HIDUP (berbeda dari kill_engine
// yang manual):
//   - Soft breach (cap tercapai): cabut SEMUA session grants -> aksi destruktif
//     kembali bertanya per-aksi + emit "watchdog-breach". Request saat ini tetap
//     diproses lewat gate normal (yang kini ask). Misi berhenti graceful via event.
//   - Hard breach (laju runaway): tolak request (Err). Loop JS melihat error,
//     circuit breaker Fase 1 trip, misi berhenti. Pulih sendiri saat laju turun.
//
// Ambang = tripwire runaway, BUKAN limiter pemakaian normal: sesi interaktif
// puluhan invoke, misi riset otonom ratusan rendah. Nilai awal murah hati;
// kalibrasi dari data setelah 2 minggu (lihat jejak audit Fase 1).
use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Instant;

/// Total invoke per sesi aplikasi sebelum grant dicabut.
pub const MAX_ACTIONS_PER_SESSION: u64 = 1000;
/// Invoke aksi gated (APPROVAL_ACTIONS) per sesi sebelum grant dicabut.
pub const MAX_DESTRUCTIVE_PER_SESSION: u64 = 100;
/// Jendela laju runaway.
pub const RATE_WINDOW_SECS: u64 = 10;
/// Invoke dalam jendela di atas = runaway (tolak request).
pub const MAX_ACTIONS_PER_WINDOW: usize = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Breach {
    SoftTotalCap,
    SoftDestructiveCap,
    HardRate,
}

impl Breach {
    pub fn kind(&self) -> &'static str {
        match self {
            Breach::SoftTotalCap => "total-cap",
            Breach::SoftDestructiveCap => "destructive-cap",
            Breach::HardRate => "runaway-rate",
        }
    }
    pub fn is_hard(&self) -> bool {
        matches!(self, Breach::HardRate)
    }
}

pub struct Watchdog {
    total: u64,
    destructive: u64,
    window: VecDeque<Instant>,
    soft_fired: bool,
}

impl Watchdog {
    pub fn new() -> Self {
        Self {
            total: 0,
            destructive: 0,
            window: VecDeque::new(),
            soft_fired: false,
        }
    }

    /// Catat satu invoke. Kembalikan breach bila ambang terlampaui.
    /// Soft hanya dilaporkan SEKALI per sesi (latch); hard dilaporkan selama
    /// laju masih di atas ambang (pulih sendiri saat melambat).
    pub fn record(&mut self, destructive: bool) -> Option<Breach> {
        self.record_at(destructive, Instant::now())
    }

    fn record_at(&mut self, destructive: bool, now: Instant) -> Option<Breach> {
        self.total += 1;
        if destructive {
            self.destructive += 1;
        }
        self.window.push_back(now);
        let cutoff = now - std::time::Duration::from_secs(RATE_WINDOW_SECS);
        while self.window.front().is_some_and(|t| *t < cutoff) {
            self.window.pop_front();
        }
        if self.window.len() > MAX_ACTIONS_PER_WINDOW {
            return Some(Breach::HardRate);
        }
        if !self.soft_fired {
            if self.destructive >= MAX_DESTRUCTIVE_PER_SESSION {
                self.soft_fired = true;
                return Some(Breach::SoftDestructiveCap);
            }
            if self.total >= MAX_ACTIONS_PER_SESSION {
                self.soft_fired = true;
                return Some(Breach::SoftTotalCap);
            }
        }
        None
    }

    #[cfg(test)]
    pub fn counts(&self) -> (u64, u64) {
        (self.total, self.destructive)
    }
}

static WATCHDOG: Mutex<Option<Watchdog>> = Mutex::new(None);

fn with_watchdog<T>(f: impl FnOnce(&mut Watchdog) -> T) -> T {
    let mut guard = WATCHDOG.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(Watchdog::new());
    }
    f(guard.as_mut().unwrap())
}

/// Catat invoke dari node_invoke. Dipanggil untuk SEMUA aksi (termasuk yang
/// ditolak user — banjir penolakan juga sinyal renderer kompromi).
pub fn record_action(destructive: bool) -> Option<Breach> {
    with_watchdog(|w| w.record(destructive))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // Waktu virtual: tanpa sleep, deterministik. Sesi normal = 1 invoke/detik.
    fn t(base: Instant, secs: u64) -> Instant {
        base + Duration::from_secs(secs)
    }

    #[test]
    fn normal_use_never_trips() {
        let mut w = Watchdog::new();
        let t0 = Instant::now();
        for i in 0..200 {
            assert_eq!(w.record_at(false, t(t0, i)), None);
        }
        assert_eq!(w.counts(), (200, 0));
    }

    #[test]
    fn destructive_cap_fires_once_then_latches() {
        let mut w = Watchdog::new();
        let t0 = Instant::now();
        // 99 destruktif tersebar 1/detik: laju aman, cap belum kena.
        for i in 0..MAX_DESTRUCTIVE_PER_SESSION - 1 {
            assert_eq!(w.record_at(true, t(t0, i)), None);
        }
        // Ke-100 dalam jendela laju yang sama -> soft destructive.
        assert_eq!(
            w.record_at(true, t(t0, MAX_DESTRUCTIVE_PER_SESSION - 1)),
            Some(Breach::SoftDestructiveCap)
        );
        // Setelah latch + jendela menua: tidak ada breach kedua.
        let later = t(t0, MAX_DESTRUCTIVE_PER_SESSION + RATE_WINDOW_SECS + 1);
        assert_eq!(w.record_at(false, later), None);
        assert_eq!(w.record_at(true, later), None);
    }

    #[test]
    fn total_cap_fires() {
        let mut w = Watchdog::new();
        let t0 = Instant::now();
        for i in 0..MAX_ACTIONS_PER_SESSION - 1 {
            assert_eq!(w.record_at(false, t(t0, i)), None);
        }
        assert_eq!(
            w.record_at(false, t(t0, MAX_ACTIONS_PER_SESSION - 1)),
            Some(Breach::SoftTotalCap)
        );
    }

    #[test]
    fn hard_rate_wins_and_self_heals() {
        let mut w = Watchdog::new();
        let t0 = Instant::now();
        // 61 invoke dalam 1 detik yang sama = runaway.
        for _ in 0..MAX_ACTIONS_PER_WINDOW {
            let _ = w.record_at(false, t(t0, 0));
        }
        assert_eq!(w.record_at(false, t(t0, 0)), Some(Breach::HardRate));
        // Jendela menua -> pulih tanpa reset manual.
        assert_eq!(w.record_at(false, t(t0, RATE_WINDOW_SECS + 1)), None);
    }
}
