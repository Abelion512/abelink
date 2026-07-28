# Panduan Instalasi Mark Agent Linux

## Persyaratan Sistem

| Komponen | Minimal | Recommended |
|----------|---------|-------------|
| **OS** | Ubuntu 22.04 / Fedora 40 / Arch | Ubuntu 24.04 |
| **CPU** | Dual-core 2.0 GHz | Quad-core 3.0+ GHz |
| **RAM** | 4 GB | 8 GB |
| **Storage** | 1 GB free | 5 GB (untuk model lokal) |
| **GPU** | Integrated | NVIDIA/AMD (untuk LM Studio) |
| **Node.js** | 18 LTS | 20 LTS |
| **Display** | X11 (Wayland eksperimental) | X11 |

## Instalasi Dependensi Sistem

### Debian/Ubuntu
```bash
sudo -S -p '' apt update
sudo -S -p '' apt install -y libgtk-3-dev libnotify-dev libnss3 libxss1 \
  libxtst6 xdotool wmctrl xclip tesseract-ocr python3
```

### Fedora
```bash
sudo -S -p '' dnf install -y libgtk-3-devel libnotify-devel nss libXScrnSaver \
  libXtst xdotool wmctrl xclip tesseract python3
```

### Arch
```bash
sudo -S -p '' pacman -S --needed gtk3 libnotify nss libxss libxtst xdotool \
  wmctrl xclip tesseract python
```

## Metode Instalasi

### 1. AppImage (Recommended)

Download dari [GitHub Releases](https://github.com/Abelion512/mark-agent/releases).

```bash
chmod +x Mark-*.AppImage
./Mark-*.AppImage
```

Simpan di `~/Applications/` dan buat symlink:
```bash
mkdir -p ~/Applications
mv Mark-*.AppImage ~/Applications/mark-agent.AppImage
ln -s ~/Applications/mark-agent.AppImage ~/.local/bin/mark
```

### 2. Debian Package

```bash
sudo -S -p '' dpkg -i mark_*.deb
sudo -S -p '' apt install -f  # fix missing deps
```
Register otomatis di menu aplikasi. Jalankan via `mark`.

### 3. Build dari Source

```bash
git clone https://github.com/Abelion512/mark-agent.git
cd mark-agent
npm ci
npm run build:linux
ls dist/  # *.AppImage, *.deb, *.snap
```

## Konfigurasi Awal

1. Buka Mark -> halaman Configuration (icon gear)
2. Pilih AI Provider:
   - **9Router** (default, butuh server lokal port 20128)
   - **LM Studio** (lokal, tanpa GPU)
   - **Groq** (cepat, butuh API key gratis)
   - **Custom OpenAI-compatible** (endpoint apapun)
3. Masukkan API key jika pakai cloud provider
4. Simpan -> Mark siap digunakan

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| **libgtk-3-dev not found** | `sudo apt install libgtk-3-dev` / `sudo dnf install gtk3-devel` |
| **GPU crash startup** | Tambah `--disable-gpu` di argumen Electron |
| **Tesseract not found** | Install `tesseract-ocr` + `tesseract-ocr-ind` untuk B. Indonesia |
| **xdotool "No such display"** | `export DISPLAY=:0`. X11 required. |
| **AppImage not executable** | `chmod +x Mark-*.AppImage` |
| **Dev server EADDRINUSE** | Port 5173 dipakai. Matikan proses lain. |
| **LM Studio connection refused** | Pastikan LM Studio running di `localhost:1234`, CORS enabled. |
