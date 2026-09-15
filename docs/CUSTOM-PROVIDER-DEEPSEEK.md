# Custom Provider: DeepSeek-free-api (lokal)

Sambungkan proxy DeepSeek web gratis sebagai provider `custom` Abelink.
Qwen-web-arwaky TIDAK didukung langsung (itu CLI agent, bukan server
OpenAI-compatible) — jangan kejar keduanya sekaligus.

## 1. Nyalakan proxy (di luar Abelink)

```bash
cd /media/abelion/Isaf/ican/project/deepseek-free-api
PROXY_PORT=8000 python proxy.py   # buka http://localhost:8000/admin
```

Login sekali via halaman `/admin` (paste cURL / cookie chat.deepseek.com).
Pakai **akun cadangan, bukan akun utama** — ini bridge tidak resmi
(PoW-solving + refresh otomatis); ekspektasikan rate-limit sewaktu-waktu
dan rotasi token bila 401.

## 2. Konfigurasi Abelink (Configuration → Model)

- Provider: **Custom API**
- Endpoint URL: `http://localhost:8000/v1`
- Model: `deepseek-chat` (chat) atau `deepseek-reasoner` (nalar;
  output `<think>` diekstrak otomatis oleh ai-bridge)
- API Key: kosongkan (proxy lokal tanpa auth) atau isi bila proxy
  dikonfigurasi sebaliknya

Tekan **Deteksi Ulang** — daftar model muncul dari `/v1/models`
(proxy mendukung dynamic discovery + refresh per jam).

## 3. Fallback otomatis Gemini Web → custom

Bila provider utama = **Gemini Web** dan endpoint custom terisi,
sesi-error Gemini (limit/sorry/cookie) otomatis dioper 1× ke custom
(`sidecar/main/ai-bridge.js`). Tanpa custom terisi: error jujur,
tidak menggantung.

## 4. Batasan

- Vision: Gemini Web RPC tidak mendukung gambar; DeepSeek proxy
  mendukung vision — gambar diteruskan apa adanya ke custom.
- Tool-calling: pakai branch `no-tools` proxy untuk chat murni
  (tanpa injeksi prompt tool) bila output kotor.
- Strict: risiko di sisi akun DeepSeek Anda, bukan di repo ini.
  Token tersimpan di `config.json` milik proxy, bukan di Abelink.
