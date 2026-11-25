# 🛡️ Guardian Server — Advanced Discord Management Engine

Bot manajemen & keamanan Discord all-in-one berbasis **Node.js** dan **discord.js v14**.
Dirancang untuk menjaga stabilitas server 24/7: proteksi anti-link, sistem verifikasi,
disaster recovery (snapshot & restore), telemetri status real-time, siaran (broadcast),
hingga protokol karantina global (lockdown) yang persisten.

> Engine Version: **5.3.0** · Runtime Target: **Node.js v25+**

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
| --- | --- |
| 🛡️ **Anti-Link Protocol** | Deteksi & hapus otomatis pesan berisi URL / undangan Discord ilegal (kecuali Owner & Administrator). |
| 🛡️ **Anti-Spam Protocol** | Deteksi pesan flood & sistem strike (timeout bertingkat); **tidak aktif otomatis** — hanya aktif jika diaktifkan via `/protection`. |
| 🤖 **Bot Catcher** | Designate a channel where any user message triggers a direct message and kick attempt. The configured security log records the result, and the panel shows that server's total successful Bot Catcher kicks. Messages from the previous 10 minutes are deleted only in that server's message-enabled channels and threads. |
| 📦 **Disaster Recovery** | Snapshot arsitektur server (channel + role + permission) lalu restore kapan saja. Maks. 5 backup/server. |
| 🔐 **Verification Gateway** | Panel tombol VERIFY; memberi role otomatis dan menyinkronkan nickname menjadi `[MEMBER] ...`. |
| 👋 **Welcome / Goodbye UI** | Embed otomatis saat member masuk/keluar server. |
| 📋 **Security Log** | Audit trail pesan dihapus/diubah, serta aktivitas voice (join / leave / pindah channel). |
| 🔊 **24/7 Voice Uplink** | Bot menetap di voice channel; daemon auto-reconnect tiap 5 detik + resume otomatis saat restart. |
| 📊 **Server Status UI** | 3 voice channel statistik (Member / Roles / Boosts) yang diperbarui otomatis. |
| 📡 **Broadcast Matrix** | Kirim pengumuman berprioritas (Critical/Update/Info) dengan UI embed + Modal editor teks. |
| 🛟 **Support Center** | Panel tombol Support → pilih kategori → Private Thread (ticket) otomatis + invoice & transcript chat ke DM saat ticket ditutup. |
| ☢️ **Global Lockdown** | Bekukan seluruh interaksi publik secara persisten — tetap terkunci walau bot di-restart. |
| ⚙️ **Telemetri /status** | Diagnostik hardware (CPU, RAM, uptime), antrean task, dan statistik server. |
| 🧠 **Task Queue Broker** | Antrean tugas asinkron berprioritas (HIGH/MEDIUM/LOW) untuk mencegah Discord API Rate Limit. |

---

## 🚀 Cara Menjalankan

### 1. Prasyarat
- [Node.js](https://nodejs.org/) **v25 atau lebih baru** (lihat `engines` di `package.json`).
- Discord Application dengan token bot aktif.
- Aktifkan **Privileged Gateway Intents** di Developer Portal:
  - `SERVER MEMBERS INTENT` *(Guild Members)*
  - `MESSAGE CONTENT INTENT` *(Message Content)*

### 2. Install dependensi
```bash
npm install
```

### 3. Konfigurasi `.env`
Buat file `.env` di folder project (sudah otomatis diabaikan oleh git):
```
BOT_TOKEN=token_bot_kamu_disini
```

### 4. Jalankan bot
```bash
npm start
```

Bot akan otomatis menyinkronkan seluruh **Slash Command** ke Discord saat pertama kali online.

---

## 🎮 Daftar Perintah (Slash Commands)

### 🔓 Publik
| Perintah | Fungsi |
| --- | --- |
| `/status` | Menampilkan telemetri hardware & diagnostik engine. |

### 🛡️ Proteksi & Konfigurasi
| Perintah | Izin | Fungsi |
| --- | --- | --- |
| `/protection module:anti_link\|anti_spam` | Administrator | **Mengaktifkan** modul proteksi (Anti-Link / Anti-Spam) di server — cukup kirim perintah ini, modul otomatis aktif. Untuk **menonaktifkan** gunakan `/disable module:anti_link\|anti_spam`. Modul proteksi **tidak pernah aktif otomatis** saat bot bergabung ke server. |
| `/protection module:bot_catcher channel:<#channel>` | Administrator | Enables the Bot Catcher in the selected channel. Kick results are reported to the configured `log` channel and successful kicks are added to that server's counter. Messages from the previous 10 minutes are deleted only in the server where the violation happened. Disable it with `/disable module:bot_catcher`. |
| `/set feature:<...> channel:<#channel> [role]` | Owner + Administrator | Menautkan fitur ke channel: `welcome`, `goodbye`, `verify`, `log`, `vc`, `status_server`. |
| `/set feature:support_panel channel:<#channel>` | Moderator / Owner | Deploy panel Support Center ke channel (Private Thread ticket dibuat dari channel ini). |
| `/disable module:<...>` | Owner + Administrator | Menonaktifkan modul yang sudah di-*set* / di-*protection* dan menghapus konfigurasinya dari database (module: `welcome`, `goodbye`, `verify`, `log`, `vc`, `status_server`, `support_panel`, `anti_link`, `anti_spam`, `bot_catcher`). Aksi tetap tercatat di History Database. |
| `/snapshot create` | Owner + Administrator | Membuat backup penuh arsitektur server. |
| `/snapshot list` | Owner + Administrator | Menampilkan daftar snapshot yang tersimpan. |
| `/snapshot restore <snapshot_id>` | Owner + Administrator | ⚠️ Merekonstruksi ulang channel & role dari snapshot (diproses di latar belakang). |
| `/role target_role:<role> member:<user>` | Server Owner | Memberi role sekaligus mengganti nickname menjadi `[NamaRole] ...`. |

> 🛟 **Super Admin (Owner Bot):** User dengan ID `SUPER_ADMIN_ID` (hardcode di `index.js`) memiliki **otoritas absolut** dan otomatis melewati semua gerbang **Server Owner / Administrator** di semua perintah di atas, di server mana pun bot berada. Super Admin juga **kebal (immune)** terhadap modul **Anti-Link** dan **Anti-Spam** di semua server.

### 📢 Manajemen & Moderasi *(khusus **Server Owner**)*
| Perintah | Fungsi |
| --- | --- |
| `/broadcast target_channel:<#channel> [priority] [image_url] [ping_everyone] [title] [message]` | Siaran pengumuman; kosongkan `title`/`message` untuk membuka editor Modal. |
| `/clear amount:<1-100>` | Menghapus massal pesan di channel. |
| `/kick target:<user>` | Mengeluarkan member. |
| `/ban target:<user> [reason]` | Memblokir permanen member. |
| `/timeout target:<user> duration:<menit>` | Membekukan komunikasi member sementara. |

### ☢️ Darurat
| Perintah | Fungsi |
| --- | --- |
| `/lockdown mode:<true/false>` | ⚠️ Mengunci/menormalisasi seluruh sistem. Hanya bisa dijalankan **Server Owner** yang juga terdaftar sebagai Komandan (ID di-hardcode di `index.js` sebagai `LOCKDOWN_COMMANDER_ID`), atau **Super Admin** (`SUPER_ADMIN_ID`). |

> ⚠️ **Catatan penting:** Saat **Lockdown aktif**, seluruh interaksi publik (slash command, tombol, modal) ikut dibekukan, kecuali entitas dalam `LOCKDOWN_BYPASS_WHITELIST`.

---

## 📂 Struktur Project

```
├── index.js                  → Mesin utama bot (semua logika di satu file)
├── database.json             → Konfigurasi per-server (dibuat otomatis)
├── History Databases.json    → Audit trail histori perubahan (dibuat otomatis)
├── Backup_Matrix.json        → Penyimpanan snapshot backup (dibuat otomatis)
├── Logo/                     → Aset logo bot
├── package.json
├── package-lock.json
├── renovate.json             → Konfigurasi Renovate (auto-update dependency)
└── .env                      → Token & rahasia (JANGAN di-commit)
```

### Penyimpanan Data
- **`database.json`** — menyimpan konfigurasi tiap server (welcome channel, verify role,
  log channel, vc channel, status channels, modul proteksi termasuk Bot Catcher, dan state lockdown global).
- **`History Databases.json`** — log audit forensik setiap perubahan konfigurasi.
- **`Backup_Matrix.json`** — arsip snapshot disaster recovery (maks. 5 per server).

Ketiga file dibuat ulang secara otomatis jika tidak ditemukan, jadi aman untuk dihapus bila ingin memulai dari nol.

---

## 🛠️ Konfigurasi Tingkat Lanjut

Beberapa ID penting di-hardcode di bagian atas `index.js` — sesuaikan sebelum produksi:

| Konstanta | Fungsi |
| --- | --- |
| `GLOBAL_LOG_CHANNEL` | Channel global untuk notifikasi server baru bergabung. |
| `LOCKDOWN_COMMANDER_ID` | Satu-satunya user yang boleh menjalankan `/lockdown` (di samping Super Admin). |
| `SUPER_ADMIN_ID` | ID Super Admin (pemilik bot) — bypass semua gerbang Server Owner / Administrator di semua server. |
| `LOCKDOWN_BYPASS_WHITELIST` | Daftar user yang kebal saat lockdown aktif. |
| `LOCKDOWN_ALERT_CHANNEL_ID` | Channel tujuan sinyal peringatan lockdown otomatis. |

### Izin Bot (rekomendasi)
Berikan role bot permission **Administrator** agar seluruh modul berfungsi penuh
(mengelola channel, role, member, menghapus pesan, koneksi voice, dll). Pastikan role bot
berada **di atas** role yang ingin dikelola (role hierarchy).

---

## 🧠 Arsitektur Internal

- **Single-Instance RAM Cache** — database dibaca sekali ke memori dan disinkronkan
  ke disk secara asinkron untuk menghindari kebocoran RAM.
- **Titanium Task Queue Broker** — antrean tugas berprioritas dengan histori terbatas;
  mencegah bottleneck & Rate Limit (429) pada operasi masif seperti restore snapshot.
- **Auto-Reconnect Daemon** — memonitor koneksi voice tiap 5 detik.
- **Anti-Crash Kernel** — menangkap `unhandledRejection`, `uncaughtException`, dan
  memfilter warning palsu agar proses tidak mati mendadak.
- **Cache Purge Daemon** — membersihkan entri cache anti-spam yang kedaluwarsa secara berkala.

---

## 🧪 Uji Coba / Development

```bash
# Cek sintaks file utama tanpa menjalankan bot
node --check index.js

# Jalankan dengan timeout untuk boot test tanpa login Discord
BOT_TOKEN=test timeout 10 node index.js
```

> Pastikan environment `BOT_TOKEN` terisi saat menjalankan bot sungguhan.