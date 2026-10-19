# usage-monitor

Kartu mengambang (always-on-top) untuk Windows yang menampilkan:

- **Limit asli Claude Code**: persen pemakaian 5 jam dan 7 hari + waktu reset (Pro/Max)
- **Estimasi biaya** pemakaian dari log lokal, dengan progress bar terhadap budget
- **Sesi Claude Code yang sedang berjalan** dan statusnya (bekerja / butuh izin / menunggu)

## Pasang

Butuh Node.js 18+ dan Claude Code.

```
git clone <url-repo> usage-monitor
cd usage-monitor
npm install
npm link            # opsional: membuat perintah `monitor` global
monitor install     # memasang hooks + statusLine ke ~/.claude/settings.json
monitor start
```

Tanpa `npm link`, pakai `npm run setup` dan `npm start` dari dalam folder ini.

Kalau perintah `monitor` tidak dikenali setelah `npm link`, tambahkan `%APPDATA%\npm` ke PATH user lalu buka terminal baru.

## Perintah

| Perintah | Fungsi |
|---|---|
| `monitor start` | Menjalankan kartu (terminal langsung bebas) |
| `monitor install` | Menulis hooks dan `statusLine` ke `~/.claude/settings.json` |
| `monitor install --force` | Sama, tapi mengganti `statusLine` milik script lain |
| `monitor uninstall` | Menghapus entri usage-monitor dari settings |

`monitor install` memakai path folder tempat repo berada, aman dijalankan ulang, dan tidak menyentuh entri
lain di settings. Salinan settings asli disimpan sekali di `settings.json.usage-monitor.bak`.
Kalau repo dipindah, jalankan `monitor install` lagi.

## Konfigurasi

`config.json` berisi budget dolar yang dipakai progress bar saat data limit asli belum ada:

```json
{ "budgetUsd": { "last5h": 25, "today": 50, "last7d": 200 } }
```

## Catatan

- Persen limit asli hanya ada untuk langganan claude.ai Pro/Max, dan hanya diperbarui saat ada sesi Claude Code aktif.
- Biaya adalah estimasi harga API (`pricing.js`), bukan tagihan.
- Sesi yang sudah terbuka sebelum `monitor install` baru terdeteksi setelah di-restart.
- Hanya Windows: deteksi proses sesi memakai PowerShell/CIM.
