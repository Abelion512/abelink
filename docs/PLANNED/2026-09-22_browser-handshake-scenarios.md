# Uji 3 skenario handshake (manual E2E, ±15 menit)

Prasyarat terpenuhi: google-chrome ada, native host prod+dev terpasang,
token 0600 ada. Extension harus pairing sekali dulu (klik Connect di popup).

## Skenario A — browser tutup lalu dibuka Abelink

1. Pairing sekali via popup (Connect), catat pill hijau.
2. Tutup Chrome penuh (bukan minimize).
3. Dari Abelink: minta `browser:navigate` ke https://example.com.
4. Diharapkan: `xdg-open` buka Chrome → `onStartup` tryAutoResume →
   handshake ≤20 detik → tab terbuka. Tanpa klik Connect lagi.
5. Catat: waktu reconnect aktual + apakah perlu klik manual.

## Skenario B — suspend laptop

1. Pairing hijau, biarkan idle.
2. Suspend laptop >6 menit (lewat SESSION_TTL 5 menit + sweep 60 detik).
3. Bangunkan, langsung minta `browser:read-dom`.
4. Diharapkan: sesi lama di-sweep → handshake ulang otomatis via alarm
   keepalive 1 menit + token helper → jalan tanpa klik.
5. Catat: reconnect otomatis atau 401/manual.

## Skenario C — restart sidecar (token basi)

1. Pairing hijau.
2. Restart Abelink (sidecar restart → token baru).
3. Minta `browser:read-dom` tanpa sentuh popup.
4. Diharapkan: 401 `token-stale` → refresh via native-host helper
   otomatis sekali → handshake ulang → jalan.
5. Catat: otomatis atau perlu tempel token manual.

## Hasil (isi setelah uji)

| Skenario | Otomatis? | Waktu | Klik manual? | Catatan |
|----------|-----------|-------|--------------|---------|
| A tutup-buka | | | | |
| B suspend | | | | |
| C restart | | | | |

Kriteria lolos: 3/3 otomatis tanpa klik Connect ulang.
Gagal di skenario mana pun → jadi Task 8 (patch TTL/sweep/retry) dengan bukti.
