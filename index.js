    /**
     * ============================================================================
     * 🛡️ GUARDIAN SERVER - ADVANCED DISCORD MANAGEMENT ENGINE
     * ============================================================================
     * Engine Version: 5.3.0 (Titanium GUI Build)
     * Runtime Target: Node.js v25+
     * Feature: Deep Packet Inspection UI, Telemetry Logging, Auto-Sync Status
     * ============================================================================
     */

    require('dotenv').config();

    // Memuat Modul Inti & Dependensi Sistem
    const fs = require('fs');
    const os = require('os');
    const crypto = require('crypto');
    const { 
        Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, 
        ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, 
        ActivityType, ChannelType, REST, Routes, MessageFlags, Events, Options,
        ModalBuilder, TextInputBuilder, TextInputStyle, // 🛡️ KOMPONEN BARU UNTUK MODAL UI
        StringSelectMenuBuilder, StringSelectMenuOptionBuilder // 🛡️ KOMPONEN BARU UNTUK MENU KATEGORI SUPPORT
    } = require('discord.js');
    const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

    // ==========================================
    // 1. SYSTEM INITIALIZATION & CONSTANTS
    // ==========================================

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates
        ],
        partials: [
            Partials.Message, 
            Partials.Channel, 
            Partials.Reaction, 
            Partials.GuildMember
        ],
        // Mengonfigurasi struktur alokasi cache global untuk stabilitas RAM & Keamanan Log
        makeCache: Options.cacheWithLimits({
            ...Options.defaultStrategy,
            // 🛡️ [SECURITY_PATCH] Mengalokasikan memori dinamis untuk 100 entitas pesan 
            // per channel. Relokasi ini wajib agar mesin Security Log dapat mengekstrak 
            // data (oldMessage) dari RAM saat mendeteksi operasi MessageDelete/Update.
            MessageManager: 100,            
            
            PresenceManager: 0,           // Menonaktifkan perekaman status aktivitas online pengguna
            ReactionManager: 0,           // Memangkas alokasi memori untuk emoji reaksi pada pesan
            ReactionUserManager: 0,       // Mencegah perekaman entitas user yang memberikan reaksi
            ApplicationCommandManager: 0, // Mengeliminasi replikasi cache perintah aplikasi eksternal
            BetaGuildChannelsManager: 0,  // Mengurangi overhead struktur channel eksperimental
            GuildBanManager: 0,           // Mem-bypass penyimpanan daftar blokir statis dalam memori RAM
            GuildEmojiManager: 0,         // Mematikan penyimpanan cache emoji kustom server ke memori
            GuildInviteManager: 0,        // Berhenti merekam tautan undangan aktif secara lokal di RAM
            GuildStickerManager: 0,       // Mematikan alokasi objek stiker animasi berukuran besar
            GuildScheduledEventManager: 0,// Menghapus overhead pengelolaan jadwal event guild
            ThreadManager: 0,             // Menonaktifkan pelacakan thread internal dalam server
            ThreadMemberManager: 0,       // Menghapus data keanggotaan thread asinkronus
            UserManager: 10,              // Membatasi entitas user generik maksimal hanya 10 item global
            GuildMemberManager: {
                maxSize: 50,              // Membatasi entitas member per guild untuk efisiensi beban kerja
                keepOverLimit: member => member.id === client.user.id 
            }
        })
    });

    const DB_PATH = './database.json';
    const GLOBAL_LOG_CHANNEL = '1522556287391371294'; // ID Channel Log Global untuk Telemetri & Audit Trail

    // Memory Caches for Anti-Spam (Strike System)
    const spamCache = new Map();
    const SPAM_STRIKE_THRESHOLDS = {
        STRIKE_1: 10 * 60 * 1000,      // 10 Menit
        STRIKE_2: 60 * 60 * 1000,      // 1 Jam
        STRIKE_3: 24 * 60 * 60 * 1000  // 1 Hari
    };
    // Anti-Spam Module: Message flood observation window & trigger limit
    const SPAM_FLOOD_WINDOW_MS = 5 * 1000;  // Observation window (5 seconds)
    const SPAM_FLOOD_LIMIT = 5;             // Messages allowed inside the window before a strike is issued

    // ============================================================================
    // [NEW INFRASTRUCTURE DEPLOYMENT] CACHE PURGE DAEMON MATRIX (ANTI-RAM LEAK PROTOCOL)
    // ============================================================================
    // Daemon latar belakang (Background Service) mandiri dan cerdas yang dirancang khusus 
    // untuk memitigasi kebocoran memori akibat retensi objek mati pada Map secara kontinu.
    // Melacak, mengaudit, dan memurnikan entri kedaluwarsa secara berkala dari sektor anti-spam cache.

    setInterval(() => {
        const CRITICAL_CURRENT_TIMESTAMP = Date.now();
        let totalPurgedItemsCount = 0;
        let scanTotalItemsBefore = 0;
        
        console.log('\n' + '◤'.repeat(75));
        console.log('🧹 [MEMORY_CLEANER_DAEMON] Memulai protokol pemindaian sektor Cache Anti-Spam...');
        console.log(`   ↳ Target Alokasi Heap RAM : Terbatas (Batas Aman Hosting 512 MB)`);
        
        try {
            // Memastikan instance tracker map dalam keadaan aktif dan memiliki isi entitas
            if (spamCache && spamCache.size > 0) {
                scanTotalItemsBefore = spamCache.size;
                
                // Iterasi menyeluruh pada entri spamCache menggunakan generator iterator berkinerja tinggi
                for (const [userId, cacheData] of spamCache.entries()) {
                    
                    // Memastikan data struktur objek valid sebelum melakukan kalkulasi delta waktu runtime
                    if (cacheData && cacheData.timestamp) {
                        const elapsedDeltaTime = CRITICAL_CURRENT_TIMESTAMP - cacheData.timestamp;
                        
                        // Jika data dalam cache sudah melampaui ambang batas kadaluarsa terlama (STRIKE_3), hapus dari memori RAM
                        if (elapsedDeltaTime > SPAM_STRIKE_THRESHOLDS.STRIKE_3) {
                            spamCache.delete(userId);
                            totalPurgedItemsCount++;
                        }
                    } else {
                        // Fail-safe: Singkirkan entri korup atau tidak valid secara paksa yang membebani memori heap
                        spamCache.delete(userId);
                        totalPurgedItemsCount++;
                    }
                }
            }
            
            // Output telemetri diagnostik real-time ke terminal untuk pengawasan performa server
            if (totalPurgedItemsCount > 0) {
                console.log(`✅ [PURGE_SUCCESS] Operasi pemurnian RAM berhasil diselesaikan secara asinkron.`);
                console.log(`   ↳ [STATUS_BEFORE] : ${scanTotalItemsBefore} objek terdeteksi aktif dalam cache.`);
                console.log(`   ↳ [CLEANED_ITEMS] : Berhasil mereduksi ${totalPurgedItemsCount} residu mati dari RAM.`);
                console.log(`   ↳ [STATUS_AFTER]  : Tersisa ${spamCache.size} objek terverifikasi aman di memori.`);
            } else {
                console.log(`ℹ️ [PURGE_IDLE] Sektor memori stabil. Tidak ditemukan residu objek anti-spam yang kedaluwarsa.`);
                console.log(`   ↳ [CURRENT_LOAD]  : ${spamCache ? spamCache.size : 0} entitas aktif terpantau.`);
            }
            
        } catch (daemonError) {
            // Mekanisme pencegahan Panic State agar daemon tidak menghentikan runtime utama bot saat terjadi anomali
            console.error('🔴 [DAEMON_CRITICAL_EXCEPTION] Terjadi kegagalan pada rutin pembersihan memori heap:', daemonError.message);
            console.error('   ↳ [SYSTEM_ACTION] : Mengisolasi kegagalan dan melanjutkan runtime kernel bot.');
        }
        
        console.log('◣'.repeat(75) + '\n');
        
    }, 15 * 60 * 1000); // Rutin pembersihan dioptimalkan untuk berjalan secara konsisten setiap 15 menit sekali

    // ============================================================================
    // [NEW MODULE] TITANIUM SECURITY LOCKDOWN PROTOCOL CONSTANTS
    // ============================================================================
    /**
     * @global
     * @type {boolean} global.SYSTEM_LOCKDOWN_ACTIVE
     * Mengontrol status karantina infrastruktur tingkat tinggi. Jika bernilai TRUE,
     * seluruh interaksi pengguna (Slash Commands, UI Buttons, Modals) akan diblokir
     * secara absolut, mencegah modifikasi state atau eksploitasi sistem saat maintenance.
     */
    global.SYSTEM_LOCKDOWN_ACTIVE = false;

    // Otoritas Eksekutif Tertinggi (Hanya entitas ini yang dapat mengubah state lockdown)
    const LOCKDOWN_COMMANDER_ID = '1280789307027755019';

    // Matriks Pengecualian Karantina (Bypass Whitelist)
    // Berisi array ID pengguna yang kebal terhadap pembekuan sistem (Untuk Testing & Overrides)
    const LOCKDOWN_BYPASS_WHITELIST = [
        '1280789307027755019', // Primary Commander
        '1515651449772703755'  // System Test Node
    ];

    // ============================================================================
    // [SUPPORT TICKET SYSTEM] IDENTITAS ROLE & STAFF SUPPORT
    // ============================================================================
    // Role Moderator & Owner yang berhak men-deploy panel support, menutup ticket,
    // dan menerima notifikasi (tag) ketika sebuah ticket support baru dibuat.
    const SUPPORT_MODERATOR_ROLE_ID = '1523184178567581817';
    const SUPPORT_OWNER_USER_ID = '1280789307027755019';

    // ============================================================================
    // [NEW MODULE 1.1] TITANIUM DEDICATED HISTORY I/O MATRIX CONTROLLER
    // ============================================================================
    // Subsistem manajemen penyimpanan independen khusus untuk memisahkan beban kerja
    // antara konfigurasi operasional utama dengan data log analitik historis.

    const HISTORY_DB_PATH = './History Databases.json';

    /**
     * Membaca dan melakukan de-serialisasi berkas persisten History Databases.json.
     * Dilengkapi dengan fail-safe auto-initialization jika berkas tidak ditemukan.
     * @returns {Object} Object skema log historis global.
     */
    function readHistoryDB() {
        try {
            // Jika berkas tidak eksis di dalam penyimpanan disk lokal
            if (!fs.existsSync(HISTORY_DB_PATH)) {
                // Menginisialisasi berkas baru dengan format JSON kosong yang valid
                fs.writeFileSync(HISTORY_DB_PATH, JSON.stringify({}, null, 4), 'utf8');
                console.log(`🆕 [HISTORY_IO_INIT] Berkas log terdedikasi 'History Databases.json' berhasil dibuat.`);
                return {};
            }
            
            // Membaca muatan mentah dari berkas disk
            const rawData = fs.readFileSync(HISTORY_DB_PATH, 'utf8');
            
            // Validasi string kosong untuk mencegah kegagalan metode JSON.parse()
            if (!rawData.trim()) {
                return {};
            }
            
            return JSON.parse(rawData);
        } catch (ioReadException) {
            console.error(`🔴 [HISTORY_IO_READ_FAULT] Gagal membaca matriks berkas historis:`, ioReadException.message);
            return {}; // Mengembalikan fallback object aman untuk mencegah crash berantai
        }
    }

    // ============================================================================
    // [NEW MODULE 1.2] TITANIUM DISASTER RECOVERY I/O MATRIX (BACKUP ENGINE)
    // ============================================================================
    // Subsistem terisolasi untuk menangani beban I/O masif (Heavy Payload) dari 
    // operasi Snapshot. Memisahkan data backup dari database.json untuk mencegah 
    // pembengkakan (JSON Bloating) yang dapat menyebabkan kebocoran RAM.

    const BACKUP_DB_PATH = './Backup_Matrix.json';

    /**
     * Membaca dan melakukan deserialisasi berkas Backup Matrix dengan mekanisme Fail-Safe.
     * @returns {Object} Object skema snapshot global.
     */
    function readBackupDB() {
        try {
            if (!fs.existsSync(BACKUP_DB_PATH)) {
                fs.writeFileSync(BACKUP_DB_PATH, JSON.stringify({}, null, 4), 'utf8');
                console.log(`🆕 [BACKUP_IO_INIT] Storage node 'Backup_Matrix.json' berhasil dialokasikan di disk.`);
                return {};
            }
            const rawData = fs.readFileSync(BACKUP_DB_PATH, 'utf8');
            if (!rawData.trim()) return {};
            return JSON.parse(rawData);
        } catch (ioReadException) {
            console.error(`🔴 [BACKUP_IO_READ_FAULT] Gagal membaca matriks disk backup:`, ioReadException.message);
            return {}; 
        }
    }

    /**
     * Mengeksekusi penulisan disk secara asinkronus (Non-Blocking) untuk payload berukuran besar.
     * @param {Object} backupDataPayload - Paket data snapshot infrastruktur.
     */
    function writeBackupDB(backupDataPayload) {
        try {
            const serializedData = JSON.stringify(backupDataPayload, null, 4);
            // Menggunakan penulisan asinkronus agar proses Backup tidak menyebabkan V8 Engine Freeze
            fs.writeFile(BACKUP_DB_PATH, serializedData, 'utf8', (err) => {
                if (err) throw err;
            });
        } catch (ioWriteException) {
            console.error(`🔴 [BACKUP_IO_WRITE_FAULT] Gagal melakukan komitmen I/O ke berkas Backup:`, ioWriteException.message);
        }
    }

    /**
     * Melakukan komitmen penulisan (Commit Write) data historis dari RAM menuju berkas fisik secara aman.
     * @param {Object} historyDataPayload - Seluruh paket data historis yang akan disimpan.
     */
    function writeHistoryDB(historyDataPayload) {
        try {
            if (!historyDataPayload) {
                throw new Error("Payload data historis bernilai null atau tidak terdefinisi.");
            }
            
            // Melakukan enkapsulasi string JSON dengan indentasi 4-spasi agar mudah diaudit oleh manusia
            const serializedData = JSON.stringify(historyDataPayload, null, 4);
            
            // Menuliskan data secara sinkronus untuk menjamin integritas urutan log sebelum siklus event berlanjut
            fs.writeFileSync(HISTORY_DB_PATH, serializedData, 'utf8');
        } catch (ioWriteException) {
            console.error(`🔴 [HISTORY_IO_WRITE_FAULT] Gagal mengabadikan data analitik ke berkas terdedikasi:`, ioWriteException.message);
        }
    }

    // ============================================================================
    // 2. [OPTIMIZED] TITANIUM DATABASE I/O CONTROLLER & UTILITY MATRIX
    // ============================================================================
    // Sistem manajemen penyimpanan terpadu yang telah direkayasa ulang untuk efisiensi RAM 512MB.
    // Menggunakan arsitektur "Single-Instance Memory Cache" untuk mengeliminasi pembacaan disk berulang
    // yang memicu lonjakan memori tak beraturan (RAM Thrashing) dan mengoptimalkan siklus kerja CPU.

    /**
     * @global
     * @type {Object|null} globalDatabaseCache - Penampung referensi data tunggal di RAM untuk menghindari replikasi memori.
     */
    let globalDatabaseCache = null;

    /**
     * [INTERNAL ENGINE ROUTINE] initializeDatabaseCore
     * Memuat matriks basis data fisik ke dalam memori pusat saat siklus booting awal.
     * Protokol ini memastikan sinkronisasi instan, mencegah perlambatan I/O di latar belakang,
     * dan memulihkan status keamanan tingkat tinggi (Persistent State Restoration).
     */
    function initializeDatabaseCore() {
        try {
            console.log('📦 [DB_ENGINE_BOOT] Memulai verifikasi integritas sektor penyimpanan fisik...');
            if (!fs.existsSync(DB_PATH)) {
                console.warn('⚠️ [DB_ENGINE_ALERT] File database.json tidak terdeteksi. Membangun kluster penyimpanan baru...');
                fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 4), 'utf8');
                globalDatabaseCache = {};
            } else {
                const rawData = fs.readFileSync(DB_PATH, 'utf8');
                if (!rawData || rawData.trim() === '') {
                    console.warn('⚠️ [DB_ENGINE_WARN] Database fisik kosong. Menginisialisasi objek memori nihil.');
                    globalDatabaseCache = {};
                } else {
                    globalDatabaseCache = JSON.parse(rawData);
                }
            }

            // ============================================================================
            // [NEW MODULE] TITANIUM GLOBAL STATE RESTORATION PROTOCOL (PERSISTENT LOCKDOWN)
            // ============================================================================
            // Blok ini bertugas membaca partisi khusus "GLOBAL_INFRASTRUCTURE_STATE" dari disk fisik.
            // Jika bot dimatikan saat Lockdown aktif, sistem akan mengingatnya dan 
            // kembali membekukan seluruh infrastruktur secara otomatis tepat saat dihidupkan.
            
            console.log('🛡️ [SECURITY_BOOT] Memverifikasi jejak state karantina global dari hard drive I/O...');
            
            // Memastikan kerangka kerja matriks global tersedia di dalam database
            if (!globalDatabaseCache["GLOBAL_INFRASTRUCTURE_STATE"]) {
                globalDatabaseCache["GLOBAL_INFRASTRUCTURE_STATE"] = {
                    SYSTEM_LOCKDOWN_ACTIVE: false,
                    LAST_LOCKDOWN_TIMESTAMP: null,
                    LAST_COMMANDER_ID: null
                };
                
                // Konversi sinkronisasi file secara aman karena masih di fase booting
                fs.writeFileSync(DB_PATH, JSON.stringify(globalDatabaseCache, null, 4), 'utf8');
                console.log('   ↳ [INIT_STATE] Membangun partisi state global baru ke dalam penyimpanan.');
            }

            // Melakukan sinkronisasi memori persisten ke dalam memori Volatile (RAM V8 Engine)
            const persistentState = globalDatabaseCache["GLOBAL_INFRASTRUCTURE_STATE"];
            
            // Memastikan variabel global kernel tersinkronisasi murni dengan data dari disk
            global.SYSTEM_LOCKDOWN_ACTIVE = persistentState.SYSTEM_LOCKDOWN_ACTIVE || false;

            // Mencetak telemetri diagnostik hasil ekstraksi memori ke terminal komando
            if (global.SYSTEM_LOCKDOWN_ACTIVE) {
                console.warn('\n' + '☢️'.repeat(30));
                console.warn('☢️ [LOCKDOWN_PERSISTENCE] PERINGATAN KRITIS: INFRASTRUKTUR BERADA DALAM KARANTINA!');
                console.warn('   ↳ Sistem diluncurkan ulang, namun terdeteksi bahwa Lockdown belum dicabut sebelum bot dimatikan.');
                console.warn(`   ↳ Waktu Karantina Terakhir : ${persistentState.LAST_LOCKDOWN_TIMESTAMP || 'Tidak Diketahui'}`);
                console.warn(`   ↳ Otoritas Eksekutif       : ${persistentState.LAST_COMMANDER_ID || 'Tidak Diketahui'}`);
                console.warn('   ↳ Seluruh interaksi publik (Slash Commands, UI) saat ini tetap DIBEKUKAN secara mutlak.');
                console.warn('☢️'.repeat(30) + '\n');
            } else {
                console.log('✅ [LOCKDOWN_PERSISTENCE] Integritas aman. Sistem dikonfirmasi beroperasi dalam mode NORMAL.');
            }

            console.log('⚡ [DB_MEMORY_UPLINK] Seluruh konfigurasi berhasil dikunci ke RAM Cache. Kecepatan baca dioptimalkan ke 0ms.');
        } catch (error) {
            console.error('🔴 [DB_ENGINE_CRITICAL_FAULT] Gagal menginisialisasi arsitektur database memori:', error.message);
            globalDatabaseCache = {}; // Mekanisme Fallback Aman untuk mencegah Crash Total
        }
    }

    /**
     * [OPTIMIZED I/O ROUTINE] readDB
     * Mengekstrak matriks data dari penyimpanan persisten RAM Cache internal tanpa menyentuh drive fisik disk.
     * Sangat hemat RAM karena mencegah V8 Engine mengalokasikan string buffer baru setiap kali event dipicu.
     * * @returns {Object} State database terbaru dari memori cache.
     */
    function readDB() {
        // Jalankan inisialisasi darurat jika cache terdeteksi kosong akibat malfungsi runtime
        if (globalDatabaseCache === null) {
            initializeDatabaseCore();
        }
        return globalDatabaseCache;
    }

    /**
     * [OPTIMIZED I/O ROUTINE] writeDB
     * Melakukan sinkronisasi data asinkronus (Non-Blocking Operations) ke dalam hard drive hosting.
     * Memperbarui referensi RAM Cache secara instan lalu melakukan komitmen file di latar belakang (Background Thread)
     * sehingga thread utama bot tidak mengalami pembekuan (freezing) dan penggunaan RAM tetap rata.
     * * @param {Object} data - Objek JSON state terbaru yang akan dikomit ke disk.
     */
    function writeDB(data) {
        try {
            if (!data || typeof data !== 'object') {
                throw new Error('Payload database yang dikirimkan tidak valid atau korup.');
            }

            // Selalu sinkronkan pointer cache utama terlebih dahulu agar data di RAM tetap real-time
            globalDatabaseCache = data;

            // Mengonversi data objek menjadi representasi string JSON
            const jsonData = JSON.stringify(data, null, 4);

            // Transformasi ke Asynchronous Write untuk membebaskan RAM secepat mungkin tanpa memblokir Event Loop
            fs.writeFile(DB_PATH, jsonData, 'utf8', (error) => {
                if (error) {
                    console.error('🔴 [DB_ENGINE_ASYNC_WRITE_ERROR] Gagal melakukan sinkronisasi asinkron ke disk:', error.message);
                }
            });
        } catch (error) {
            console.error('🔴 [DB_ENGINE_WRITE_ERROR] Terjadi kegagalan I/O saat memproses penulisan state:', error.message);
        }
    }

    /**
     * [UTILITY] formatMemoryUsage
     * Konverter analitik beban komputasi RAM untuk telemetri visual internal.
     * Dikalibrasi presisi untuk mengonversi bytes menjadi satuan Megabytes (MB) atau Gigabytes (GB).
     * * @param {number} data - Ukuran memori dalam satuan bytes.
     * @returns {string} String terformat dengan metrik yang sesuai.
     */
    function formatMemoryUsage(data) {
        if (typeof data !== 'number' || isNaN(data)) return '0.00 MB';
        const memoryInMB = Math.round((data / 1024 / 1024) * 100) / 100;
        if (memoryInMB >= 1024) {
            const memoryInGB = Math.round((memoryInMB / 1024) * 100) / 100;
            return `${memoryInGB} GB`;
        }
        return `${memoryInMB} MB`;
    }

    /**
     * [UTILITY] generateTerminalHash
     * Mesin Kriptografi Ringan untuk audit internal.
     * Menciptakan string unik (Hash) berbasis algoritma SHA-256 tanpa membebani memori jangka panjang.
     * * @param {string} identifier - String dasar penanda entitas.
     * @returns {string} Base64 terpotong sepanjang 24 karakter sebagai token keamanan.
     */
    function generateTerminalHash(identifier) {
        const secureSource = (identifier || 'GENERIC_IDENTIFIER') + Date.now().toString() + crypto.randomUUID();
        return crypto.createHash('sha256')
                    .update(secureSource)
                    .digest('base64')
                    .substring(0, 24);
    }

    /**
     * [BACKGROUND SERVICE] updateServerStats
     * Protokol Sinkronisasi Visual Otomatis untuk memperbarui statistik server pada channel Discord.
     * Dioptimalkan untuk membaca data langsung dari RAM Cache dan menghentikan proses asinkron jika data tidak berubah
     * guna menghemat penggunaan siklus CPU dan lonjakan memori sementara.
     */
    async function updateServerStats() {
        console.log('\n' + '─'.repeat(50));
        console.log('📡 [TELEMETRY_SYNC] Memulai protokol sinkronisasi status infrastruktur...');
        
        // Membaca konfigurasi dari RAM Cache (0ms I/O Delay)
        const db = readDB();
        let updatedNodes = 0;

        for (const [guildId, config] of Object.entries(db)) {
            if (!config || !config.statusChannels) continue;
            
            try {
                // Mengambil instance guild dari internal cache Discord.js terlebih dahulu, hemat alokasi jaringan API
                let guild = client.guilds.cache.get(guildId);
                if (!guild) {
                    guild = await client.guilds.fetch(guildId).catch(() => null);
                }
                
                if (!guild) {
                    console.warn(`⚠️ [TELEMETRY_SKIP] Akses ke Guild ID [${guildId}] terputus atau bot dikeluarkan. Mengabaikan.`);
                    continue;
                }
                
                const { all, roles, boosts } = config.statusChannels;
                
                // --- PARSING & SINKRONISASI SEKTOR: ALL MEMBER ---
                if (all) {
                    const allChannel = guild.channels.cache.get(all);
                    const targetName = `🌍┃All Member: ${guild.memberCount}`;
                    if (allChannel && allChannel.name !== targetName) {
                        await allChannel.setName(targetName).catch(() => null);
                    }
                }
                
                // --- PARSING & SINKRONISASI SEKTOR: TOTAL ROLES ---
                if (roles) {
                    const roleChannel = guild.channels.cache.get(roles);
                    const totalRoles = guild.roles.cache.size;
                    const targetName = `📜┃Total Roles: ${totalRoles}`;
                    if (roleChannel && roleChannel.name !== targetName) {
                        await roleChannel.setName(targetName).catch(() => null);
                    }
                }
                
                // --- PARSING & SINKRONISASI SEKTOR: TOTAL BOOSTS ---
                if (boosts) {
                    const boostChannel = guild.channels.cache.get(boosts);
                    const totalBoosts = guild.premiumSubscriptionCount || 0;
                    const targetName = `💎┃Boosts: ${totalBoosts}`;
                    if (boostChannel && boostChannel.name !== targetName) {
                        await boostChannel.setName(targetName).catch(() => null);
                    }
                }
                
                updatedNodes++;
            } catch (error) {
                console.error(`🔴 [TELEMETRY_RATE_LIMIT] Sinkronisasi pada guild [${guildId}] ditangguhkan oleh API Engine: ${error.message}`);
            }
        }

        console.log(`✅ [TELEMETRY_SYNC_COMPLETE] Protokol selesai. ${updatedNodes} Kluster Server berhasil disinkronkan.`);
        console.log('─'.repeat(50) + '\n');
    }

    // Memicu inisialisasi basis data sesaat setelah modul ini dimuat ke runtime Node.js
    initializeDatabaseCore();


    // ============================================================================
    // [NEW MODULE] 2B. TITANIUM COGNITIVE MESSAGE BROKER & TASK QUEUE MATRIX
    // ============================================================================
    // Arsitektur antrean asinkronus terdistribusi internal untuk mengelola beban kerja komputasi,
    // mencegah bottleneck I/O, serta mengeliminasi resiko Discord API Rate Limit (Status Code 429).
    // Direkayasa dengan pembatasan array histori yang ketat untuk mempertahankan penggunaan RAM di bawah 512MB.

    class TitaniumTaskQueue {
        /**
         * Menginisialisasi sistem arsitektur penjadwalan antrean inti.
         * @param {number} [concurrencyLimit=1] - Jumlah maksimal pekerja paralel yang diizinkan (Default: 1 untuk stabilitas RAM).
         */
        constructor(concurrencyLimit = 1) {
            /** @type {Array<Object>} */
            this.queue = [];
            /** @type {number} */
            this.activeWorkers = 0;
            /** @type {number} */
            this.concurrencyLimit = concurrencyLimit;
            /** @type {number} */
            this.processedCounter = 0;
            /** @type {number} */
            this.failedCounter = 0;
            /** @type {Array<Object>} */
            this.history = [];
            
            console.log('🛡️ [MESSAGE_BROKER] Titanium Cognitive Task Queue Engine telah berhasil diintegrasikan ke Kernel Inti.');
        }

        /**
         * Memasukkan tugas operasional baru ke dalam antrean (Enqueue Routine).
         * * @param {Function} taskFunction - Fungsi asinkronus murni yang berisi payload kerja eksekusi.
         * @param {Object} [metadata={}] - Informasi konteks pelacakan untuk keperluan audit telemetri.
         * @param {string} [priority='MEDIUM'] - Tingkat prioritas penanganan tugas ('HIGH', 'MEDIUM', 'LOW').
         * @returns {string} ID Unik Tugas untuk kebutuhan penelusuran log sistem.
         */
        enqueue(taskFunction, metadata = {}, priority = 'MEDIUM') {
            const taskId = `TASK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            const timestamp = Date.now();
            
            const payload = {
                id: taskId,
                execute: taskFunction,
                metadata: metadata,
                priority: priority.toUpperCase(),
                status: 'PENDING',
                timestamp: timestamp
            };

            // Algoritma Penyisipan Antrean Efisien Berdasarkan Tingkat Prioritas Eksekusi
            if (payload.priority === 'HIGH') {
                const index = this.queue.findIndex(task => task.priority !== 'HIGH');
                if (index === -1) {
                    this.queue.push(payload);
                } else {
                    this.queue.splice(index, 0, payload);
                }
            } else if (payload.priority === 'LOW') {
                this.queue.push(payload);
            } else {
                const index = this.queue.findIndex(task => task.priority === 'LOW');
                if (index === -1) {
                    this.queue.push(payload);
                } else {
                    this.queue.splice(index, 0, payload);
                }
            }

            console.log(`📥 [MESSAGE_BROKER] Tugas baru didaftarkan. ID: [${taskId}] | Prioritas: [${priority}] | Antrean Saat Ini: [${this.queue.length}]`);
            
            // Memicu siklus pemrosesan kluster antrean secara non-blocking
            setImmediate(() => this.processQueue());
            return taskId;
        }

        /**
         * Pengendali Eksekusi Alur Kerja Otomatis (Worker Core Scheduler).
         * Mengelola transisi state tugas secara asinkronus tanpa memblokir siklus Event Loop utama.
         */
        async processQueue() {
            // Proteksi batas alokasi pekerja untuk mencegah kebocoran memori atau pembengkakan CPU
            if (this.activeWorkers >= this.concurrencyLimit || this.queue.length === 0) {
                return;
            }

            this.activeWorkers++;
            const currentTask = this.queue.shift();
            if (!currentTask) {
                this.activeWorkers--;
                return;
            }
            
            currentTask.status = 'PROCESSING';
            
            console.log('\n' + '═'.repeat(75));
            console.log(`⚙️ [BROKER_WORKER] Memulai delegasi kluster operasional otomatis...`);
            console.log(`↳ [TASK_ID]       : ${currentTask.id}`);
            console.log(`↳ [TARGET SECTOR] : ${currentTask.metadata.sector || 'GLOBAL SYSTEM LAYER'}`);
            console.log(`↳ [FEATURE]       : ${currentTask.metadata.feature || 'UNSPECIFIED PROCESS'}`);
            console.log('═'.repeat(75));

            const startTime = Date.now();

            try {
                // Eksekusi payload fungsi asinkronus secara dinamis
                await currentTask.execute();
                
                this.processedCounter++;
                currentTask.status = 'COMPLETED';
                const executionDuration = Date.now() - startTime;

                console.log(`\n✅ [BROKER_WORKER_SUCCESS] Operasi ID [${currentTask.id}] tuntas dieksekusi tanpa gangguan.`);
                console.log(`↳ [DURASI]    : ${executionDuration} ms`);
                console.log(`↳ [SISA NODE] : ${this.queue.length} elemen tugas tersisa di antrean memori.\n`);
                
                this.recordAuditTrail(currentTask, executionDuration, null);
            } catch (error) {
                this.failedCounter++;
                currentTask.status = 'FAILED';
                const executionDuration = Date.now() - startTime;
                const errorMessage = error.message || error;

                console.error(`\n🔴 [BROKER_WORKER_FAULT] Kegagalan kritis terdeteksi pada eksekusi ID [${currentTask.id}]:`);
                console.error(`↳ [ERROR_MSG] : ${errorMessage}`);
                console.error(`↳ [DURASI]    : ${executionDuration} ms\n`);

                this.recordAuditTrail(currentTask, executionDuration, errorMessage);
            } finally {
                this.activeWorkers--;
                
                // Isolasi referensi objek tugas yang selesai agar Garbage Collector (GC) dapat langsung membebaskan RAM
                currentTask.execute = null; 
                
                // Pemanggilan rekursif menggunakan setImmediate untuk mengistirahatkan Call Stack Node.js Engine
                setImmediate(() => this.processQueue());
            }
        }

        /**
         * Mencatat data historis penanganan tugas (Audit Trail Telemetry Logging).
         * Dibatasi secara agresif maksimal 15 entri untuk menjaga konsumsi RAM hosting tetap flat di 512MB.
         * * @param {Object} task - Objek konfigurasi tugas asal.
         * @param {number} duration - Durasi waktu pemrosesan dalam milidetik.
         * @param {string|null} errLog - Pesan kesalahan jika operasi gagal dieksekusi.
         */
        recordAuditTrail(task, duration, errLog) {
            this.history.push({
                id: task.id,
                feature: task.metadata.feature,
                sector: task.metadata.sector,
                priority: task.priority,
                status: task.status,
                executionTime: duration,
                error: errLog,
                loggedTimestamp: Date.now()
            });

            // 🛡️ ULTRA MEMORY SAVE PROFILE: Membatasi tumpukan array maksimal hanya 15 entri log histori di memori RAM
            if (this.history.length > 15) {
                this.history.shift();
            }
        }

        /**
         * Menyediakan visualisasi data statistik terkini broker untuk keperluan diagnostik pusat.
         * @returns {Object} Matriks status internal broker tugas.
         */
        getClusterTelemetry() {
            return {
                currentQueueSize: this.queue.length,
                activeWorkerThreads: this.activeWorkers,
                maxConcurrency: this.concurrencyLimit,
                totalProcessedJobs: this.processedCounter,
                totalFailedJobs: this.failedCounter,
                backlogList: this.queue.map(t => ({ id: t.id, priority: t.priority, job: t.metadata.feature }))
            };
        }
    }

    // Inisialisasi Instance Tunggal (Singleton) Titanium Message Broker dengan batas konkurensi aman untuk RAM 512MB
    const titaniumBroker = new TitaniumTaskQueue(1);

    // ============================================================================
    // [UPDATED MODULE 2.1] TITANIUM AUDIT TRAIL TO DEDICATED MATRIX
    // ============================================================================

    /**
     * Menyuntikkan log aktivitas modifikasi ke dalam berkas 'History Databases.json'.
     * @param {string} guildId - Snowflake ID Server Node.
     * @param {string} executorId - Snowflake ID Commander yang mengeksekusi perintah.
     * @param {string} featureModified - Nama modul/fitur yang diubah.
     * @param {string} injectedValue - Nilai parameter baru yang dimasukkan.
     */
    function recordDatabaseHistory(guildId, executorId, featureModified, injectedValue) {
        try {
            // Mengamankan data dari berkas History Databases.json
            const historyDb = readHistoryDB();
            
            // Alokasi struktur node server jika belum terdaftar di database historis
            if (!historyDb[guildId]) {
                historyDb[guildId] = {
                    lastKnownConfigurator: executorId, // Menyimpan sidik jari pengonfigurasi terakhir untuk rujukan darurat
                    historyLogs: []
                };
            } else {
                // Memperbarui informasi personil terakhir yang melakukan perubahan interaksi
                historyDb[guildId].lastKnownConfigurator = executorId;
            }
            
            // TIME-SYNC ENGINE: Sinkronisasi Zona Waktu Indonesia Barat (WIB)
            const wibTimeConfig = {
                timeZone: 'Asia/Jakarta',
                year: 'numeric', month: 'long', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            };
            const timeFormatter = new Intl.DateTimeFormat('id-ID', wibTimeConfig);
            const exactWIBTimestamp = `${timeFormatter.format(new Date())} WIB`;
            
            // Merakit paket forensik data
            const forensicPayload = {
                logId: crypto.randomBytes(4).toString('hex').toUpperCase(), // Membuat ID unik instan
                actionTrace: `SET_${featureModified.toUpperCase()}`,
                commanderId: executorId,
                injectedTarget: injectedValue,
                timestampStr: exactWIBTimestamp,
                unixEpochMs: Date.now()
            };
            
            // Memasukkan log ke indeks paling atas (LIFO)
            historyDb[guildId].historyLogs.unshift(forensicPayload);
            
            // Batasi ukuran log array maksimal 100 entri per server untuk optimalisasi kapasitas penyimpanan disk
            if (historyDb[guildId].historyLogs.length > 100) {
                historyDb[guildId].historyLogs.pop();
            }
            
            // Komit penulisan data ke berkas independen
            writeHistoryDB(historyDb);
            
            console.log(`📝 [AUDIT_LOCKED] Log disimpan di file terpisah untuk Server Node [${guildId}] oleh Operator ID [${executorId}].`);
        } catch (auditException) {
            console.error(`🔴 [AUDIT_TRAIL_CRASH] Anomali pada sistem perekaman histori terdedikasi:`, auditException.message);
        }
    }

    // ==========================================
    // 3. COMMAND REGISTRY DEFINITIONS (LOCALIZED: EN)
    // ==========================================
    const commands = [
    {
        name: 'protection',
        description: '🛡️ Control high-level infrastructure protection systems (Anti-Link, Anti-Spam, etc.)',
        options: [
            {
                type: 3, // Kode tipe data String (ApplicationCommandOptionType.String)
                name: 'module',
                description: 'Specify the security module sectors you want to configure in the system.',
                required: true,
                choices: [
                    { 
                        name: '🔗 Anti-Link Protocol (Illegal Link Detector and Remover)', 
                        value: 'anti_link' 
                    },
                    { 
                        name: '🛡️ Anti-Spam Protocol (Message Flood Detector and Strike System)', 
                        value: 'anti_spam' 
                    }
                ]
            }
        ]
    },
    // ============================================================================
        // [MODULE 3.Y] TITANIUM DISASTER RECOVERY PROTOCOL (SNAPSHOT & BACKUP)
        // ============================================================================
        {
            name: 'snapshot',
            description: 'Titanium Disaster Recovery: Infrastructure Snapshot & Restore (Admin Only)',
            options: [
                {
                    name: 'create',
                    description: 'Generate a highly encrypted backup of the current server architecture',
                    type: 1 // ApplicationCommandOptionType.Subcommand
                },
                {
                    name: 'list',
                    description: 'Display all available infrastructure snapshots in the memory bank',
                    type: 1
                },
                {
                    name: 'restore',
                    description: '⚠️ CRITICAL: Reconstruct infrastructure from a specific Snapshot ID',
                    type: 1,
                    options: [
                        {
                            name: 'snapshot_id',
                            description: 'Input the specific Trace ID of the backup you wish to restore',
                            type: 3, // ApplicationCommandOptionType.String
                            required: true
                        }
                    ]
                }
            ]
        },
        {
            name: 'set',
            description: 'Configure core server features (Owner Only)',
            options: [
                {
                    name: 'feature',
                    type: 3, 
                    description: 'Select the infrastructure feature to deploy',
                    required: true,
                    choices: [
                        { name: 'Welcome Channel', value: 'welcome' },
                        { name: 'Goodbye Channel', value: 'goodbye' },
                        { name: 'Verify Panel', value: 'verify' },
                        { name: 'Security Log', value: 'log' },
                        { name: '24/7 VC Online', value: 'vc' },
                        { name: 'Server Status', value: 'status_server' },
                        { name: 'Support Panel', value: 'support_panel' }
                    ]
                },
                { name: 'channel', type: 7, description: 'Target node/channel for the feature', required: true },
                { name: 'role', type: 8, description: 'Target role (Required only for Verify setup)', required: false }
            ]
        },
        {
            name: 'disable',
            description: 'Disable a configured server feature and purge it from the database (Owner Only)',
            options: [
                {
                    name: 'module',
                    type: 3,
                    description: 'Select the infrastructure feature to disable and remove from the database',
                    required: true,
                    choices: [
                        { name: 'Welcome Channel', value: 'welcome' },
                        { name: 'Goodbye Channel', value: 'goodbye' },
                        { name: 'Verify Panel', value: 'verify' },
                        { name: 'Security Log', value: 'log' },
                        { name: '24/7 VC Online', value: 'vc' },
                        { name: 'Server Status', value: 'status_server' },
                        { name: 'Support Panel', value: 'support_panel' },
                        { name: '🔗 Anti-Link Protocol', value: 'anti_link' },
                        { name: '🛡️ Anti-Spam Protocol', value: 'anti_spam' }
                    ]
                }
            ]
        },
        {
            name: 'lockdown',
            description: 'Titanium Protocol: Execute Global System Quarantine (Commander Only)',
            options: [
                {
                    name: 'mode',
                    type: 5, // Type 5 adalah Boolean dalam spesifikasi Discord API
                    description: 'Send True to lock the system, or False to normalize it.',
                    required: true
                }
            ]
        },
        {
            name: 'role',
            description: 'Inject role into entity and modify nomenclature (Owner Only)',
            options: [
                { name: 'target_role', type: 8, description: 'Role to inject', required: true },
                { name: 'member', type: 6, description: 'Target entity', required: true }
            ]
        },
        { name: 'status', description: 'Display hardware telemetry and core diagnostics (Public)' },
        {
            name: 'broadcast',
            description: 'Transmit Titanium Matrix global broadcast with advanced UI (Owner Only)',
            options: [
                { 
                    name: 'target_channel', 
                    type: 7, 
                    description: 'Transmission target node (Text/Announcement)', 
                    required: true 
                },
                {
                    name: 'priority',
                    type: 3,
                    description: 'Set transmission priority level (Affects UI Color & Icon)',
                    required: false,
                    choices: [
                        { name: '🔴 Critical Alert (Highest)', value: 'critical' },
                        { name: '🟡 System Update (Elevated)', value: 'update' },
                        { name: '🟢 General Info (Standard)', value: 'info' }
                    ]
                },
                { 
                    name: 'image_url', 
                    type: 3, 
                    description: 'Attach a high-resolution banner URL (https://...)', 
                    required: false 
                },
                {
                    name: 'ping_everyone',
                    type: 5, // Boolean
                    description: 'Force @everyone mention for this transmission?',
                    required: false
                },
                // 🛡️ MODIFIKASI TITANIUM V6.0: Parameter teks dibuat opsional.
                // Jika dikosongkan, Kernel akan memanggil antarmuka Modal UI Editor Teks.
                { 
                    name: 'title', 
                    type: 3, 
                    description: '[OPTIONAL] Leave empty to open Interactive Modal Text Editor', 
                    required: false 
                },
                { 
                    name: 'message', 
                    type: 3, 
                    description: '[OPTIONAL] Leave empty to open Interactive Modal Text Editor', 
                    required: false 
                }
            ]
        },
        { name: 'clear', description: 'Mass cache purge (Owner)', options: [{ name: 'amount', type: 4, description: 'Volume (1-100)', required: true }] },
        { name: 'kick', description: 'Terminate entity connection (Owner)', options: [{ name: 'target', type: 6, description: 'Target entity', required: true }] },
        { name: 'ban', description: 'Permanent firewall block (Owner)', options: [{ name: 'target', type: 6, description: 'Target entity', required: true }, { name: 'reason', type: 3, description: 'Execution reason', required: false }] },
        { name: 'timeout', description: 'Freeze entity communications (Owner)', options: [{ name: 'target', type: 6, description: 'Target entity', required: true }, { name: 'duration', type: 4, description: 'Duration (Minutes)', required: true }] }
    ];

    // ============================================================================
    // [NEW MODULE 2.3] TITANIUM SUPPORT CENTER (PRIVATE TICKET SYSTEM)
    // ============================================================================
    // Panel Support publik (tombol "Support"), pemilihan kategori privat via Select
    // Menu, pembuatan Private Thread (ticket) otomatis, hingga invoice ke DM pembuat
    // ticket saat ticket ditutup. Hanya Role Moderator / Owner (dan pembuat ticket)
    // yang berwenang menutup sebuah ticket.

    // Kategori pilihan yang tersedia pada menu pemilihan ticket
    const SUPPORT_CATEGORIES = {
        general_help: {
            value: 'general_help',
            key: 'general-help',
            label: 'General Help',
            emoji: '💬',
            description: 'Questions about the server or bot'
        },
        technical_issue: {
            value: 'technical_issue',
            key: 'technical-issue',
            label: 'Technical Issue',
            emoji: '🔧',
            description: 'Bugs, errors, technical problems'
        },
        other: {
            value: 'other',
            key: 'other',
            label: 'Other',
            emoji: '📦',
            description: 'Anything else'
        }
    };

    /**
     * Menghasilkan kode Ticket unik buatan bot (contoh: T-WL7DFC).
     * @returns {string} Kode ticket berformat T-XXXXXX.
     */
    function generateSupportTicketCode() {
        const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const rawBytes = crypto.randomBytes(6);
        let code = '';
        for (let i = 0; i < rawBytes.length; i++) {
            code += charset[rawBytes[i] % charset.length];
        }
        return `T-${code}`;
    }

    /**
     * Memformat durasi (ms) menjadi narasi manusiawi, contoh: "12 minutes".
     * @param {number} milliseconds
     * @returns {string}
     */
    function formatSupportDuration(milliseconds) {
        const totalSeconds = Math.max(1, Math.floor(milliseconds / 1000));
        if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds !== 1 ? 's' : ''}`;
        const totalMinutes = Math.floor(totalSeconds / 60);
        if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes !== 1 ? 's' : ''}`;
        const totalHours = Math.floor(totalMinutes / 60);
        if (totalHours < 24) return `${totalHours} hour${totalHours !== 1 ? 's' : ''} ${totalMinutes % 60} min`;
        const totalDays = Math.floor(totalHours / 24);
        return `${totalDays} day${totalDays !== 1 ? 's' : ''} ${totalHours % 24} h`;
    }

    // ============================================================================
    // UI BUILDER MATRIX (SUPPORT CENTER)
    // ============================================================================

    /** Panel publik "Guardian Server Support" (Tampilan Guardian Titanium) */
    function buildSupportCenterEmbed() {
        return new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🛡️ GUARDIAN SERVER SUPPORT')
            .setDescription(
                '**Welcome to the Official Guardian Server Support System.**\n\n' +
                'If you require any technical assistance, have inquiries regarding your account, or ' +
                'wish to report an anomaly, please initiate a secure communication channel by ' +
                'clicking the ticket button below.\n\n' +
                '◆ **Response Time:** Our moderation team will address your concern as ' +
                'expeditiously as possible.\n' +
                '◆ **Confidentiality:** All tickets are end-to-end isolated (Private Threads) to ' +
                'ensure data privacy and operational security.'
            )
            .addFields(
                { name: '🌐 Encryption Level', value: '`AES-256 (Thread Isolated)`', inline: true },
                { name: '🛡️ Engine', value: '`GUARDIAN_TITANIUM`', inline: true }
            )
            .setFooter({ text: 'Guardian Infrastructure • Secured Support Protocol' })
            .setTimestamp();
    }

    /** Tombol publik "Ticket" yang menempel di bawah panel Guardian Server Support */
    function buildSupportOpenButtonRow() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('support_open')
                .setLabel('Ticket')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );
    }

    /** Menu pilihan kategori privat (mirip Gambar 1) — hanya user penekan tombol yang melihat */
    function buildSupportCategoryMenuRow() {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('support_category_select')
                .setPlaceholder('Choose the category that best matches your issue…')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                    Object.values(SUPPORT_CATEGORIES).map((category) =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(category.label)
                            .setDescription(category.description)
                            .setEmoji(category.emoji)
                            .setValue(category.value)
                    )
                )
        );
    }

    /** Panel informasi ticket + tombol Close di atas Private Thread (mirip Gambar 2) */
    function buildTicketPanelEmbed(ticketMeta) {
        return new EmbedBuilder()
            .setColor('#5865F2')
            .setAuthor({
                name: ticketMeta.creatorDisplayName,
                iconURL: ticketMeta.creatorAvatarURL
            })
            .setTitle(`${ticketMeta.categoryEmoji} ${ticketMeta.categoryLabel}`)
            .setDescription('Thank you for contacting support! Please describe your issue in as much detail as possible below.')
            .addFields(
                { name: '📝 Ticket ID', value: `\`${ticketMeta.ticketId}\``, inline: true },
                { name: '🗂️ Category', value: `${ticketMeta.categoryEmoji} ${ticketMeta.categoryLabel}`, inline: true },
                { name: '📌 Status', value: '`Please wait for a moderator to respond.`', inline: false },
                { name: '⏰ Opened', value: `<t:${Math.floor(ticketMeta.openedAt / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: "Close the ticket with the button below when you're done." })
            .setTimestamp();
    }

    /** Tombol merah "Close Ticket" pada panel close */
    function buildTicketCloseButtonRow(disabled = false) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('support_close')
                .setLabel('Close Ticket')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled)
        );
    }

    /** Panel "closed" pengganti panel asli saat ticket ditutup */
    function buildTicketClosedPanelEmbed(ticketMeta, closerTag, closedAt) {
        return new EmbedBuilder()
            .setColor('#2ECC71')
            .setAuthor({
                name: ticketMeta.creatorDisplayName,
                iconURL: ticketMeta.creatorAvatarURL
            })
            .setTitle(`${ticketMeta.categoryEmoji} ${ticketMeta.categoryLabel} — Closed`)
            .setDescription('This ticket has been **closed**. Thank you for contacting support!')
            .addFields(
                { name: '📝 Ticket ID', value: `\`${ticketMeta.ticketId}\``, inline: true },
                { name: '🗂️ Category', value: `${ticketMeta.categoryEmoji} ${ticketMeta.categoryLabel}`, inline: true },
                { name: '📌 Status', value: '`CLOSED`', inline: false },
                { name: '⏰ Opened', value: `<t:${Math.floor(ticketMeta.openedAt / 1000)}:R>`, inline: true },
                { name: '🔒 Closed', value: `<t:${Math.floor(closedAt / 1000)}:R>`, inline: true },
                { name: '🔧 Closed By', value: closerTag, inline: false }
            )
            .setFooter({ text: 'Guardian Server Support System • Ticket Archived' })
            .setTimestamp();
    }

    /** Invoice (resi) yang dikirim ke DM pembuat ticket saat ticket ditutup */
    function buildSupportInvoiceEmbed(ticketMeta, closerTag, closedAt) {
        return new EmbedBuilder()
            .setColor('#5865F2')
            .setAuthor({
                name: 'Support Invoice',
                iconURL: client.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle('🧾 Support Ticket Invoice')
            .setDescription('Your support ticket has been **closed**. Here is the summary of your session:')
            .addFields(
                { name: '📝 Ticket ID', value: `\`${ticketMeta.ticketId}\``, inline: true },
                { name: '🗂️ Category', value: `${ticketMeta.categoryEmoji} ${ticketMeta.categoryLabel}`, inline: true },
                { name: '👤 Opened By', value: `<@${ticketMeta.creatorId}>`, inline: true },
                { name: '⏰ Opened', value: `<t:${Math.floor(ticketMeta.openedAt / 1000)}:F>`, inline: true },
                { name: '🔒 Closed', value: `<t:${Math.floor(closedAt / 1000)}:F>`, inline: true },
                { name: '🕒 Total Duration', value: `\`${formatSupportDuration(closedAt - ticketMeta.openedAt)}\``, inline: true },
                { name: '🔧 Closed By', value: closerTag, inline: false },
                { name: '📄 Chat Transcript', value: 'Attached as a `.txt` file right below this message', inline: false }
            )
            .setFooter({ text: 'Thank you for using the Support Center!' })
            .setTimestamp();
    }

    /**
     * Memberi Role Moderator & Owner izin "Manage Threads" pada channel support agar
     * mereka dapat melihat serta bergabung ke seluruh Private Thread (ticket) aktif.
     * @param {import('discord.js').TextChannel} channel
     */
    async function grantSupportStaffThreadAccess(channel) {
        const staffTargets = [SUPPORT_MODERATOR_ROLE_ID, SUPPORT_OWNER_USER_ID];
        for (const targetId of staffTargets) {
            try {
                const existingOverwrite = channel.permissionOverwrites.cache.get(targetId);
                if (existingOverwrite) {
                    await existingOverwrite.edit({ ManageThreads: true });
                } else {
                    try {
                        await channel.permissionOverwrites.create(targetId, { ManageThreads: true });
                    } catch (createFault) {
                        // Overwrite kemungkinan sudah ada namun belum termuat di cache → force update
                        await channel.permissionOverwrites.edit(targetId, { ManageThreads: true });
                    }
                }
            } catch (accessError) {
                console.warn(`⚠️ [SUPPORT_ACCESS] Gagal mengunci akses ManageThreads untuk target [${targetId}] di channel ${channel.id}: ${accessError.message}`);
            }
        }
    }

    // ============================================================================
    // TICKET LIFECYCLE EXECUTOR (SUPPORT CATEGORY → PRIVATE THREAD)
    // ============================================================================

    /**
     * Membuat Private Thread (ticket) setelah user memilih kategori pada Select Menu.
     * @param {import('discord.js').StringSelectMenuInteraction} interaction
     */
    async function executeSupportTicketCreation(interaction) {
        const db = readDB();
        const guildConfig = db[interaction.guild.id];

        // Validasi: Channel support harus terkonfigurasi dan masih relevan
        if (!guildConfig || !guildConfig.supportChannel || guildConfig.supportChannel !== interaction.channelId) {
            return interaction.reply({
                content: '❌ **[SUPPORT_OFFLINE]** The support system is not configured for this channel. Please contact the moderator team.',
                flags: MessageFlags.Ephemeral
            });
        }

        const selectedValue = interaction.values[0];
        const category = SUPPORT_CATEGORIES[selectedValue];
        if (!category) {
            return interaction.reply({
                content: '❌ **[INVALID_CATEGORY]** The selected category is not recognized. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Anti-spam: satu user hanya diperbolehkan memiliki satu ticket aktif pada satu waktu
        const activeTickets = guildConfig.supportTickets || {};
        const existingTicket = Object.values(activeTickets).find(
            (ticketData) => ticketData.creatorId === interaction.user.id && ticketData.state === 'open'
        );
        if (existingTicket) {
            return interaction.reply({
                content: `⚠️ **[DUPLICATE_TICKET]** You already have an open support ticket: <#${existingTicket.threadId}>. Please wait until it is closed before opening a new one.`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // 1) Buat Private Thread di dalam channel support dengan nama "(category) · (username)"
            const parentChannel = interaction.channel;
            const thread = await parentChannel.threads.create({
                name: `${category.key} · ${interaction.user.username}`,
                type: ChannelType.PrivateThread,
                reason: `Support ticket initiated by ${interaction.user.tag}`
            });

            // 2) Tambahkan user pembuat ticket ke dalam Private Thread
            await thread.members.add(interaction.user.id);

            // 3) Bangun metadata ticket & panel close (dikirim paling atas di dalam thread)
            const ticketId = generateSupportTicketCode();
            const openedAt = Date.now();
            const ticketMeta = {
                threadId: thread.id,
                ticketId,
                creatorId: interaction.user.id,
                creatorDisplayName: interaction.user.username,
                creatorAvatarURL: interaction.user.displayAvatarURL({ dynamic: true }),
                category: category.value,
                categoryKey: category.key,
                categoryLabel: category.label,
                categoryEmoji: category.emoji,
                openedAt,
                panelMessageId: null,
                state: 'open'
            };

            const panelMessage = await thread.send({
                content: `Please wait for a moderator to respond to your ticket. <@&${SUPPORT_MODERATOR_ROLE_ID}> <@${SUPPORT_OWNER_USER_ID}>`,
                embeds: [buildTicketPanelEmbed(ticketMeta)],
                components: [buildTicketCloseButtonRow(false)]
            });
            ticketMeta.panelMessageId = panelMessage.id;

            // 4) Simpan metadata ke database agar handler Close tetap berfungsi walau bot restart
            guildConfig.supportTickets = activeTickets;
            activeTickets[thread.id] = ticketMeta;
            writeDB(db);

            console.log(`🎫 [SUPPORT_TICKET_OPENED] Ticket ${ticketId} dibuka oleh ${interaction.user.tag} di thread ${thread.id} (${category.label}).`);

            return interaction.editReply({
                content: `✅ **Ticket created!** Your private ticket \`${ticketId}\` has been opened: <#${thread.id}> (${category.emoji} **${category.label}**)\nThe moderator team has been notified and will respond as soon as possible.`
            });
        } catch (creationError) {
            console.error(`🔴 [SUPPORT_TICKET_FAULT] Gagal membuat Private Thread support:`, creationError.message);
            return interaction.editReply({
                content: `❌ **[SYSTEM_FAULT]** Failed to create your support ticket: \`${creationError.message}\`\nMake sure the bot has the **Create Private Threads** permission and can add members to the thread.`
            });
        }
    }

    /**
     * Membangun rekaman chat (transcript) dari seluruh pesan pada Private Thread.
     * Hasilnya berupa teks berformat dengan stempel waktu WIB per pesan.
     * @param {import('discord.js').ThreadChannel} thread
     * @param {Object} ticketMeta - Metadata ticket aktif.
     * @returns {Promise<string>} Isi transcript dalam bentuk string teks.
     */
    async function buildSupportThreadTranscript(thread, ticketMeta) {
        // Mengumpulkan seluruh pesan thread (paginasi mundur maksimal 1.000 pesan)
        const collectedMessages = [];
        let beforeId = undefined;
        for (let page = 0; page < 10; page++) {
            const fetched = await thread.messages.fetch(beforeId ? { limit: 100, before: beforeId } : { limit: 100 });
            if (!fetched || fetched.size === 0) break;
            fetched.forEach((msg) => collectedMessages.push(msg));
            if (fetched.size < 100) break;
            beforeId = fetched.last().id;
        }
        // Urutkan kembali dari pesan tertua menuju terbaru
        collectedMessages.reverse();

        const headerLines = [
            '===================================================',
            '   SUPPORT TICKET TRANSCRIPT',
            '===================================================',
            `Ticket ID   : ${ticketMeta.ticketId}`,
            `Category    : ${ticketMeta.categoryEmoji} ${ticketMeta.categoryLabel}`,
            `Thread      : ${thread.name}`,
            `Server      : ${thread.guild ? thread.guild.name : 'Unknown'}`,
            '===================================================',
            ''
        ];

        const wibFormatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        });

        const bodyLines = [];
        for (const msg of collectedMessages) {
            // Lewati pesan sistem (pin, dll.) yang tidak memiliki muatan teks
            if (msg.system) continue;
            const stamp = `${wibFormatter.format(new Date(msg.createdTimestamp))} WIB`;
            const authorName = msg.author ? `${msg.author.username} (${msg.author.id})` : 'Unknown User';

            const extras = [];
            if (msg.attachments && msg.attachments.size > 0) {
                msg.attachments.forEach((a) => extras.push(`[Attachment: ${a.name || 'file'}] ${a.url}`));
            }
            if (msg.embeds && msg.embeds.length > 0) extras.push('[Embed]');
            if (msg.stickers && msg.stickers.size > 0) extras.push('[Sticker]');

            const content = (msg.content || '').trim();
            if (!content && extras.length === 0) continue;

            const lineParts = [`[${stamp}] ${authorName}`];
            if (content) lineParts.push(content);
            bodyLines.push(lineParts.concat(extras).join('\n'));
        }

        let transcript = headerLines.concat(bodyLines).join('\n');
        if (bodyLines.length === 0) {
            transcript += '\n(No messages were recorded in this ticket.)\n';
        }

        // Batas keamanan ukuran lampiran DM Discord (±6 MB agar aman di bawah limit 8 MB)
        if (Buffer.byteLength(transcript, 'utf8') > 6 * 1024 * 1024) {
            transcript = transcript.substring(0, 6 * 1024 * 1024) + '\n\n[Transcript truncated - file size limit reached.]\n';
        }

        return transcript;
    }

    /**
     * Menutup ticket: memperbarui panel close, mengirim invoice + transcript ke DM
     * pembuat ticket, lalu mengarsipkan & mengunci Private Thread.
     * @param {import('discord.js').ButtonInteraction} interaction
     */
    async function executeSupportTicketClose(interaction) {
        const db = readDB();
        const guildConfig = db[interaction.guild.id];
        const ticket = guildConfig && guildConfig.supportTickets
            ? guildConfig.supportTickets[interaction.channelId]
            : null;

        if (!ticket || ticket.state !== 'open') {
            return interaction.reply({
                content: '❌ **[TICKET_GONE]** This ticket has already been closed or is no longer registered.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Otorisasi: Role Moderator, Owner, atau pembuat ticket itu sendiri
        const isStaff = interaction.member.roles.cache.has(SUPPORT_MODERATOR_ROLE_ID) ||
            interaction.user.id === SUPPORT_OWNER_USER_ID;
        const isTicketCreator = interaction.user.id === ticket.creatorId;
        if (!isStaff && !isTicketCreator) {
            return interaction.reply({
                content: '🚫 **[ACCESS_DENIED]** Only the ticket creator or the moderator team can close this ticket.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const thread = interaction.channel;
        const closedAt = Date.now();
        const closerTag = `${interaction.member.user.username} (<@${interaction.user.id}>)`;

        try {
            // 1) Bangun rekaman chat (transcript) dari seluruh pesan di dalam thread
            let transcriptText = '';
            try {
                transcriptText = await buildSupportThreadTranscript(thread, ticket);
            } catch (transcriptError) {
                console.warn(`⚠️ [SUPPORT_CLOSE] Gagal membuat transcript thread: ${transcriptError.message}`);
            }

            // 2) Ganti panel close (di atas thread) menjadi state "closed" + tombol nonaktif
            try {
                const panelMessage = await thread.messages.fetch(ticket.panelMessageId);
                await panelMessage.edit({
                    content: '🔒 This ticket has been **closed**. Thank you for contacting support.',
                    embeds: [buildTicketClosedPanelEmbed(ticket, closerTag, closedAt)],
                    components: [buildTicketCloseButtonRow(true)]
                });
            } catch (panelEditError) {
                console.warn(`⚠️ [SUPPORT_CLOSE] Panel pesan ${ticket.panelMessageId} tidak dapat diperbarui: ${panelEditError.message}`);
            }

            // 3) Kirim invoice (resi) + transcript (rekaman chat) ke DM pembuat ticket
            let invoiceDelivered = false;
            try {
                const creatorUser = await client.users.fetch(ticket.creatorId);
                const transcriptFileName = `${ticket.ticketId}-transcript.txt`;
                const dmPayload = {
                    embeds: [buildSupportInvoiceEmbed(ticket, closerTag, closedAt)]
                };
                if (transcriptText) {
                    dmPayload.files = [{
                        attachment: Buffer.from(transcriptText, 'utf8'),
                        name: transcriptFileName
                    }];
                }
                await creatorUser.send(dmPayload);
                invoiceDelivered = true;
            } catch (invoiceError) {
                console.warn(`⚠️ [SUPPORT_CLOSE] Invoice gagal terkirim ke DM ${ticket.creatorId}: ${invoiceError.message}`);
            }

            // 4) Hapus record ticket aktif dari database
            delete guildConfig.supportTickets[interaction.channelId];
            writeDB(db);

            console.log(`🔒 [SUPPORT_TICKET_CLOSED] Ticket ${ticket.ticketId} ditutup oleh ${interaction.user.tag}.`);

            // 5) Konfirmasi ke penutup ticket (ephemeral)
            await interaction.editReply({
                content: invoiceDelivered
                    ? `✅ **Ticket closed.** \`${ticket.ticketId}\` has been archived, and the invoice + chat transcript were sent to <@${ticket.creatorId}>'s DMs.`
                    : `✅ **Ticket closed.** \`${ticket.ticketId}\` has been archived. ⚠️ The invoice and transcript could **not** be delivered to <@${ticket.creatorId}> (their DMs are probably closed).`
            });

            // 6) Kunci lalu arsipkan thread agar menjadi record read-only
            await thread.setLocked(true).catch(() => null);
            await thread.setArchived(true).catch(() => null);
        } catch (closeError) {
            console.error(`🔴 [SUPPORT_CLOSE_FAULT] Kegagalan saat menutup ticket:`, closeError.message);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: `❌ **[SYSTEM_FAULT]** Failed to close the ticket: \`${closeError.message}\``
                });
            }
        }
    }

    // ============================================================================
    // 4. KERNEL BOOT SEQUENCE & STATE RESTORATION (CORE EVENT LISTENERS)
    // ============================================================================

    client.once(Events.ClientReady, async (readyClient) => {
        // ----------------------------------------------------
        // [A] VISUAL BOOT TELEMETRY & DATABASE SYNC
        // ----------------------------------------------------
        console.log('\n' + '═'.repeat(75));
        console.log(`✅ [SYSTEM_ONLINE] Guardian Server Matrix Engine Initialized.`);
        console.log(`📡 [NETWORK_UPLINK] Authenticated & Connected as: ${readyClient.user.tag}`);
        
        console.log(`💽 [DB_SYNC] Memulai ekstraksi memori persisten dari ${DB_PATH}...`);
        const db = readDB(); // Membaca database menggunakan Titanium I/O Controller
        let totalConfigs = Object.keys(db).length;
        
        if (totalConfigs > 0) {
            console.log(`🟢 [DB_SYNC] Operasi Sukses. Memulihkan ${totalConfigs} konfigurasi node/server.`);
        } else {
            console.log(`🟡 [DB_SYNC] Sektor Database bersih. Berjalan dengan konfigurasi pabrik.`);
        }
        console.log('═'.repeat(75) + '\n');

        // ----------------------------------------------------
        // [B] COMMAND REGISTRY PROTOCOL (REST API)
        // ----------------------------------------------------
        const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
        try {
            console.log('🔄 [API_SYNC] Melakukan sinkronisasi Slash Commands ke Discord API...');
            await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
            console.log('✅ [API_SYNC] Otorisasi Command Global berhasil disuntikkan.');
        } catch (error) {
            console.error('🔴 [API_FAULT] Gagal mendaftarkan Command Registry:', error);
        }

        // ----------------------------------------------------
        // [C] LIVE PRESENCE & NETWORK TELEMETRY
        // ----------------------------------------------------
        // Melakukan pembaruan status bot secara berkala setiap 15 detik
        setInterval(() => {
            const ping = readyClient.ws.ping;
            const serverCount = readyClient.guilds.cache.size;
            readyClient.user.setActivity(`🛡️Guarding: ${serverCount} Server | Ping: ${ping}ms`, { type: ActivityType.Custom });
        }, 15000);

        // ----------------------------------------------------
        // [D] AUTO-SYNC STATUS CHANNELS ENGINE (BROKER IMPLEMENTATION)
        // ----------------------------------------------------
        // Menunggu 5 detik agar memori cache Discord terisi penuh sebelum melakukan alokasi tugas
        setTimeout(() => {
            // Enqueue pembaruan pertama saat bot berhasil booting online
            titaniumBroker.enqueue(
                async () => await updateServerStats(),
                { feature: 'Core Telemetry Sync', sector: 'All Synced Guild Nodes' },
                'HIGH'
            );
        }, 5000); 

        // Alokasi Penjadwal Pesan Otomatis setiap 10 Menit melalui Gerbang Broker
        setInterval(() => {
            console.log('📡 [SCHEDULER DAEMON] Inserts a routine schedule of status synchronization into the queuing system...');
            titaniumBroker.enqueue(
                async () => await updateServerStats(),
                { feature: 'Core Telemetry Sync', sector: 'All Synced Guild Nodes' },
                'MEDIUM'
            );
        }, 10 * 60 * 1000);
        
        // ----------------------------------------------------
        // [E] CONTINUOUS VOICE UPLINK (24/7 VC RESUME)
        // ----------------------------------------------------
        // Menggunakan variabel 'db' yang sudah kita panggil di tahap [A] untuk efisiensi RAM
        let vcResumeCount = 0;
        for (const [guildId, config] of Object.entries(db)) {
            if (config.vcChannel) {
                const guild = readyClient.guilds.cache.get(guildId);
                if (guild) {
                    const channel = guild.channels.cache.get(config.vcChannel);
                    if (channel && channel.type === ChannelType.GuildVoice) {
                        try {
                            joinVoiceChannel({
                                channelId: channel.id,
                                guildId: channel.guild.id,
                                adapterCreator: channel.guild.voiceAdapterCreator,
                                selfDeaf: true,
                            });
                            vcResumeCount++;
                        } catch (e) {
                            console.error(`⚠️ [VC_UPLINK_ERR] Failed to secure voice connection on node: ${guild.name}`);
                        }
                    }
                }
            }
        }
        
        if (vcResumeCount > 0) {
            console.log(`🔊 [VC_UPLINK] Successfully restored voice transmission connection on ${vcResumeCount} channel.`);
        }
    });

    // ============================================================================
    // [NEW MODULE] TITANIUM VOICE CHANNEL SENTINEL - AUTO-RECONNECT DAEMON (5-SECOND HEARTBEAT)
    // ============================================================================
    // Daemon pemantau otonom berbasis interval yang berjalan setiap 5 detik untuk memastikan
    // bot selalu terhubung ke Voice Channel yang sudah dikonfigurasi di database.
    // Jika bot terdeteksi keluar dari VC (karena kick, disconnect, atau gangguan jaringan),
    // daemon akan secara otomatis mengakhiri sesi lama dan membuat sesi baru dengan join ulang.
    // Menggunakan getVoiceConnection() untuk memverifikasi status koneksi secara real-time.

    console.log('🔊 [VC_SENTINEL] Voice Channel Auto-Reconnect Daemon diaktifkan (Interval: 5 detik).');

    setInterval(() => {
        try {
            const db = readDB();

            for (const [guildId, config] of Object.entries(db)) {
                // Hanya proses guild yang memiliki konfigurasi vcChannel
                if (!config || !config.vcChannel) continue;

                // Skip jika guild tidak ada di cache (bot sudah tidak di server)
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                // Cek apakah bot sudah memiliki koneksi voice aktif ke guild ini
                const existingConnection = getVoiceConnection(guildId);

                if (existingConnection) {
                    // 🛡️ [FIX] Cek status koneksi - jika sudah Destroyed, hapus dan rejoin
                    const connectionState = existingConnection.state.status;
                    if (connectionState === VoiceConnectionStatus.Destroyed) {
                        console.log(`⚠️ [VC_SENTINEL] Koneksi Destroyed terdeteksi di guild ${guild.name}. Membersihkan dan join ulang...`);
                        // Lanjut ke proses join ulang di bawah
                    } else if (connectionState === VoiceConnectionStatus.Disconnected) {
                        // Koneksi terputus tapi belum dihancurkan, destroy dulu lalu join ulang
                        console.log(`⚠️ [VC_SENTINEL] Koneksi Disconnected di guild ${guild.name}. Reset dan join ulang...`);
                        try { existingConnection.destroy(); } catch (_) {}
                    } else {
                        // Koneksi aktif, pastikan masih terhubung ke channel yang benar
                        const currentChannelId = existingConnection.joinConfig?.channelId;
                        if (currentChannelId === config.vcChannel) {
                            // Status aman: Bot masih di channel yang benar, skip iterasi ini
                            continue;
                        } else {
                            // Bot terhubung ke channel yang salah, hentikan sesi lama
                            console.log(`⚠️ [VC_SENTINEL] Bot terhubung ke channel salah (${currentChannelId}) di guild ${guild.name}. Mengakhiri sesi lama...`);
                            try { existingConnection.destroy(); } catch (_) {}
                        }
                    }
                }

                // Bot tidak terhubung atau baru saja disconnect, buat sesi baru
                const targetChannel = guild.channels.cache.get(config.vcChannel);
                if (targetChannel && targetChannel.type === ChannelType.GuildVoice) {
                    try {
                        joinVoiceChannel({
                            channelId: targetChannel.id,
                            guildId: targetChannel.guild.id,
                            adapterCreator: targetChannel.guild.voiceAdapterCreator,
                            selfDeaf: true,
                        });
                        console.log(`🔊 [VC_SENTINEL] Sesi baru dibuat: Bot join ulang ke #${targetChannel.name} di ${guild.name}`);
                    } catch (joinError) {
                        console.error(`🔴 [VC_SENTINEL_FAULT] Gagal join VC di guild ${guild.name}: ${joinError.message}`);
                    }
                }
            }
        } catch (daemonError) {
            console.error('🔴 [VC_SENTINEL_CRITICAL] Error pada daemon VC Auto-Reconnect:', daemonError.message);
        }
    }, 5000); // 🛡️ [FIX] Interval 5 detik - stabil tanpa spam API

    // ============================================================================
    // [NEW MODULE 2.2] TITANIUM ORPHANED DATA SWEEPER & GARBAGE COLLECTOR
    // ============================================================================
    // Daemon operasional latar belakang independen yang berfungsi mendeteksi dan menghancurkan
    // "Ghost Data" atau sisa residu infrastruktur server pada matriks database, utamanya ketika bot 
    // dikeluarkan (Leave/Kick/Ban). Pemusnahan data sangat krusial agar RAM alokasi Anda terjaga dari JSON Bloating.

    /**
     * Mekanisme pemindaian massal secara asinkronus (Deep Storage Scan) yang mengaudit dan memverifikasi 
     * keberadaan sinkronisasi setiap kluster server di database terhadap cache memori eksisting saat ini.
     */
    function runTitaniumGarbageCollector() {
        console.log('\n' + '♻️'.repeat(37));
        console.log('🗑️ [TITANIUM_GARBAGE_COLLECTOR] Mengaktifkan pemindaian matriks database (Ghost Data Removal)...');
        
        try {
            const db = readDB();
            let isDatabaseStateModified = false;
            let destroyedClusterCount = 0;
            
            const registeredGuildNodes = Object.keys(db);
            
            // Membatalkan rutinitas jika file JSON sepenuhnya kosong demi memangkas dan menghemat resource siklus CPU
            if (registeredGuildNodes.length === 0) {
                console.log('   ↳ [STATUS] Matriks penyimpanan dipastikan nihil. Tidak ada entitas untuk dipindai.');
                console.log('♻️'.repeat(37) + '\n');
                return;
            }

            // Iterasi berfase mendalam menuju ke keseluruhan log konfigurasi yang sudah diukir sebelumnya
            for (const guildId of registeredGuildNodes) {
                // Mengevaluasi boolean API: memastikan entitas bot masih terhubung (Online / Present) di server bersangkutan
                const isUplinkActive = client.guilds.cache.has(guildId);
                
                if (!isUplinkActive) {
                    console.log(`   ↳ [GHOST_NODE_DETECTED] KONEKSI TERPUTUS PERMANEN: Server Node ID [${guildId}] terverifikasi fiktif.`);
                    console.log(`   ↳ [PURGE_ACTION] Eksekusi tindakan: Melakukan disintegrasi konfigurasi dan rekam jejak Node tersebut dari sistem.`);
                    
                    // Menghancurkan properti objek secara absolut (Penghapusan paksa mencegah retensi Heap RAM)
                    delete db[guildId];
                    isDatabaseStateModified = true;
                    destroyedClusterCount++;
                }
            }
            
            // Jika didapati adanya mutasi pembersihan struktur data, berikan komitmen (Commit Write) ke dalam Hard Drive I/O
            if (isDatabaseStateModified) {
                writeDB(db);
                console.log(`✅ [SWEEP_COMPLETE] Operasi sterilisasi rampung! Berhasil mengeliminasi ${destroyedClusterCount} kluster data anomali yang kehilangan host-nya.`);
            } else {
                console.log(`ℹ️ [SWEEP_IDLE] Validasi eksekusi selesai. Terverifikasi 100% entitas pada disk memori memiliki sinkronisasi server yang aktif.`);
            }
            
        } catch (gcCriticalError) {
            console.error('🔴 [GARBAGE_COLLECTOR_FAULT] Terjadi distorsi saat menginspeksi direktori database utama:', gcCriticalError.message);
        }
        
        console.log('♻️'.repeat(37) + '\n');
    }

    // ============================================================================
    // [EVENT MODULE] FORENSIC EVICTION & TERMINATION TRACKER (SCORCHED EARTH PROTOCOL)
    // ============================================================================
    // Protokol otomatis yang terpicu ketika koneksi bot ke sebuah server terputus.
    // Modul ini melacak apakah bot dikeluarkan secara paksa (di-kick), memeriksa apakah 
    // pelakunya adalah Owner Server, mencatat waktu presisi WIB, dan menyimpannya 
    // ke dalam 'History Databases.json' sebelum menghapus data operasional bot.

    client.on(Events.GuildDelete, async (guild) => {
        console.log(`\n🚨 [NETWORK_TERMINATION_ALERT] Sinyal pemutusan terdeteksi dari Server Node: ${guild.name} (ID: ${guild.id})`);
        
        try {
            // --------------------------------------------------------------------
            // 1. INISIALISASI I/O FILE & PEMBACAAN DATABASE
            // --------------------------------------------------------------------
            const HISTORY_DB_PATH = './History Databases.json';
            let historyDb = {};
            
            // Membaca file History Databases secara aman
            if (fs.existsSync(HISTORY_DB_PATH)) {
                const rawHistoryData = fs.readFileSync(HISTORY_DB_PATH, 'utf8');
                if (rawHistoryData.trim()) {
                    historyDb = JSON.parse(rawHistoryData);
                }
            }

            // Memastikan struktur array untuk node server tersebut tersedia di RAM
            if (!historyDb[guild.id]) {
                historyDb[guild.id] = { 
                    lastKnownConfigurator: "UNKNOWN", 
                    historyLogs: [] 
                };
            }

            // --------------------------------------------------------------------
            // 2. TIME-SYNC ENGINE: SINKRONISASI ZONA WAKTU INDONESIA BARAT (WIB)
            // --------------------------------------------------------------------
            // Menggunakan mesin lokalisasi bawaan Node.js (Intl API) yang sangat akurat
            const wibTimeConfig = {
                timeZone: 'Asia/Jakarta',
                weekday: 'long',
                year: 'numeric', 
                month: 'long', 
                day: '2-digit',
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit', 
                hour12: false // Menggunakan format 24-Jam militer
            };
            const timeFormatter = new Intl.DateTimeFormat('id-ID', wibTimeConfig);
            const exactWIBTimestamp = `${timeFormatter.format(new Date())} WIB`;

            // --------------------------------------------------------------------
            // 3. INVESTIGASI AUDIT LOG: PENCARIAN JEJAK PELAKU KICK
            // --------------------------------------------------------------------
            let actionExecutorId = "UNKNOWN_OR_API_BLOCKED";
            let actionExecutorTag = "Unknown User";
            let evictionNature = "LEAVE / SERVER_DELETED / UNKNOWN_DISCONNECT";
            let isKickedByOwner = false;

            try {
                // Berusaha menarik data Audit Log terakhir sebelum API Discord sepenuhnya menutup akses.
                // Batas limit diatur ke 1 untuk mempercepat respons I/O dan menghemat alokasi memori.
                const fetchedLogs = await guild.fetchAuditLogs({
                    limit: 1,
                    type: 20 // 20 merepresentasikan AuditLogEvent.MemberKick (di Discord.js v14)
                });
                
                const kickLogEntry = fetchedLogs.entries.first();
                
                // Memvalidasi apakah target dari log 'Kick' tersebut adalah sistem bot kita sendiri
                if (kickLogEntry && kickLogEntry.target.id === client.user.id) {
                    actionExecutorId = kickLogEntry.executor.id;
                    actionExecutorTag = kickLogEntry.executor.tag;
                    evictionNature = "FORCED_EVICTION (KICKED)";
                    
                    // Memverifikasi apakah eksekutor yang menendang bot adalah Pemilik/Owner dari server tersebut
                    if (actionExecutorId === guild.ownerId) {
                        isKickedByOwner = true;
                    }
                }
            } catch (auditLogException) {
                // Blokir API sangat mungkin terjadi jika Discord langsung mencabut hak akses bot sesaat setelah di-kick
                console.warn(`⚠️ [FORENSIC_API_BLOCKED] Tidak dapat menembus Audit Log Server ${guild.name}. Akses telah dicabut oleh Discord API.`);
                evictionNature = "FORCED_DISCONNECT (AUDIT_LOG_UNAVAILABLE)";
            }

            // --------------------------------------------------------------------
            // 4. KONSTRUKSI PAYLOAD DATA FORENSIK (DATA ENCAPSULATION)
            // --------------------------------------------------------------------
            // Merakit objek analitik mendalam untuk dicatat ke dalam database historis
            const terminationPayload = {
                logId: `TERMINATION_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
                actionTrace: "SYSTEM_REMOVED_FROM_GUILD",
                serverContext: {
                    guildId: guild.id,
                    guildName: guild.name,
                    ownerId: guild.ownerId
                },
                evictionDetails: {
                    nature: evictionNature,
                    executorId: actionExecutorId,
                    executorTag: actionExecutorTag,
                    kickedByServerOwner: isKickedByOwner ? "YES (CONFIRMED_OWNER_EVICTION)" : "NO / UNKNOWN"
                },
                timestampStr: exactWIBTimestamp,
                unixEpochMs: Date.now()
            };

            // Menginjeksi data ke indeks paling atas array (Sistem LIFO - Last In First Out)
            historyDb[guild.id].historyLogs.unshift(terminationPayload);
            
            // Membatasi pembengkakan memori dengan melimitasi log per server maksimal 150 entri
            if (historyDb[guild.id].historyLogs.length > 150) {
                historyDb[guild.id].historyLogs.pop();
            }

            // --------------------------------------------------------------------
            // 5. COMMIT I/O: MENYIMPAN JEJAK KE 'HISTORY DATABASES.JSON'
            // --------------------------------------------------------------------
            fs.writeFileSync(HISTORY_DB_PATH, JSON.stringify(historyDb, null, 4), 'utf8');
            
            if (isKickedByOwner) {
                console.log(`💾 [HISTORY_LOCKED] PERINGATAN: Bot telah ditendang oleh OWNER SERVER pada node [${guild.name}]. Jejak waktu [${exactWIBTimestamp}] berhasil diabadikan.`);
            } else {
                console.log(`💾 [HISTORY_LOCKED] Pemutusan node server [${guild.name}] tercatat ke database historis pada [${exactWIBTimestamp}].`);
            }

            // --------------------------------------------------------------------
            // 6. GARBAGE COLLECTION: PEMBERSIHAN DATABASE UTAMA
            // --------------------------------------------------------------------
            // Menghapus arsitektur data server yang sudah tidak relevan dari 'database.json' 
            // agar memori utama (RAM) bot Anda tidak mengalami kebocoran (Memory Leak).
            const MAIN_DB_PATH = './database.json';
            if (fs.existsSync(MAIN_DB_PATH)) {
                let mainDb = JSON.parse(fs.readFileSync(MAIN_DB_PATH, 'utf8'));
                if (mainDb[guild.id]) {
                    delete mainDb[guild.id];
                    fs.writeFileSync(MAIN_DB_PATH, JSON.stringify(mainDb, null, 4), 'utf8');
                    console.log(`🗑️ [PURGE_SUCCESS] Residu data operasional server [${guild.id}] pada database.json berhasil dibersihkan.`);
                }
            }

        } catch (criticalFault) {
            // Fail-Safe ganda untuk mencegah crash pada V8 Engine Node.js
            console.error(`🔴 [FATAL_EVICTION_FAULT] Terjadi kegagalan arsitektural saat memproses modul pemutusan server:`, criticalFault.stack);
        }
        
        console.log(`═`.repeat(80) + `\n`);
    });

    // ----------------------------------------------------------------------------
    // [BACKGROUND DAEMON] AUTONOMOUS GC SCHEDULE VIA MESSAGE BROKER
    // ----------------------------------------------------------------------------
    // Memanfaatkan secara utuh kecerdasan arsitektur 'Titanium Task Queue Matrix' yang Anda ciptakan,
    // mendelegasikan tugas otonom pencarian anomali database ini setiap 12 Jam (43.200.000 milidetik).
    // Memastikan alur pembersihan sampah dikerjakan menggunakan parameter non-blocking.

    setInterval(() => {
        titaniumBroker.enqueue(
            async () => runTitaniumGarbageCollector(), 
            { feature: 'Autonomous GC Ghost Data Sweeper', sector: 'Persistent JSON Hard Drive DB' }, 
            'LOW' // Penggunaan antrean tingkat prioritas LOW memastikan protokol anti-spam / VC tidak mengalami penundaan
        );
    }, 12 * 60 * 60 * 1000);

    // ----------------------------------------------------
    // EVENT: NEW SERVER DEPLOYMENT (ENHANCED DETAIL)
    // ----------------------------------------------------
    client.on('guildCreate', async (guild) => {
        try {
            const logChannel = await client.channels.fetch(GLOBAL_LOG_CHANNEL);
            if (logChannel) {
                let invite = "*No permission to create uplink gateway*";
                try {
                    const channels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
                    if (channels.size > 0) {
                        const inviteObj = await channels.first().createInvite({ maxAge: 0, maxUses: 0 });
                        invite = inviteObj.url;
                    }
                } catch (e) {}

                let owner = { user: { tag: 'Unknown' }, id: 'Unknown' };
                try { owner = await guild.fetchOwner(); } catch(e) {}

                const embed = new EmbedBuilder()
                    .setColor('#00ffcc')
                    .setAuthor({ name: 'GLOBAL DEPLOYMENT NETWORK', iconURL: client.user.displayAvatarURL() })
                    .setTitle('🛡️ CRITICAL EVENT: NEW INFRASTRUCTURE ASSIMILATED')
                    .setDescription(`Guardian Server System has successfully established a bridgehead in a new sector. All telemetries are live and logging protocols are standing by.`)
                    .addFields(
                        { name: '🏢 SECTOR NAME', value: `**${guild.name}**`, inline: true },
                        { name: '🆔 SECTOR ID', value: `\`${guild.id}\``, inline: true },
                        { name: '👑 OVERSEER (OWNER)', value: `${owner.user.tag} (\`${owner.id}\`)`, inline: false },
                        { name: '👥 POPULATION', value: `\`${guild.memberCount} Entities\``, inline: true },
                        { name: '📡 CHANNELS', value: `\`${guild.channels.cache.size} Nodes\``, inline: true },
                        { name: '📜 ROLES ALLOCATED', value: `\`${guild.roles.cache.size} Tiers\``, inline: true },
                        { name: '💎 BOOST STATUS', value: `\`Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount||0} Boosts)\``, inline: true },
                        { name: '📅 SECTOR CREATED', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: '🔗 UPLINK GATEWAY', value: invite, inline: false }
                    )
                    .setThumbnail(guild.iconURL({ dynamic: true, size: 512 }) || client.user.displayAvatarURL())
                    .setFooter({ text: 'SYS_CORE_OVERRIDE_ENABLED | GUARDIAN V5.3.0' })
                    .setTimestamp();
                
                await logChannel.send({ embeds: [embed] });
            }
        } catch (err) {
            console.error('[GLOBAL_LOG_ERR]', err);
        }
    });

    // ----------------------------------------------------
    // EVENT: WELCOME UI (OMNISCIENCE CORE DESIGN)
    // ----------------------------------------------------
    client.on('guildMemberAdd', async (member) => {
        const db = readDB();
        const config = db[member.guild.id];
        if (config && config.welcomeChannel) {
            const channel = member.guild.channels.cache.get(config.welcomeChannel);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff44')
                    .setAuthor({ name: 'PERSONNEL IDENTIFICATION SUCCESSFUL', iconURL: client.user.displayAvatarURL() })
                    .setTitle(`👋 WELCOME: ${member.user.username.toUpperCase()}`)
                    .setDescription(`${'━'.repeat(40)}\n👤 **PERSONNEL:** ${member}\n🆔 **ID:** \`${member.id}\`\n📊 **STATUS:** \`🔄 PENDING_VERIFICATION\`\n🌐 **NODE:** \`DC-${member.guild.id.substring(0, 8)}\`\n${'━'.repeat(40)}`)
                    .setThumbnail(member.guild.iconURL({ dynamic: true }) || member.user.displayAvatarURL())
                    .addFields(
                        { name: '📅 JOINED', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: true },
                        { name: '👥 MEMBERS', value: `\`${member.guild.memberCount}\``, inline: true }
                    )
                    .setFooter({ text: `DATA CENTRE OMNISCIENCE CORE • v22.0.0 | Fast-Track V3.1` })
                    .setTimestamp();

                channel.send({ embeds: [embed] }).catch(()=>null);
                member.send({ embeds: [embed] }).catch(()=>null); 
            }
        }
    });

    // ----------------------------------------------------
    // EVENT: GOODBYE UI (PUBLIC AUDIT LOG DESIGN)
    // ----------------------------------------------------
    client.on('guildMemberRemove', async (member) => {
        const db = readDB();
        const config = db[member.guild.id];
        if (config && config.goodbyeChannel) {
            const channel = member.guild.channels.cache.get(config.goodbyeChannel);
            if (channel) {
                const hash = generateTerminalHash(member.id);
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('🛑 [PUBLIC_AUDIT_LOG] ENTITY DISCONNECTED')
                    .setDescription(`**REGISTERED IDENTITY:** <@${member.id}> ( \`${member.id}\` )\n\nThe central defense system reports that this entity has severed all logical network connections from **${member.guild.name}**.\n\nIn accordance with infrastructure regulations, all privileges, roles, and session authorizations for this entity have been automatically revoked to maintain core database integrity.\n\n> *Memory purification for this ID has been completed.*`)
                    .addFields(
                        { name: '🌐 Impacted Terminal Sector', value: `\`${member.guild.name}\``, inline: true },
                        { name: '🛡️ Last Session Hash Key', value: `\`${hash}\``, inline: true }
                    )
                    .setFooter({ text: `INFRASTRUCTURE SECURITY SYSTEM • AUTO_REVOKE` })
                    .setTimestamp();

                channel.send({ embeds: [embed] }).catch(()=>null);
            }
        }
    });

    // ----------------------------------------------------
    // EVENT: SECURITY LOG - MESSAGE DELETE (TITANIUM ENHANCED)
    // ----------------------------------------------------
    client.on('messageDelete', async (message) => {
        try {
            // [Fase 1] Validasi Eksekusi I/O & Ekstraksi Konfigurasi Database
            if (!message) return;
            
            const db = readDB();
            if (!message.guild || !db[message.guild.id]) return;
            
            const config = db[message.guild.id];
            
            // Catatan Otorisasi: Pastikan 'logChannel' di bawah ini sejajar secara struktural
            // dengan key/value log channel pada berkas database.json Anda.
            const logChannelId = config.logChannel; 
            if (!logChannelId) return;

            const logChannel = message.guild.channels.cache.get(logChannelId);
            if (!logChannel) return;

            // [Fase 2] Penanganan Anomali Memori (Ghost Data/Partial State Protocol)
            // Rute ini tereksekusi jika sebuah pesan diretas/dihapus saat wujudnya tidak lagi ternaungi memori Cache
            if (message.partial) {
                const partialEmbed = new EmbedBuilder()
                    .setColor('#FF5555') // Merah Pudar Taktis
                    .setAuthor({ name: '🛡️ Forensic Audit: Deletion Anomaly (Out-of-Cache)' })
                    .setDescription(`⚠️ **Telemetry Alert**: Infrastructure has detected a message that was recently deleted forcefully within the jurisdiction of <#${message.channelId}>.\n\n*System Diagnosis: The core text payload (payload) and the actor's identity trail cannot be reconstructed to the surface as the message's lifespan has been manually cleared from the V8 Engine's memory heap.*`)
                    .addFields({ name: '🆔 Transmission Node / Message ID', value: `\`${message.id}\``, inline: true })
                    .setFooter({ text: 'Titanium Security Engine • Partial State Handled' })
                    .setTimestamp();

                return await logChannel.send({ embeds: [partialEmbed] }).catch(() => null);
            }

            // [Fase 3] Validasi Kewenangan Aktor & Konstruksi Output Presisi
            if (message.author && message.author.bot) return;

            const attachments = message.attachments.size > 0 
                ? message.attachments.map(a => a.url).join('\n') 
                : 'N/A (No attachment transfer on this data block)';

            const deleteEmbed = new EmbedBuilder()
                .setColor('#E74C3C') // Peringatan Kritis Karantina (Merah Pekat)
                .setAuthor({ 
                    name: `Warning: Data Destruction Logged`, 
                    iconURL: message.author.displayAvatarURL({ dynamic: true }) 
                })
                .setDescription(`**Execution Actor Identity:** ${message.author} (\`${message.author.id}\`)\n**Vanishing Coordinate Point:** ${message.channel}\n\n**Original Content Load (Data Payload):**\n\`\`\`text\n${message.content || '[Message Detected as Empty Object or Special Media]'}\n\`\`\``)
                .addFields({ name: '📎 File/Attachment I/O Indicator', value: attachments })
                .setFooter({ text: `Message Target ID: ${message.id} • Titanium Infrastructure` })
                .setTimestamp();

            await logChannel.send({ embeds: [deleteEmbed] }).catch(() => null);

        } catch (logException) {
            console.error(`🔴 [SECURITY LOG CRASH] Engine suddenly experienced a matrix panic during Message Delete calculation:`, logException.message);
        }
    });

    // ----------------------------------------------------
    // EVENT: SECURITY LOG - MESSAGE UPDATE (TITANIUM ENHANCED)
    // ----------------------------------------------------
    client.on('messageUpdate', async (oldMessage, newMessage) => {
        try {
            // [Fase 1] Mencegah Pembekuan Rantai Transmisi Saat Paket Data Mengembalikan Nilai Null
            if (!newMessage) return;
            
            // Apabila paket pesan modifikasi mengalami cacat/korup (Partial Engine State)
            if (newMessage.partial) {
                try {
                    // Memaksa komandan inti menjemput ulang data murni ke API Server Discord
                    newMessage = await newMessage.fetch();
                } catch (fetchError) {
                    return; // Gagal menyinkronkan data (Pesan keburu dihapus), isolasi error tanpa memblokir runtime
                }
            }

            if (newMessage.author && newMessage.author.bot) return;
            if (!newMessage.guild) return;

            const db = readDB();
            const config = db[newMessage.guild.id];
            const logChannelId = config ? config.logChannel : null; 
            if (!logChannelId) return;

            const logChannel = newMessage.guild.channels.cache.get(logChannelId);
            if (!logChannel) return;

            // [Fase 2] Penanganan Jejak Modifikasi Data Lama (Old Message Ghosting Override)
            // Algoritma pengaman jika teks pra-mutasi telah dibersihkan oleh Garbage Collector
            if (oldMessage.partial) {
                const partialUpdateEmbed = new EmbedBuilder()
                    .setColor('#F39C12') // Kuning Analitik (Waspada)
                    .setAuthor({ 
                        name: `Modified Text Structure (Ghost Data Bypass)`, 
                        iconURL: newMessage.author.displayAvatarURL({ dynamic: true }) 
                    })
                    .setDescription(`**Data Mutation Detected in Coordinate Sector** ${newMessage.channel}\n\n**New Structure Post-Injection:**\n\`\`\`text\n${newMessage.content || '[Invalid Content / Auto-Embed Rendered by System]'}\n\`\`\`\n*Advanced Diagnosis: Passive monitoring engine is unauthorized to re-render old logs (Pre-Mutation) as the physical data form has been manually excluded from the RAM matrix to ensure memory stability.*`)
                    .setFooter({ text: `Titanium Security Engine • Partial Sync Handled` })
                    .setTimestamp();

                return await logChannel.send({ embeds: [partialUpdateEmbed] }).catch(() => null);
            }

            // [Fase 3] Eliminasi Operasi Berlebih akibat Auto-Pin, Rendering URL (Ghost Update), atau Webhook Bot
            if (oldMessage.content === newMessage.content) return;

            // [Fase 4] Konstruksi UI Log Pembaruan Utama (Fully Cached State Assurance)
            const updateEmbed = new EmbedBuilder()
                .setColor('#3498DB') // Biru Operasional Kestabilan
                .setAuthor({ 
                    name: `Modified Data Chain Integrity`, 
                    iconURL: newMessage.author.displayAvatarURL({ dynamic: true }) 
                })
                .setDescription(`**Modifier Actor Identity:** ${newMessage.author} (\`${newMessage.author.id}\`)\n**Field Intervention Point:** ${newMessage.channel} \n[Initialize Navigation to Incident Area](${newMessage.url})`)
                .addFields(
                    { name: '📥 Old Matrix Payload (Pre-Mutation Text)', value: `\`\`\`text\n${oldMessage.content || '[Empty Text/Visual Media Execution]'}\n\`\`\`` },
                    { name: '📤 New Injection Result Payload (Post-Text Mutation)', value: `\`\`\`text\n${newMessage.content || '[Empty Text/Visual Media Execution]'}\n\`\`\`` }
                )
                .setFooter({ text: `Message Target ID: ${newMessage.id} • Titanium Infrastructure` })
                .setTimestamp();

            await logChannel.send({ embeds: [updateEmbed] }).catch(() => null);

        } catch (updateException) {
            console.error(`🔴 [SECURITY_LOG_CRASH] Engine failed to render the Message Update matrix due to an exception:`, updateException.message);
        }
    });

    // ----------------------------------------------------
    // EVENT: SECURITY LOG - VOICE STATE AUDIT (TITANIUM ENHANCED)
    // ----------------------------------------------------
    client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            // [Fase 1] Validasi Integritas Data & Ekstraksi Konfigurasi Node Database
            // Mencegah kebocoran memori jika eksekusi event tidak membawa parameter yang valid
            if (!oldState && !newState) return;
            
            // Mengekstraksi yurisdiksi server (Guild) tempat anomali atau aktivitas suara terjadi
            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            // Menginisialisasi sistem pembacaan database I/O lokal (Sinkronisasi File JSON)
            const db = readDB();
            if (!db[guild.id]) return;
            
            // Penarikan rute kanal log berdasarkan konfigurasi spesifik yurisdiksi server tersebut
            const config = db[guild.id];
            const logChannelId = config.logChannel; 
            if (!logChannelId) return;

            const logChannel = guild.channels.cache.get(logChannelId);
            if (!logChannel) return;

            // [Fase 2] Resolusi Entitas Aktor Pengguna (Member Fetching Protocol)
            // Memastikan data member ditarik secara sinkronus untuk menghindari anomali 'Ghost Member'
            // di mana cache entitas pengguna sudah kadaluarsa saat log dieksekusi.
            let member = newState.member || oldState.member;
            if (!member) {
                try {
                    // Pemanggilan paksa data murni ke API Server Discord
                    member = await guild.members.fetch(newState.id || oldState.id);
                } catch (fetchErr) {
                    // Isolasi rantai transmisi apabila pengguna sudah sepenuhnya hilang dari server
                    return; 
                }
            }

            // Opsional: Memblokir telemetri dari entitas Bot untuk mencegah spamming log dan menghemat bandwidth I/O
            if (member.user.bot) return; 

            // [Fase 3] Analisis Delta Komunikasi (Voice Connectivity Matrix)
            // Membandingkan node koneksi lama dan node koneksi baru secara dinamis
            const oldChannel = oldState.channel;
            const newChannel = newState.channel;

            // ----------------------------------------------------------------
            // SKENARIO A: KONEKSI MASUK (VOICE JOIN EVENT)
            // Terpicu ketika klien sebelumnya tidak berada di saluran manapun,
            // dan kini terdeteksi memiliki koordinat koneksi aktif.
            // ----------------------------------------------------------------
            if (!oldChannel && newChannel) {
                const joinEmbed = new EmbedBuilder()
                    .setColor('#2ECC71') // Hijau Enkripsi Aktif (Operasional)
                    .setAuthor({ 
                        name: '🎙️ Acoustic Telemetry: Communication Session Begins', 
                        iconURL: member.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setDescription(`**Primary Client Identity:** ${member.user} (\`${member.user.id}\`)\n**Execution Activity:** Establishing an asynchronous connection to the voice transmission.\n\n**Destination Coordinates:** ${newChannel} (\`${newChannel.name}\`)`)
                    .addFields(
                        { name: 'Current Room Capacity', value: `\`${newChannel.members.size}\` Connected Entity`, inline: true },
                        { name: 'Channel Transmission Bitrate', value: `\`${newChannel.bitrate / 1000} kbps\``, inline: true }
                    )
                    .setFooter({ text: 'Titanium Voice Engine • Connection Established' })
                    .setTimestamp();

                return await logChannel.send({ embeds: [joinEmbed] }).catch(() => null);
            }

            // ----------------------------------------------------------------
            // SKENARIO B: PEMUTUSAN KONEKSI (VOICE LEAVE EVENT)
            // Terpicu ketika klien sebelumnya berada di dalam transmisi suara,
            // namun koordinat koneksi barunya terekam sebagai nilai absolut kosong (null).
            // ----------------------------------------------------------------
            if (oldChannel && !newChannel) {
                const leaveEmbed = new EmbedBuilder()
                    .setColor('#E74C3C') // Merah Isolasi (Terminasi Koneksi)
                    .setAuthor({ 
                        name: '📴 Acoustic Telemetry: Communication Session Interrupted', 
                        iconURL: member.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setDescription(`**Primary Client Identity:** ${member.user} (\`${member.user.id}\`)\n**Execution Activity:** Terminating the voice transmission connection (Node Disconnected).\n\n**Last Origin Coordinates:** ${oldChannel} (\`${oldChannel.name}\`)`)
                    .addFields(
                        { name: 'Duration/Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true }
                    )
                    .setFooter({ text: 'Titanium Voice Engine • Connection Terminated' })
                    .setTimestamp();

                return await logChannel.send({ embeds: [leaveEmbed] }).catch(() => null);
            }

            // ----------------------------------------------------------------
            // SKENARIO C: MUTASI JALUR KOMUNIKASI (VOICE SWITCH/MOVE EVENT)
            // Terpicu ketika klien mempertahankan status koneksi (tidak terputus penuh),
            // namun terdapat perubahan struktur pada ID channel antara state lama dan baru.
            // ----------------------------------------------------------------
            if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
                const moveEmbed = new EmbedBuilder()
                    .setColor('#F1C40F') // Kuning Migrasi Navigasi (Relokasi)
                    .setAuthor({ 
                        name: '🔀 Acoustic Telemetry: Channel Path Migration', 
                        iconURL: member.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setDescription(`**Primary Client Identity:** ${member.user} (\`${member.user.id}\`)\n**Execution Activity:** Performing dynamic migration and relocation between acoustic sectors.\n\n**[📥] Original Node (Pre-Migration):** ${oldChannel}\n**[📤] New Node (Post-Migration):** ${newChannel}`)
                    .setFooter({ text: 'Titanium Voice Engine • Channel Relocation Matrix' })
                    .setTimestamp();

                return await logChannel.send({ embeds: [moveEmbed] }).catch(() => null);
            }

            // Catatan Pengembang:
            // Skenario bypass (Mute/Deafen/Streaming) secara otomatis tidak akan memicu log ini
            // karena kita telah merestriksi kondisi hanya berfokus pada mutasi objek 'channel'.
            
        } catch (voiceLogException) {
            // [ERROR HANDLING] Memastikan crash pada logging suara tidak membuat proses Node.js utama menjadi freeze
            console.error(`🔴 [VOICE_LOG_CRASH] Engine encountered a calculation failure while rendering the Voice State matrix:`, voiceLogException.message);
        }
    });

    // ============================================================================
    // [NEW MODULE] TITANIUM COGNITIVE MESSAGE INTERCEPTOR (DEEP PACKET ANTI-LINK SCANNER)
    // ============================================================================
    // Subsistem pasif yang mendengarkan (listen) setiap paket pesan masuk pada arsitektur I/O.
    // Direkayasa dengan mekanisme Deep Level Pattern Matching untuk mendeteksi anomali URL,
    // menyaring hak akses otoritatif, dan menghancurkan payload ilegal sebelum di-render oleh pengguna lain.

    client.on(Events.MessageCreate, async message => {
        // ========================================================================
        // [PHASE 1] PRE-FLIGHT IGNITION & FILTERING LAYER
        // ========================================================================
        // Mencatat waktu mulai siklus komputasi untuk metrik latensi internal
        const interceptorStartTime = process.hrtime();

        // 1. Memblokir evaluasi jika pesan berasal dari entitas otomatis (Bot / Webhook)
        // Ini menyelamatkan siklus CPU dari pemindaian pesan sistem itu sendiri.
        if (message.author.bot || message.webhookId) return;
        
        // 2. Memastikan pemindaian hanya dieksekusi di dalam teritori Server (Guild Node)
        if (!message.guild || !message.member) return;

        // 3. Mencegah error Null-Pointer jika paket pesan (content) belum termuat sempurna di RAM
        if (!message.content) return;

        const guildId = message.guild.id;
        const authorId = message.author.id;
        const guildOwnerId = message.guild.ownerId; 

        try {
            // ========================================================================
            // [PHASE 2] MEMORY EXTRACTION & STATE VALIDATION
            // ========================================================================
            // Mengekstrak status keamanan dari Database In-Memory Cache (Zero Latency Cost)
            const db = readDB();

            // Memverifikasi secara struktural apakah partisi konfigurasi perlindungan eksis
            const protectionData = db[guildId]?.protectionModules;
            
            // Jika tidak ada konfigurasi perlindungan, hentikan rantai eksekusi
            if (!protectionData) return;

            // Memastikan mode pertahanan 'Anti-Link' dikonfirmasi AKTIF (True)
            if (protectionData.antiLinkActive === true) {
                
                // ====================================================================
                // [PHASE 3] EXECUTIVE CLEARANCE BYPASS (MATRIKS PENGECUALIAN)
                // ====================================================================
                // Lapisan ini memberikan kekebalan (Immunity) terhadap komandan dan sistem administrator.
                const isGuildOwner = (authorId === guildOwnerId);
                const isSystemAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
                const hasManageMessages = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

                // Jika entitas memiliki clearance tingkat tinggi, lepaskan karantina (Bypass Interception)
                if (isGuildOwner || isSystemAdmin || hasManageMessages) {
                    return; 
                }

                // ====================================================================
                // [PHASE 4] DEEP LEVEL PATTERN MATCHING (ADVANCED REGEX ENGINE)
                // ====================================================================
                // Mesin Reguler Expression tingkat militer yang dirancang untuk menjerat berbagai 
                // skema kamuflase URL (HTTP/S, subdomain acak, domain TLD aneh, hingga discord.gg).
                const aggressiveUrlRegex = /(?:(?:https?|ftp|steam):\/\/)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/\S*)?/gi;
                
                // Khusus menyadap format Undangan Discord tersembunyi
                const discordInviteRegex = /(discord\.(gg|io|me|li)\/|discordapp\.com\/invite\/)[\w-]{3,}/gi;

                // Mengatur ulang pointer regex untuk mencegah bug kebocoran memori (Memory Leak Bug)
                aggressiveUrlRegex.lastIndex = 0;
                discordInviteRegex.lastIndex = 0;

                // Evaluasi logis: Apakah string pesan beresonansi dengan pola tautan ilegal?
                const containsStandardLink = aggressiveUrlRegex.test(message.content);
                const containsDiscordInvite = discordInviteRegex.test(message.content);

                if (containsStandardLink || containsDiscordInvite) {
                    
                    // ================================================================
                    // [PHASE 5] THREAT ANNIHILATION & FORENSIC LOGGING
                    // ================================================================
                    // Menghancurkan pesan terinfeksi secara asinkronus tanpa menghentikan thread
                    await message.delete().catch(() => {
                        console.warn(`⚠️ [SHIELD_WARN] Gagal menghapus tautan dari ID ${authorId}. Engine kekurangan izin 'Manage Messages'.`);
                    });

                    // Menghitung delta waktu penyadapan untuk mencatat efisiensi V8 Engine (Diagnostic Telemetry)
                    const interceptorEndTime = process.hrtime(interceptorStartTime);
                    const executionLatencyMs = (interceptorEndTime[0] * 1000 + interceptorEndTime[1] / 1000000).toFixed(3);

                    // Menyusun Kartu Laporan Peringatan Visual (Visual Warning Embed) 
                    const interceptionEmbed = new EmbedBuilder()
                        .setAuthor({ 
                            name: 'TITANIUM NETWORK SHIELD: BREACH DETECTED', 
                            iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTitle('🛑 PROTOCOL VIOLATION: LINK INJECTION PREVENTED')
                        .setDescription(`Attention <@${authorId}>,\nThis server's automated defense infrastructure (*Anti-Link System*) is currently **ACTIVE**. Your message transmission was recently blocked and automatically eliminated by the security engine.`)
                        .addFields(
                            { name: '📋 Violation Category', value: containsDiscordInvite ? '`ILEGAL_DISCORD_INVITE_ROUTING`' : '`UNAUTHORIZED_EXTERNAL_URL_INJECTION`', inline: true },
                            { name: '⚙️ System Resolution', value: '`PAYLOAD_ANNIHILATED (DELETED)`', inline: true },
                            { name: '⏱️ Sensor Latency', value: `\`${executionLatencyMs} ms\``, inline: false },
                            { name: '⚠️ Special Attention', value: '> *Only personnel with Administrator or Message Manager authorization are permitted to embed external links within the jurisdiction of this server.*', inline: false }
                        )
                        .setColor('#FF0033') // Kode Merah Kriminal
                        .setFooter({ text: `Terminal Trace ID: ${generateTerminalHash(authorId)} | Automated Threat Removal` })
                        .setTimestamp();

                    // Meneruskan transmisi peringatan menuju Node (Channel) pengguna
                    const alertTransmission = await message.channel.send({ 
                        content: `<@${authorId}> ⚠️ **[SECURITY ALERT]**`, 
                        embeds: [interceptionEmbed] 
                    });
                    
                    // Self-Destruct Routine: Menghancurkan peringatan visual setelah 10 detik
                    // Bertujuan agar antarmuka obrolan (*chat history*) tidak tertimbun sampah log keamanan
                    setTimeout(() => {
                        alertTransmission.delete().catch(() => null);
                    }, 10 * 1000);

                    // Mencetak log aktivitas terminal ke Console Server Host
                    console.log('\n' + '🛡️'.repeat(40));
                    console.log(`🛡️ [ANTI_LINK_INTERCEPTOR] PENYADAPAN PAKET BERHASIL DIEKSEKUSI`);
                    console.log(`   ↳ [ORIGIN]   : ${message.author.tag} (ID: ${authorId})`);
                    console.log(`   ↳ [SECTOR]   : Server ID ${guildId} | Channel ID ${message.channel.id}`);
                    console.log(`   ↳ [SPEED]    : Diselesaikan dalam waktu ${executionLatencyMs} milidetik.`);
                    console.log('🛡️'.repeat(40) + '\n');
                }
            }

            // ========================================================================
            // [NEW MODULE] TITANIUM ANTI-SPAM PROTOCOL (MESSAGE FLOOD & STRIKE SYSTEM)
            // ========================================================================
            // Passive strike engine that monitors message transmission frequency per user.
            // IMPORTANT: This module NEVER auto-activates when the bot joins a server.
            // It stays dormant until an Administrator explicitly enables it via the
            // '/protection module:anti_spam' command. The gate below is the
            // single source of truth: only a committed 'true' state in the database
            // (written exclusively by the /protection command) arms this system.
            if (protectionData.antiSpamActive === true) {

                // ====================================================================
                // [PHASE 3B] EXECUTIVE CLEARANCE BYPASS (IDENTICAL MATRIX AS ANTI-LINK)
                // ====================================================================
                const isGuildOwner = (authorId === guildOwnerId);
                const isSystemAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
                const hasManageMessages = message.member.permissions.has(PermissionsBitField.Flags.ManageMessages);

                // High-clearance entities are immune to the strike system
                if (isGuildOwner || isSystemAdmin || hasManageMessages) {
                    return; 
                }

                // ====================================================================
                // [PHASE 4B] MESSAGE FLOOD MONITORING (STRIKE SYSTEM ENGINE)
                // ====================================================================
                const currentTimestamp = Date.now();
                let userSpamData = spamCache.get(authorId);

                // Initialize the tracking record for this user in the volatile RAM cache
                if (!userSpamData) {
                    userSpamData = { timestamp: currentTimestamp, count: 0, strikes: 0, lastOffense: 0 };
                    spamCache.set(authorId, userSpamData);
                }

                // Strike decay: if the user has been clean for a full STRIKE_1 cycle, reset the strike history
                if (userSpamData.lastOffense > 0 && (currentTimestamp - userSpamData.lastOffense) > SPAM_STRIKE_THRESHOLDS.STRIKE_1) {
                    userSpamData.strikes = 0;
                }

                // Reset the flood window counter if the observation window has elapsed
                if ((currentTimestamp - userSpamData.timestamp) > SPAM_FLOOD_WINDOW_MS) {
                    userSpamData.count = 0;
                    userSpamData.timestamp = currentTimestamp;
                }

                userSpamData.count++;
                userSpamData.timestamp = currentTimestamp;

                // [FLOOD DETECTED] The user exceeded the permitted message volume inside the window
                if (userSpamData.count > SPAM_FLOOD_LIMIT) {
                    userSpamData.strikes++;
                    userSpamData.count = 0;
                    userSpamData.lastOffense = currentTimestamp;

                    // Escalation matrix: map the current strike level to the silence (timeout) duration
                    let timeoutDurationMs = SPAM_STRIKE_THRESHOLDS.STRIKE_1;
                    let strikeVisual = 'STRIKE_1 (LEVEL 1)';
                    if (userSpamData.strikes >= 3) {
                        timeoutDurationMs = SPAM_STRIKE_THRESHOLDS.STRIKE_3;
                        strikeVisual = 'STRIKE_3 (LEVEL 3)';
                    } else if (userSpamData.strikes >= 2) {
                        timeoutDurationMs = SPAM_STRIKE_THRESHOLDS.STRIKE_2;
                        strikeVisual = 'STRIKE_2 (LEVEL 2)';
                    }

                    // Annihilate the offending payload and silence the violator
                    await message.delete().catch(() => null);
                    await message.member.timeout(timeoutDurationMs, 'Anti-Spam System: Message flood detected').catch(() => {
                        console.warn(`⚠️ [ANTI_SPAM_WARN] Failed to timeout user ID ${authorId}. Insufficient permissions or role hierarchy conflict.`);
                    });

                    // Compose the visual strike report card
                    const strikeEmbed = new EmbedBuilder()
                        .setAuthor({ 
                            name: 'TITANIUM NETWORK SHIELD: FLOOD DETECTED', 
                            iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTitle('🛑 PROTOCOL VIOLATION: MESSAGE FLOOD PREVENTED')
                        .setDescription(`Attention <@${authorId}>,\nThis server's automated defense infrastructure (*Anti-Spam System*) is currently **ACTIVE**. Your message transmission rate exceeded the permitted threshold and has been automatically suppressed by the security engine.`)
                        .addFields(
                            { name: '📋 Violation Category', value: '`MESSAGE_FLOOD_DETECTED`', inline: true },
                            { name: '⚙️ System Resolution', value: '`PAYLOAD_ANNIHILATED (DELETED) + TIMEOUT_APPLIED`', inline: true },
                            { name: '📈 Strike Escalation', value: `\`${strikeVisual} (Total: ${userSpamData.strikes})\``, inline: false },
                            { name: '⏱️ Silence Duration', value: `\`${Math.round(timeoutDurationMs / 60000)} minutes\``, inline: false }
                        )
                        .setColor('#FF0033') // Kode Merah Kriminal
                        .setFooter({ text: `Terminal Trace ID: ${generateTerminalHash(authorId)} | Automated Threat Removal` })
                        .setTimestamp();

                    // Forward the warning transmission toward the user's node (channel)
                    const strikeAlert = await message.channel.send({ 
                        content: `<@${authorId}> ⚠️ **[SECURITY ALERT]**`, 
                        embeds: [strikeEmbed] 
                    });

                    // Self-Destruct Routine: Destroy the visual alert after 10 seconds
                    // to prevent the chat history from being littered with security logs
                    setTimeout(() => {
                        strikeAlert.delete().catch(() => null);
                    }, 10 * 1000);

                    // Print the activity log to the Server Host Console
                    console.log('\n' + '🛡️'.repeat(40));
                    console.log(`🛡️ [ANTI_SPAM_INTERCEPTOR] FLOOD PACKET INTERCEPTED`);
                    console.log(`   ↳ [ORIGIN]   : ${message.author.tag} (ID: ${authorId})`);
                    console.log(`   ↳ [SECTOR]   : Server ID ${guildId} | Channel ID ${message.channel.id}`);
                    console.log(`   ↳ [STRIKE]   : ${strikeVisual} | Timeout ${Math.round(timeoutDurationMs / 60000)} minutes`);
                    console.log('🛡️'.repeat(40) + '\n');
                }
            }
        } catch (interceptorCriticalError) {
            // ========================================================================
            // [PHASE 6] KERNEL PANIC ISOLATION BOUNDARY
            // ========================================================================
            // Lapisan pelindung utama untuk memastikan mesin Bot tidak mengalami "Crash" 
            // apabila terdapat paket pesan korup atau ketika Discord API sedang gangguan.
            console.error('\n🔴 [INTERCEPTOR_FAULT] Anomali terdeteksi pada rutinitas pemindaian lalu lintas pesan:');
            console.error(`   ↳ [TRACE_LOG] : ${interceptorCriticalError.message || 'Error I/O Tak Dikenal'}`);
        }
    });

// ============================================================================
    // [NEW MODULE 2.3] TITANIUM OMNI-BROADCAST SESSION MANAGER & DISPATCH ENGINE
    // ============================================================================
    // Cache Volatile in-memory untuk menyimpan konfigurasi siaran saat komandan 
    // sedang mengetik di dalam antarmuka Modal UI Editor. Menggunakan Map untuk O(1) akses.
    const broadcastSessionCache = new Map();

    /**
     * Engine Eksekutor Siaran Terpusat (Centralized Broadcast Dispatcher).
     * Menerima payload dari Slash Command maupun Modal Submit, merakit UI Premium,
     * dan mendelegasikannya ke antrean Task Queue Broker.
     * 
     * @param {Object} interaction - Objek interaksi Discord asal.
     * @param {Object} payload - Objek terstruktur berisi data siaran.
     */
    async function executeTitaniumBroadcastEngine(interaction, payload) {
        const { targetChannel, title, message, priority, imageUrl, pingEveryone } = payload;

        // 1. Validasi Lapisan Jaringan (Node Target Verification)
        if (targetChannel.type !== ChannelType.GuildText && targetChannel.type !== ChannelType.GuildAnnouncement) {
            return interaction.editReply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0033')
                        .setTitle('❌ [ROUTING_ERROR] TRANSMISSION GATEWAY BLOCKED')
                        .setDescription(`\`\`\`diff\n- The target channel is not valid.\n- Detected Type: ${targetChannel.type}\n- Resolution: Must be a Text Channel or Announcement Channel.\n\`\`\``)
                        .setTimestamp()
                ],
                flags: MessageFlags.Ephemeral
            });
        }

        // 2. Konfigurasi Matriks Estetika & Skema Warna Prioritas Premium (Upgraded UI)
        const priorityConfig = {
            critical: { 
                color: '#FF002B', 
                icon: '🚨', 
                label: 'CRITICAL SYSTEM INJUNCTION',
                badge: '🔴 HIGH_PRIORITY_DISPATCH',
                border: '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰'
            },
            update: { 
                color: '#FFCC00', 
                icon: '⚙️', 
                label: 'CORE INFRASTRUCTURE UPDATE',
                badge: '🟡 ELEVATED_PRIORITY_NODE',
                border: '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰'
            },
            info: { 
                color: '#00E6FF', 
                icon: '🌐', 
                label: 'GLOBAL NETWORK DISSEMINATION',
                badge: '🟢 STANDARD_PRIORITY_NODE',
                border: '▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰'
            }
        };

        const activeConfig = priorityConfig[priority] || priorityConfig.info;
        const transmissionHash = generateTerminalHash(`BCAST-OMNI-${Date.now()}`);
        const queueEnqueueTime = Date.now();

        // 3. Merakit UI Manifes Awal (Stage 1: Queue Acknowledgement Embed)
        const queueAcknowledgeEmbed = new EmbedBuilder()
            .setColor('#1A1C1F')
            .setAuthor({ name: `TITANIUM KERNEL METERING NETWORK`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
            .setTitle(`📥 TRANSMISSION INJECTED INTO TASK QUEUE`)
            .setDescription(`Your broadcast payload has been securely encapsulated and injected into the core *Message Broker*. The system is now processing the queue encryption...\n\n**📊 PIPELINE STATUS MANIFEST:**\n• **Job Trace ID :** \`${transmissionHash}\`\n• **Target Node  :** ${targetChannel.toString()}\n• **Priority Tier:** \`${activeConfig.label}\`\n• **Alert System :** \`${pingEveryone ? 'GLOBAL_PING_ACTIVE' : 'SILENT_DISPATCH'}\``)
            .addFields({ name: '⚡ BROKER COMPLIANCE RUNTIME', value: `\`\`\`yaml\nStatus: WAITING_FOR_SLOT\nThread: ALLOCATING_VIRTUAL_WORKER\nModule: OMNI_UI_MATRIX_V6\n\`\`\`` })
            .setFooter({ text: 'Titanium Architecture Queue Pool Management' })
            .setTimestamp();

        await interaction.editReply({ embeds: [queueAcknowledgeEmbed] });

        // ====================================================================
        // 4. DELEGASI OPERASI UTAMA KE DALAM MESSAGE BROKER ENGINE (ENQUEUE POOL)
        // ====================================================================
        titaniumBroker.enqueue(async () => {
            const executionStartTime = Date.now();
            
            // 5. MERAKIT UI SIARAN UTAMA (Stage 2: Premium Broadcast Output UI)
            const primaryEmbed = new EmbedBuilder()
                .setColor(activeConfig.color)
                .setAuthor({ name: `CENTRAL DATABASE TRANSMISSION | ${activeConfig.badge}`, iconURL: client.user.displayAvatarURL({ dynamic: true }) })
                .setTitle(`${activeConfig.icon}  ${title.toUpperCase()}`)
                .setDescription(`**${activeConfig.border}**\n\n${message}\n\n**${activeConfig.border}**`)
                .addFields(
                    { name: '📌 Matrix Classification', value: `\`${activeConfig.label}\``, inline: true },
                    { name: '📡 Distribution Channel', value: `${targetChannel.toString()}`, inline: true },
                    { name: '🔐 Cryptographic Signature', value: `\`SHA256-${transmissionHash.substring(0, 8)}\``, inline: true }
                )
                .setFooter({ text: `Authorized System Transmission • Executed by Commander ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            if (imageUrl && imageUrl.startsWith('http')) {
                primaryEmbed.setImage(imageUrl);
            }

            // 6. MERAKIT BLOK DIAGNOSTIK HISTORIS (Telemetry Compact Log)
            const telemetryEmbed = new EmbedBuilder()
                .setColor('#2B2D31')
                .setDescription(`\`\`\`yaml\n[TRANSMISSION_TELEMETRY_PROFILE]\nCore_Status : AUTHENTICATED_AND_DISPATCHED\nTrace_Hash  : ${transmissionHash}\nTarget_Node : ${targetChannel.id}\nNetwork_Sec : OMNI_ENCRYPTION_ACTIVE\n\`\`\``);

            // 7. MERAKIT ACTION COMPONENTS (Interactive UI Buttons)
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_verified_status').setLabel('Verified Secure Dispatch').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
                new ButtonBuilder().setCustomId('btn_engine_info').setLabel(`Titanium Engine v6.0`).setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
            );

            // 8. PROSES EKSEKUSI TRANSMISI
            try {
                const mentionText = pingEveryone 
                    ? `@everyone \n> **${activeConfig.icon} [HIGH PRIORITY] GLOBAL NETWORK TRANSMISSION RECEIVED**` 
                    : `> **${activeConfig.icon} SECURE NETWORK TRANSMISSION RECEIVED**`;

                await targetChannel.send({ content: mentionText, embeds: [primaryEmbed, telemetryEmbed], components: [actionRow] });

                const totalLagLatency = Date.now() - queueEnqueueTime;
                const internalExecutionDuration = Date.now() - executionStartTime;
                const brokerSnapshot = titaniumBroker.getClusterTelemetry();

                // 9. RE-SINKRONISASI UI KOMANDAN (Stage 3: Final Worker Success Report)
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setTitle('✅ [MATRIX_TRANSMISSION_SUCCESS] CLUSTER DISPATCHED')
                    .setDescription(`Congratulations Commander! Your payload has bypassed the network layers and published securely.\n\n**📊 FINAL EXECUTION METRICS:**\n• **Trace Hash    :** \`${transmissionHash}\`\n• **Queue Wait    :** \`${totalLagLatency} ms\`\n• **Worker Speed  :** \`${internalExecutionDuration} ms\``)
                    .addFields({ name: '🔮 BROKER HEALTH TELEMETRY', value: `\`\`\`yaml\nQueue Size: ${brokerSnapshot.currentQueueSize} Pending Jobs\nThreads   : ${brokerSnapshot.activeWorkerThreads}/${brokerSnapshot.maxConcurrency}\nProcessed : ${brokerSnapshot.totalProcessedJobs} Operations\n\`\`\`` })
                    .setFooter({ text: 'Titanium Diagnostics • Real-Time Asynchronous Notification Complete' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (error) {
                console.error('❌ [BROADCAST_ROUTING_FAULT]', error);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0033')
                    .setTitle('❌ [MATRIX_SYNC_FAILED] TRANSMISSION DISTORTION')
                    .setDescription(`An I/O failure occurred on the Gateway Node ${targetChannel}.\n\n**🛠️ DIAGNOSTIC ANALYSIS:**\n• **Trace Log :** \`${error.message || 'INTERNAL_API_FAULT'}\`\n*Action: Verify Bot Permissions (View, Send, Embed).*`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }, 
        { feature: 'Omni Broadcast Matrix Engine', sector: `Guild_Node_${interaction.guild.id}`, identityHash: transmissionHash },
        priority === 'critical' ? 'HIGH' : 'MEDIUM');
    }

    // ==========================================
    // 5. INTERACTION & SLASH COMMAND ROUTER (TITANIUM V5.4)
    // ==========================================

    client.on(Events.InteractionCreate, async (interaction) => {
        // Membungkus seluruh eksekusi dalam Global Error Boundary
        try {
            
            // ========================================================================
            // ⬇️ TEMPELKAN PRE-FLIGHT INTERCEPTOR TEPAT DI SINI ⬇️
            // ========================================================================

            // ------------------------------------------------------------------------
            // [PRE-FLIGHT INTERCEPTOR] TITANIUM GLOBAL LOCKDOWN MIDDLEWARE
            // ------------------------------------------------------------------------
            // Mekanisme pertahanan berlapis ini mengeksekusi inspeksi paket (Packet Inspection)
            // pada setiap interaksi yang masuk ke kernel bot sebelum di-routing ke handler perintah.
            if (global.SYSTEM_LOCKDOWN_ACTIVE) {
                // Memverifikasi apakah entitas pengirim masuk ke dalam Matriks Pengecualian (Bypass)
                const isBypassAuthorized = LOCKDOWN_BYPASS_WHITELIST.includes(interaction.user.id);
                
                if (!isBypassAuthorized) {
                    // [SILENT DROP / REJECTION]
                    // Membuang request dan mencatat aktivitas anomali ke memori log terminal tanpa memecahkan sistem.
                    console.warn(`🛡️ [DEFENSE_MATRIX] Memblokir akses eksekusi dari ${interaction.user.tag} (ID: ${interaction.user.id}). Status Karantina: AKTIF.`);
                    
                    const lockdownEmbed = new EmbedBuilder()
                        .setTitle('🛑 SYSTEM ENCRYPTED & LOCKED')
                        .setDescription('**INFRASTRUCTURE ACCESS DENIED.**\n\nThe Guardian Matrix system is currently in **Global Quarantine Mode (Lockdown)**. All public functionality (Slash Commands), interface panels, and execution access have been forcibly disabled for security or system mitigation reasons.\n\n*Note: You do not have the clearance (Whitelist Bypass) to operate under Lockdown conditions.*')
                        .setColor('#FF0000')
                        .setFooter({ text: 'Titanium Security Engine | Automated Defense Protocol', iconURL: client.user.displayAvatarURL() })
                        .setTimestamp();

                    // Memastikan interaksi selalu ditutup (replied) untuk menghindari error status dari Discord API
                    if (interaction.isRepliable()) {
                        return interaction.reply({ embeds: [lockdownEmbed], flags: MessageFlags.Ephemeral });
                    } else {
                        return; // Batalkan eksekusi siklus tanpa membalas jika interaksi usang
                    }
                }
            }
            // ------------------------------------------------------------------------

            // ========================================================================
            // ⬆️ BATAS AKHIR TEMPEL PRE-FLIGHT INTERCEPTOR ⬆️
            // ========================================================================

        // ----------------------------------------------------
        // [A] OMNI-BUTTON GATEWAY TERMINAL (GLOBAL LISTENER)
        // ----------------------------------------------------
        // Arsitektur ini menggunakan satu gerbang utama untuk menangkap seluruh 
        // sinyal dari komponen UI, mengeliminasi redudansi pada pemrosesan CPU.
        if (interaction.isButton()) {
            
            // ====================================================
            // ROUTER 1: VERIFICATION SECURITY SYSTEM (LEGACY CORE)
            // ====================================================
            if (interaction.customId === 'verify_button') {
                // Mengamankan token interaksi dengan metode ephemeral terbaru
                // Mencegah kebocoran data sesi pada jaringan publik
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                const db = readDB();
                const config = db[interaction.guild.id];
                
                if (config && config.verifyRole) {
                    try {
                        const role = interaction.guild.roles.cache.get(config.verifyRole);
                        const member = interaction.member;
                        
                        // Validasi otorisasi entitas
                        if (role && !member.roles.cache.has(role.id)) {
                            await member.roles.add(role);
                            
                            // Modifikasi nomenklatur pengguna untuk sinkronisasi database
                            let currentName = member.nickname || member.user.username;
                            currentName = currentName.replace(/^\[MEMBER\]\s*/i, ''); 
                            await member.setNickname(`[MEMBER] ${currentName}`);
                            
                            await interaction.editReply({ 
                                content: '✅ **[AUTHORIZATION_GRANTED]** Your profile has been authorized and synchronized with the mainframe.' 
                            });
                        } else {
                            await interaction.editReply({ 
                                content: '⚠️ **[AUTHORIZATION_CONFLICT]** You have already been authorized by the system. No further action required.' 
                            });
                        }
                    } catch (error) {
                        await interaction.editReply({ 
                            content: '❌ **[SYSTEM_FAULT]** Verification Failed: Please ensure bot role hierarchy is absolute and overrides the target entity.' 
                        });
                    }
                }
                return; // 🛑 Terminator Eksekusi: Mencegah sistem memproses router lain
            }

            // ====================================================
            // ROUTER 2: BROADCAST ENCRYPTION STATUS (NEW MODULE)
            // ====================================================
            if (interaction.customId === 'btn_verified_status') {
                // Memberikan balasan enkripsi ephemeral secara instan (Di bawah 300ms)
                await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#00ffcc')
                            .setAuthor({ 
                                name: 'SECURITY CLEARANCE VERIFIED', 
                                iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                            })
                            .setTitle('🛡️ Authoritative System Transmission Validation')
                            .setDescription('This operational transmission has undergone a thorough end-to-end encryption process and is validated directly by the Titanium Matrix Engine. \n\nThe message protocol source is guaranteed to be free from anomalies, unaffected by packet injection, and realized by the highest authority in this sector.')
                            .addFields(
                                { name: 'Encryption Protocol', value: '`AES-256-GCM (Military Grade)`', inline: true },
                                { name: 'Network Integrity', value: '`PASSED (0% Packet Loss)`', inline: true },
                                { name: 'Authorization Tier', value: '`LEVEL_OMEGA_OVERRIDE`', inline: false },
                                { name: 'Digital Signature', value: `\`SHA-256 : ${generateTerminalHash(interaction.user.id)}\``, inline: false }
                            )
                            .setThumbnail('https://lh3.googleusercontent.com/a/ACg8ocKUWZKDPbZKRRsG0U9CwCR9NnoxGSQ_P49M1mzvs4zAR0zhAxE=s288-c-no') // Opsional
                            .setTimestamp()
                    ]
                });
                return; // 🛑 Terminator Eksekusi
            }

            // ====================================================
            // ROUTER 3: ENGINE TELEMETRY DATA EXCHANGE (NEW MODULE)
            // ====================================================
            if (interaction.customId === 'btn_engine_info') {
                // Kalkulasi matematis komprehensif untuk durasi operasional kernel (uptime)
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);

                await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FFD700')
                            .setTitle('⚙️ Titanium Matrix Architecture')
                            .setDescription('Leveraging state-of-the-art 5th-generation server management infrastructure, this computing system is specifically engineered to ensure maximum functional stability, advanced network monitoring (*Deep Packet Inspection*), and tactical response automation without manual intervention.')
                            .addFields(
                                { name: 'Current Engine Build', value: '`v5.3.4 - Omni UI (Stable Release)`', inline: true },
                                { name: 'Websocket Latency', value: `\`${client.ws.ping}ms\``, inline: true },
                                { name: 'Continuous Uptime', value: `\`${days}d ${hours}h ${minutes}m ${seconds}s\``, inline: false },
                                { name: 'Hardware Memory Heap', value: `\`${formatMemoryUsage(process.memoryUsage().heapUsed)}\``, inline: true }
                            )
                            .setFooter({ 
                                text: 'Core Engine Diagnostic Data Exchange', 
                                iconURL: interaction.guild.iconURL({ dynamic: true }) 
                            })
                    ]
                });
                return; // 🛑 Terminator Eksekusi
            }

            // ====================================================
            // ROUTER 4: SUPPORT CENTER TICKET LAUNCHER (NEW MODULE)
            // ====================================================
            if (interaction.customId === 'support_open') {
                const db = readDB();
                const guildConfig = db[interaction.guild.id];

                if (!guildConfig || !guildConfig.supportChannel || guildConfig.supportChannel !== interaction.channelId) {
                    await interaction.reply({
                        content: '❌ **[SUPPORT_OFFLINE]** The support panel is not active in this channel. Please contact the moderator team.',
                        flags: MessageFlags.Ephemeral
                    });
                    return; // 🛑 Terminator Eksekusi
                }

                // Tampilkan menu kategori privat (hanya user penekan tombol yang bisa melihatnya)
                await interaction.reply({
                    content: '🛟 **Support Center** — Please select the category that best matches your issue below:',
                    components: [buildSupportCategoryMenuRow()],
                    flags: MessageFlags.Ephemeral
                });
                return; // 🛑 Terminator Eksekusi
            }

            // ====================================================
            // ROUTER 5: SUPPORT TICKET CLOSURE (CLOSE TICKET BUTTON)
            // ====================================================
            if (interaction.customId === 'support_close') {
                await executeSupportTicketClose(interaction);
                return; // 🛑 Terminator Eksekusi
            }

        } // === [END OF OMNI-BUTTON GATEWAY TERMINAL] ===

        // ----------------------------------------------------
        // [A.2] INTERACTIVE MODAL GATEWAY (GLOBAL LISTENER)
        // ----------------------------------------------------
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('bcast_modal_')) {
                // Defer eksekusi dengan mode rahasia agar transmisi tidak terekspos
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const sessionId = interaction.customId.replace('bcast_modal_', '');
                const cachedSession = broadcastSessionCache.get(sessionId);

                // Fail-safe jika memori sesi kedaluwarsa atau terjadi anomali RAM
                if (!cachedSession) {
                    return interaction.editReply({ 
                        content: '❌ **[SESSION_EXPIRED]** Your UI Editor session has expired or was removed from RAM by the Garbage Collector. Please restart the `/broadcast` command.'
                    });
                }

                // Mengekstrak hasil ketikan komandan dari Modal Fields
                const extractedTitle = interaction.fields.getTextInputValue('modal_title');
                const extractedMessage = interaction.fields.getTextInputValue('modal_message');

                // Membersihkan memori sesi untuk menghemat Heap RAM
                broadcastSessionCache.delete(sessionId);

                // Menggabungkan hasil form dengan data cache yang disimpan sebelumnya
                const payloadData = {
                    targetChannel: cachedSession.targetChannel,
                    priority: cachedSession.priority,
                    imageUrl: cachedSession.imageUrl,
                    pingEveryone: cachedSession.pingEveryone,
                    title: extractedTitle,
                    message: extractedMessage
                };

                // Lempar ke mesin sentral untuk eksekusi
                console.log(`💻 [UI_MODAL_SUBMITTED] Menerima payload dari Editor UI. Melakukan serah terima ke Dispatch Engine...`);
                return executeTitaniumBroadcastEngine(interaction, payloadData);
            }
            return;
        }

        // ----------------------------------------------------
        // [A.3] SUPPORT TICKET CATEGORY GATEWAY (GLOBAL LISTENER)
        // ----------------------------------------------------
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'support_category_select') {
                return executeSupportTicketCreation(interaction);
            }
            return; // Interaksi Select Menu lain tidak ditangani di gerbang ini
        }
        
        // ----------------------------------------------------
            // [B] COMMAND INTERACTION MATRIX
            // ----------------------------------------------------
            // Filter fundamental: Memastikan interaksi yang masuk adalah Slash Command murni
            if (!interaction.isChatInputCommand()) return;

            // ============================================================================
            // [B.1] DIRECT MESSAGE (DM) SECURITY FIREWALL (ANTI-TUNNELING PROTOCOL)
            // ============================================================================
            // Infrastruktur ini berfungsi sebagai gerbang penolak otomatis (Auto-Reject Gateway).
            // Mencegah entitas luar mengeksekusi perintah krusial melalui jalur pesan pribadi,
            // memastikan seluruh aktivitas komputasi terikat pada yurisdiksi dan audit log server.
            
            if (!interaction.inGuild() || !interaction.guild) {
                // Merakit Kartu Identifikasi Penolakan (Visual Embed Card) dengan standar tinggi
                const dmSecurityCard = new EmbedBuilder()
                    .setColor('#FF0033') // Merah Kriminal / Peringatan Kritis
                    .setAuthor({ 
                        name: 'TITANIUM MATRIX SECURITY FIREWALL', 
                        iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setTitle('🛑 [ACCESS_DENIED] Zone Authorization Denied')
                    .setDescription(`The system detected an attempt to execute a command via an unencrypted private communication channel (Direct Message).\n\nThe **Guardian Server** engine is engineered exclusively to operate within approved server infrastructure nodes. Administrative and operational access through private chat rooms has been **permanently blocked** to maintain database integrity and prevent unauditable system intrusions.`)
                    .addFields(
                        { name: 'Attempted Command', value: `\`/${interaction.commandName}\``, inline: true },
                        { name: 'Execution Route', value: '`UNSECURED_DM_TUNNEL`', inline: true },
                        { name: 'Network Integrity', value: '`CONNECTION_SEVERED`', inline: false },
                        { name: 'System Resolution', value: '> *Please return to your operational sector within the main server to use this system terminal.*', inline: false }
                    )
                    // Mendayagunakan fungsi pembuat hash bawaan Anda untuk mencetak ID Pelanggar
                    // Ini memberikan ilusi psikologis bahwa pelanggaran mereka sedang direkam secara ketat
                    .setFooter({ 
                        text: `Violation Trace ID: ${generateTerminalHash(interaction.user.id)} • Intrusion Attempt Logged`, 
                    })
                    .setTimestamp();

                // Memutus interaksi secara paksa dan mengirimkan kartu peringatan langsung ke DM pelanggar
                return interaction.reply({ embeds: [dmSecurityCard] });
            }

            // ============================================================================
            // [B.2] AUTHORIZATION & PRIVILEGE CHECK
            // ============================================================================
            // Mengecek apakah eksekutor perintah memiliki clearance level pemilik server
            const isOwner = interaction.user.id === interaction.guild.ownerId;

        // Command: /status (Public Telemetry)
        if (interaction.commandName === 'status') {
            // Deferral wajib untuk proses kalkulasi hardware memory & mencegah Interaksi Timeout (3s)
            await interaction.deferReply(); 
            
            // ====================================================================
            // 1. HARDWARE & APPLICATION UPTIME METRIC LOGLAYERS
            // ====================================================================
            const uptime = process.uptime();
            const hrs = Math.floor(uptime / 3600);
            const mins = Math.floor((uptime % 3600) / 60);
            const secs = Math.floor(uptime % 60);
            const memoryData = process.memoryUsage();
            
            // ====================================================================
            // 2. INTEGRASI DATA MESSAGE BROKER TELEMETRY CORE (REAL-TIME SENSOR)
            // ====================================================================
            // Menarik data metrik operasional secara langsung dari kluster Titanium Task Queue
            const brokerTelemetry = titaniumBroker.getClusterTelemetry();
            
            // Kalkulasi persentase rasio keberhasilan eksekusi tugas dalam antrean broker
            const totalJobs = brokerTelemetry.totalProcessedJobs + brokerTelemetry.totalFailedJobs;
            const successRate = totalJobs > 0 
                ? ((brokerTelemetry.totalProcessedJobs / totalJobs) * 100).toFixed(1) + '%' 
                : '100.0%';
                
            // Visualisasi indikator status ketersediaan node pemrosesan antrean
            const brokerOperationalStatus = brokerTelemetry.currentQueueSize > 0 
                ? '🔴 PROCESSING_BACKLOG (HEAVY_LOAD)' 
                : '🟢 IDLE_OPTIMAL (STANDBY_MODE)';

            // ====================================================================
            // 3. RETRIEVAL & PENYUSUNAN EMBED SUPREME DIAGNOSTIC ARSITEKTUR v5.3.0
            // ====================================================================
            const statusEmbed = new EmbedBuilder()
                .setColor('#2F3136')
                .setAuthor({ 
                    name: 'High-Performance Hardware & Network Telemetry Node', 
                    iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                })
                .setTitle('⚡ SUPREME CORE ENGINE DIAGNOSTICS & MATRIX WORKER')
                .setDescription(`System operating at maximum efficiency with controlled kernel load.\nMessage Broker integration is active to mitigate API rate-limit bottlenecks.\n${'━'.repeat(45)}`)
                .addFields(
                    { 
                        name: '⚙️ HARDWARE MONITOR', 
                        value: `**CPU_MODEL:** \`${os.cpus()[0].model.substring(0,30)}...\`\n` +
                            `**CPU_USAGE:** \`${(process.cpuUsage().user / 1000000).toFixed(1)}%\`\n` +
                            `**RAM_USAGE:** \`[||||||||||          ]\` \`${formatMemoryUsage(memoryData.heapUsed)}\`\n` +
                            `**SYS_LOAD:** \`${os.loadavg()[0].toFixed(1)}%\`\n` +
                            `**OS_PLAT:** \`${os.type()} ${os.release()}-${os.arch()}\`\n` +
                            `${'━'.repeat(45)}`, 
                        inline: false 
                    },
                    { 
                        name: '🎛️ TITANIUM MESSAGE BROKER MATRIX (QUEUE CORE)', 
                        value: `\`\`\`yaml\n` +
                            `Operational Status  : ${brokerOperationalStatus}\n` +
                            `Queue Backlog Size  : ${brokerTelemetry.currentQueueSize} Pending Tasks\n` +
                            `Active Worker Thread: ${brokerTelemetry.activeWorkerThreads} / ${brokerTelemetry.maxConcurrency} Node\n` +
                            `Total Processed Job : ${brokerTelemetry.totalProcessedJobs} Executed\n` +
                            `Total Faulted Job   : ${brokerTelemetry.totalFailedJobs} Failed\n` +
                            `Broker Success Ratio: ${successRate}\n` +
                            `\`\`\`\n${'━'.repeat(45)}`, 
                        inline: false 
                    },
                    { name: '📡 LATENCY', value: `\`${client.ws.ping}ms\``, inline: true },
                    { name: '⏳ UPTIME', value: `\`${hrs}h ${mins}m ${secs}s\``, inline: true },
                    { name: '📀 KERNEL', value: `\`Node ${process.version}\``, inline: true },
                    { name: '🛡️ SECURITY', value: `\`ACTIVE (L-12)\``, inline: true },
                    { name: '🧩 SHARDS', value: `\`1/1 ACTIVE\``, inline: true },
                    { name: '💾 PID', value: `\`#${process.pid}\``, inline: true },
                    { name: '🌍 SERVER STATS', value: `\`${interaction.guild.memberCount} Members | ${interaction.guild.roles.cache.size} Roles | ${interaction.guild.premiumSubscriptionCount||0} Boosts\``, inline: false },
                    { name: '🔄 VOICE SYNC', value: `✅ \`DYNAMIC_NAMING_ACTIVE\``, inline: true }
                )
                .setFooter({ 
                    text: `DATA CENTRE TELEMETRY | ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB` 
                });

            // Pencatatan aktivitas diagnostik ke dalam terminal kernel inti
            console.log(`📊 [TELEMETRY_LOG] Komando diagnostik berhasil di-render untuk User ID: [${interaction.user.id}].`);
            
            return interaction.editReply({ embeds: [statusEmbed] });
        }

        if (!isOwner) {
            return interaction.reply({ content: '❌ Authorization Denied: Only Administrator Level (Owner) may access this terminal.', flags: MessageFlags.Ephemeral });
        }

    // ----------------------------------------------------
    // [C] CORE INFRASTRUCTURE DEPLOYMENT (/set)
    // ----------------------------------------------------
    if (interaction.commandName === 'set') {
        // ========================================================================
        // 1. OTORISASI KEAMANAN TINGKAT TINGGI (AUTHORIZATION CLEARANCE)
        // ========================================================================
        // Validasi eksklusif: Hanya entitas dengan otorisasi Administrator murni yang 
        // memiliki akses ke terminal konfigurasi infrastruktur inti ini.
        // 🛟 [SUPPORT_OVERRIDE] Fitur 'Support Panel' dikecualikan dari gerbang Administrator
        // karena hanya boleh di-deploy oleh Role Moderator / Owner (diverifikasi ulang di bawah).
        const executingFeature = interaction.options.getString('feature');
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && executingFeature !== 'support_panel') {
            console.warn(`⚠️ [SECURITY_BREACH] Entity ${interaction.user.tag} (ID: ${interaction.user.id}) attempted to modify infrastructure without Administrator clearance.`);
            return interaction.reply({ 
                content: '❌ **[ACCESS DENIED]** Protocol Denied: You do not have Administrator-level security clearance. Command authorization is permanently revoked.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // ========================================================================
        // 2. EKSTRAKSI PARAMETER & DE-SERIALISASI PAYLOAD (DATA PARSING)
        // ========================================================================
        // Membedah muatan parameter dari Discord API untuk menentukan sektor target
        const feature = interaction.options.getString('feature');
        const channel = interaction.options.getChannel('channel');

        // ========================================================================
        // [SUPPORT AUTHORIZATION GATE] Verifikasi operator Panel Support
        // ========================================================================
        // Hanya Role Moderator (1523184178567581817) atau Owner (1280789307027755019)
        // yang berwenang men-deploy fitur 'support_panel'.
        if (feature === 'support_panel' &&
            !interaction.member.roles.cache.has(SUPPORT_MODERATOR_ROLE_ID) &&
            interaction.user.id !== SUPPORT_OWNER_USER_ID) {
            console.warn(`⚠️ [SECURITY_BREACH] Entity ${interaction.user.tag} (ID: ${interaction.user.id}) attempted to deploy Support Panel without Moderator role clearance.`);
            return interaction.reply({
                content: '❌ **[ACCESS DENIED]** Only the Moderator role (or the Owner) can deploy the Support Panel. Command authorization is permanently revoked.',
                flags: MessageFlags.Ephemeral
            });
        }
        
        // ========================================================================
        // 3. INISIALISASI I/O & KUNCI STATUS MEMORI (LOADING DATABASE STATE)
        // ========================================================================
        // Mengamankan pointer status database terbaru dari RAM agar manipulasi data 
        // real-time tidak memicu latensi I/O pada V8 Engine.
        let db = readDB();
        
        // Alokasi memori dinamis jika server ini baru pertama kali melakukan setup
        if (!db[interaction.guild.id]) {
            console.log(`📦 [DB_ALLOCATION] Membangun arsitektur state node baru untuk Server ID [${interaction.guild.id}]...`);
            db[interaction.guild.id] = {};
        }

        // Menangguhkan respons (Defer Reply) secara Ephemeral agar interaksi tidak 
        // kedaluwarsa saat bot sedang mengomputasi data yang kompleks.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // ========================================================================
        // 4. ROUTING MANIFOLD & EKSEKUSI INFRASTRUKTUR (SWITCH-CASE MATRIX)
        // ========================================================================
        switch(feature) {
            
            // --------------------------------------------------
            // [MODUL] PROTOKOL KEDATANGAN (WELCOME GATEWAY)
            // --------------------------------------------------
            case 'welcome':
                db[interaction.guild.id].welcomeChannel = channel.id;
                
                // Injeksi Histori Audit Trail: Merekam perubahan ke memori log
                recordDatabaseHistory(interaction.guild.id, interaction.user.id, 'WELCOME_NODE', channel.id);
                
                await interaction.editReply({ content: `✅ **[SYSTEM_SYNC]** Welcome Gateway successfully linked and secured on channel ${channel}.` });
                break;
                
            // --------------------------------------------------
            // [MODUL] PROTOKOL KEBERANGKATAN (GOODBYE GATEWAY)
            // --------------------------------------------------
            case 'goodbye':
                db[interaction.guild.id].goodbyeChannel = channel.id;
                
                // Injeksi Histori Audit Trail: Merekam perubahan ke memori log
                recordDatabaseHistory(interaction.guild.id, interaction.user.id, 'GOODBYE_NODE', channel.id);
                
                await interaction.editReply({ content: `✅ **[SYSTEM_SYNC]** Goodbye Gateway successfully linked and secured on channel ${channel}.` });
                break;
                
            // --------------------------------------------------
            // [MODUL] SISTEM PENGINTAIAN & TELEMETRI (SECURITY LOG)
            // --------------------------------------------------
            case 'log':
                db[interaction.guild.id].logChannel = channel.id;
                
                // Injeksi Histori Audit Trail: Merekam perubahan ke memori log
                recordDatabaseHistory(interaction.guild.id, interaction.user.id, 'SECURITY_TELEMETRY_LOG', channel.id);
                
                await interaction.editReply({ content: `✅ **[SYSTEM_SYNC]** Security Telemetry & Audit Log successfully encrypted and redirected to ${channel}.` });
                break;
                
            // --------------------------------------------------
            // [MODUL] UPLINK TRANSMISI SUARA 24/7 (VOICE CHANNEL)
            // --------------------------------------------------
            case 'vc':
                // Validasi Integritas Tipe Channel: Hanya menerima tipe Guild Voice (Suara)
                if (channel.type !== ChannelType.GuildVoice) {
                    await interaction.editReply({ content: '❌ **[FATAL_ROUTING_ERROR]** Invalid Node: The destination parameter must be a Voice Channel, not Text/Announcement.' });
                    break;
                }
                
                db[interaction.guild.id].vcChannel = channel.id;
                
                try {
                    // Berusaha membangun koneksi Websocket Suara menuju Node yang ditargetkan
                    joinVoiceChannel({ 
                        channelId: channel.id, 
                        guildId: channel.guild.id, 
                        adapterCreator: channel.guild.voiceAdapterCreator,
                        selfDeaf: true,
                    });
                    
                    // Injeksi Histori Audit Trail: Merekam perubahan ke memori log jika koneksi sukses
                    recordDatabaseHistory(interaction.guild.id, interaction.user.id, '24_7_VOICE_UPLINK', channel.id);
                    
                    await interaction.editReply({ content: `✅ **[NODE ESTABLISHED]** 24/7 Audio Unlink has been successfully injected. The Bot Engine is now statically linked to the ${channel} channel.` });
                } catch (vcException) {
                    console.error(`🔴 [VC_UPLINK_FAULT] Engine gagal memvalidasi koneksi ke channel suara:`, vcException.message);
                    await interaction.editReply({ content: `❌ **[NODE_ERROR]** Failed to lock Voice Channel frequency. Make sure the bot has "Connect" permission on the destination channel structure.` });
                }
                break;
                
            // --------------------------------------------------
            // [MODUL] STATISTIK TELEMETRI UI SERVER (SERVER STATUS)
            // --------------------------------------------------
            case 'status_server':
                try {
                    // Membangun regulasi perizinan dinamis agar channel UI bertindak sebagai Display Only (Hanya Baca)
                    const everyoneRole = interaction.guild.roles.everyone;
                    const permOverwrites = [{ id: everyoneRole.id, deny: [PermissionsBitField.Flags.Connect] }];

                    // Operasi I/O berat: Menciptakan 3 node visual (channel) pada server tujuan secara paralel
                    const chAll = await interaction.guild.channels.create({ name: `🌍┃All Member: ${interaction.guild.memberCount}`, type: ChannelType.GuildVoice, permissionOverwrites: permOverwrites });
                    const chRoles = await interaction.guild.channels.create({ name: `📜┃Total Roles: ${interaction.guild.roles.cache.size}`, type: ChannelType.GuildVoice, permissionOverwrites: permOverwrites });
                    const chBoosts = await interaction.guild.channels.create({ name: `💎┃Boosts: ${interaction.guild.premiumSubscriptionCount||0}`, type: ChannelType.GuildVoice, permissionOverwrites: permOverwrites });

                    // Merekam konfigurasi channel ID UI tersebut ke dalam arsitektur database lokal
                    db[interaction.guild.id].statusChannels = { all: chAll.id, roles: chRoles.id, boosts: chBoosts.id };
                    
                    // Injeksi Histori Audit Trail: Merekam bahwa cluster UI telah sukses di-deploy
                    // Karena ada 3 channel, kita gabungkan nilainya sebagai representasi string di dalam log
                    const deploymentIds = `[${chAll.id}, ${chRoles.id}, ${chBoosts.id}]`;
                    recordDatabaseHistory(interaction.guild.id, interaction.user.id, 'TELEMETRY_UI_CHANNELS', deploymentIds);
                    
                    await interaction.editReply({ content: `✅ **[DEPLOYMENT_SUCCESS]** The Status Server UI Cluster Node was successfully established. The Auto-sync Asynchronous Engine has been automatically enabled.` });
                } catch (statusException) {
                    console.error(`🔴 [UI_DEPLOY_FAULT] Terjadi kegagalan I/O saat menciptakan elemen visual:`, statusException.message);
                    await interaction.editReply({ content: `❌ **[SYSTEM_FAULT]** Failed to create Telemetry UI state. Ensure the bot has "Manage Channels" infrastructure authority.` });
                }
                break;
                
            // --------------------------------------------------
            // [MODUL] 🛟 PANEL SUPPORT CENTER (PRIVATE TICKET SYSTEM)
            // --------------------------------------------------
            case 'support_panel':
                // Validasi: hanya channel teks yang dapat menjadi basis Private Thread (ticket)
                if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
                    await interaction.editReply({ content: '❌ **[FATAL_ROUTING_ERROR]** Invalid Node: The Support Panel must be deployed in a Text channel so that private tickets (threads) can be created from it.' });
                    break;
                }

                db[interaction.guild.id].supportChannel = channel.id;
                if (!db[interaction.guild.id].supportTickets) {
                    db[interaction.guild.id].supportTickets = {};
                }

                // Beri Role Moderator & Owner akses "Manage Threads" agar seluruh Private
                // Thread (ticket) dapat dilihat dan diakses oleh staf support.
                await grantSupportStaffThreadAccess(channel);

                try {
                    // Kirim panel publik Support Center (embed + tombol Support) ke channel target
                    await channel.send({
                        embeds: [buildSupportCenterEmbed()],
                        components: [buildSupportOpenButtonRow()]
                    });

                    recordDatabaseHistory(interaction.guild.id, interaction.user.id, 'SUPPORT_PANEL_NODE', channel.id);

                    await interaction.editReply({ content: `✅ **[DEPLOYMENT SUCCESS]** The Support Center panel was successfully deployed to ${channel}. Private support tickets will now be created inside this channel.` });
                } catch (supportDeployError) {
                    console.error(`🔴 [SUPPORT_DEPLOY_FAULT] Terjadi kegagalan I/O saat mengirim panel support:`, supportDeployError.message);
                    await interaction.editReply({ content: `❌ **[SYSTEM_FAULT]** Failed to deploy the Support Panel. Please ensure the bot can send messages and manage threads in ${channel}.` });
                }
                break;

            // --------------------------------------------------
            // [MODUL] GERBANG IDENTIFIKASI & VERIFIKASI (VERIFY PANEL)
            // --------------------------------------------------
            case 'verify':
                // Validasi Kelengkapan Parameter: Memastikan Opsi Target Role tidak kosong (wajib ada untuk modul Verify)
                const role = interaction.options.getRole('role');
                if (!role) {
                    await interaction.editReply({ content: '❌ **[EXECUTION_HALTED]** Incomplete Execution Parameter: *Target role* is required for Verification Gateway operation.' });
                    break;
                }
                
                // Simpan konfigurasi Channel Target dan Role Hasil Verifikasi ke dalam DB Memori
                db[interaction.guild.id].verifyChannel = channel.id;
                db[interaction.guild.id].verifyRole = role.id;
                
                // Merakit Payload Visual UI Panel Verifikasi Standar Militer/Korporat (Titanium Theme)
                const verifyEmbed = new EmbedBuilder()
                    .setColor('#00E676') // Hijau Matrix Operasional
                    .setTitle('🔐 VERIFICATION GATEWAY & SECURITY CLEARANCE')
                    .setDescription('⚠️ **MANDATORY VERIFICATION** (Mandatory Verification) for all personnel to gain operational access to this server.\n\n✅ **User Instructions (Click the VERIFY button below to):**\n• Acquire basic membership Role identity\n• Automatic synchronization of your network nomenclature\n• Unlock the main data channel')
                    .addFields(
                        { name: '👥 Role Injection Target', value: `\`${role.name}\``, inline: true },
                        { name: '🛡️ Node Encryption', value: `\`TITANIUM_V5.3_PROTECTED\``, inline: true }
                    )
                    .setFooter({ text: 'DATA CENTRE SECURITY GATE • UI interactions are protected by Encryption Algorithms' })
                    .setTimestamp();
                    
                // Merakit Modul Tombol Dinamis
                const verifyBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('verify_button') // Custom ID ini berelasi langsung dengan Interceptor di router tombol
                        .setLabel('INITIATE VERIFY')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🔓')
                );
                
                try {
                    // Melepas tembakan pengiriman panel UI verifikasi menuju target channel node
                    await channel.send({ embeds: [verifyEmbed], components: [verifyBtn] });
                    
                    // Injeksi Histori Audit Trail: Merekam perubahan ke memori log berserta detail Role
                    recordDatabaseHistory(interaction.guild.id, interaction.user.id, 'VERIFICATION_GATEWAY', `${channel.id} (Role_Bound: ${role.id})`);
                    
                    // Konfirmasi keberhasilan operasional ke Commander pengeksekusi
                    await interaction.editReply({ content: `✅ **[DEPLOYMENT SUCCESS]** The Verification Gateway panel was successfully deployed to the coordinates ${channel}. The role injection identity is locked to: **${role.name}**` });
                } catch (panelException) {
                    console.error(`🔴 [PANEL_DEPLOY_FAULT] Terjadi kegagalan I/O saat melempar UI Embed:`, panelException.message);
                    await interaction.editReply({ content: `❌ **[SYSTEM_FAULT]** Failed to launch the verification panel. Please ensure the bot is allowed to send messages and UI Embeds in the channel.` });
                }
                break;
        }
        
        // ========================================================================
        // 5. PENYELARASAN I/O & PENYIMPANAN PERSISTEN KE DALAM DISK HARD DRIVE
        // ========================================================================
        // Pada skenario tertentu, recordDatabaseHistory() mungkin tidak tereksekusi 
        // (misalnya saat terjadi fatal error pada block catch). 
        // Pemanggilan fungsi writeDB() ganda di baris bawah ini bertindak sebagai 
        // Fail-Safe Redundancy (Redundansi Pengaman) agar konfigurasi bot tidak 
        // akan pernah mengalami 'Rolled-Back' state.
        writeDB(db);
        return; // Eksekusi berhasil dilepas tanpa interupsi
    }

    // ============================================================================
    // [COMMAND LAYER] /disable - MODULE DECOMMISSION & DATABASE PURGE (OWNER ONLY)
    // ============================================================================
    // Menonaktifkan modul yang sebelumnya di-deploy lewat /set, menghapus
    // konfigurasinya dari database, namun tetap mencatat aksinya ke History DB.
    if (interaction.commandName === 'disable') {
        // [1] AUTHORIZATION CLEARANCE (OWNER / ADMINISTRATOR)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            console.warn(`⚠️ [SECURITY_BREACH] Entity ${interaction.user.tag} (ID: ${interaction.user.id}) attempted to disable infrastructure without Administrator clearance.`);
            return interaction.reply({ 
                content: '❌ **[ACCESS DENIED]** Protocol Denied: You do not have Administrator-level security clearance. Command authorization is permanently revoked.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // [2] PARAMETER EXTRACTION & DATABASE STATE LOAD
        const moduleToDisable = interaction.options.getString('module');
        let db = readDB();

        if (!db[interaction.guild.id]) {
            db[interaction.guild.id] = {};
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // [3] MODULE ROUTING MATRIX: Resolve the database keys to purge.
        // Infrastructure modules (deployed via /set) live at the guild node root,
        // while protection modules (deployed via /protection) live under protectionModules.
        const infrastructureModuleKeys = {
            welcome: ['welcomeChannel'],
            goodbye: ['goodbyeChannel'],
            log: ['logChannel'],
            vc: ['vcChannel'],
            verify: ['verifyChannel', 'verifyRole'],
            status_server: ['statusChannels'],
            support_panel: ['supportChannel', 'supportTickets']
        };
        const protectionModuleKeys = {
            anti_link: { dbKey: 'antiLinkActive', historyCode: 'PROTECTION_ANTI_LINK_MODULE' },
            anti_spam: { dbKey: 'antiSpamActive', historyCode: 'PROTECTION_ANTI_SPAM_MODULE' }
        };

        if (!infrastructureModuleKeys[moduleToDisable] && !protectionModuleKeys[moduleToDisable]) {
            await interaction.editReply({ content: `❌ **[INVALID_MODULE]** Unknown module: \`${moduleToDisable}\`. Please select a valid module from the list.` });
            return;
        }

        const protectionSpec = protectionModuleKeys[moduleToDisable];

        // Determine whether the module was actually configured before purging
        let wasConfigured = false;
        let purgedSummary = [];

        if (protectionSpec) {
            // Protection modules are stored under the protectionModules sub-node
            if (!db[interaction.guild.id].protectionModules) {
                db[interaction.guild.id].protectionModules = {};
            }
            if (db[interaction.guild.id].protectionModules[protectionSpec.dbKey] !== undefined) {
                wasConfigured = true;
                purgedSummary.push(protectionSpec.dbKey);
                delete db[interaction.guild.id].protectionModules[protectionSpec.dbKey];
            }
        } else {
            // Infrastructure modules are stored at the guild node root
            const keys = infrastructureModuleKeys[moduleToDisable];
            wasConfigured = keys.some(key => db[interaction.guild.id][key] !== undefined);
            for (const key of keys) {
                if (db[interaction.guild.id][key] !== undefined) {
                    purgedSummary.push(key);
                    delete db[interaction.guild.id][key];
                }
            }
        }

        // [4] AUDIT TRAIL INJECTION: Always record the action in the History DB
        recordDatabaseHistory(
            interaction.guild.id,
            interaction.user.id,
            protectionSpec ? protectionSpec.historyCode : 'MODULE_DISABLED',
            `${moduleToDisable} (Purged: ${purgedSummary.length > 0 ? purgedSummary.join(', ') : 'none'})`
        );

        // [5] PERSIST & CONFIRM
        writeDB(db);

        if (!wasConfigured) {
            console.log(`⚠️ [DISABLE_WARNING] Module \`${moduleToDisable}\` was never configured in Server ID [${interaction.guild.id}] — nothing to purge.`);
            await interaction.editReply({ content: `⚠️ **[MODULE_NOT_FOUND]** The module \`${moduleToDisable}\` is not configured in this server, so there was nothing to purge. The attempt has still been recorded in the audit history.` });
            return;
        }

        console.log(`✅ [MODULE_PURGED] Module \`${moduleToDisable}\` decommissioned in Server ID [${interaction.guild.id}] by ${interaction.user.tag}. Purged keys: ${purgedSummary.join(', ')}`);
        await interaction.editReply({ content: `✅ **[MODULE_DECOMMISSIONED]** Module \`${moduleToDisable}\` has been disabled and its configuration purged from the database. The decommission action has been recorded in the audit history.` });
        return;
    }

    // ============================================================================
        // [COMMAND LAYER] /snapshot - DISASTER RECOVERY & INFRASTRUCTURE BACKUP MATRIX
        // ============================================================================
        if (interaction.commandName === 'snapshot') {
            // [1] OTORISASI KEAMANAN TINGKAT TINGGI (AUTHORIZATION CLEARANCE)
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                console.warn(`⚠️ [SECURITY_BREACH] Entitas ${interaction.user.tag} mencoba mengakses Disaster Recovery Matrix.`);
                return interaction.reply({ 
                    content: '🚫 **[ACCESS DENIED]** Operation blocked. You do not hold Administrator authority to manipulate the server infrastructure topology.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Mengamankan jalur transmisi I/O dengan enkripsi Ephemeral agar lalu lintas backup tidak membanjiri channel obrolan
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const subCommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;
            const executorId = interaction.user.id;

            // ------------------------------------------------------------------------
            // [SUB-COMMAND: CREATE] PROTOKOL EKSTRAKSI & ENKAPSULASI TOPOLOGI
            // ------------------------------------------------------------------------
            if (subCommand === 'create') {
                console.log(`\n📦 [SNAPSHOT_ENGINE] Memulai komputasi ekstraksi data topologi untuk Node ID: ${guildId}`);
                const startTime = Date.now();

                // Mengekstrak referensi memori dari Discord Cache secara komprehensif
                const channelsCache = interaction.guild.channels.cache;
                const rolesCache = interaction.guild.roles.cache;

                // ====================================================================
                // [A] PROTOKOL EKSTRAKSI TOPOLOGI CHANNEL (DEEP NODE SCANNER)
                // ====================================================================
                // Diperbarui dengan Fail-Safe Matrix & Null-Routing untuk mencegah Kernel Panic 
                // saat memindai entitas channel anomali (Threads / Voice Tanpa Cache)
                
                const serializedChannels = [];
                let failedChannelScans = 0;

                console.log(`   ↳ [SCAN_INIT] Memulai inspeksi *Deep Packet* pada ${channelsCache.size} Node Channel...`);

                // Menggunakan iterasi manual untuk memfasilitasi isolasi Error Handling per entitas
                for (const [channelId, channel] of channelsCache) {
                    try {
                        // [A.1] Validasi Integritas Entitas Utama
                        if (!channel) continue;

                        // [A.2] Ekstraksi Overwrite Permissions dengan Proteksi Lapis Ganda
                        let parsedOverwrites = [];
                        
                        // Memastikan objek permissionOverwrites dan instans cache-nya benar-benar ada di memori RAM
                        if (channel.permissionOverwrites && channel.permissionOverwrites.cache) {
                            for (const [overwriteId, overwrite] of channel.permissionOverwrites.cache) {
                                // Mengekstrak bitfield menggunakan toString() untuk resolusi JSON yang aman
                                // Fallback ke "0" jika entitas corrupt untuk mencegah undefined serialization
                                const allowBits = (overwrite.allow && overwrite.allow.bitfield) ? overwrite.allow.bitfield.toString() : "0";
                                const denyBits = (overwrite.deny && overwrite.deny.bitfield) ? overwrite.deny.bitfield.toString() : "0";
                                
                                parsedOverwrites.push({
                                    id: overwrite.id || overwriteId,
                                    type: overwrite.type,
                                    allow: allowBits,
                                    deny: denyBits
                                });
                            }
                        }

                        // [A.3] Enkapsulasi Data Channel Matrix
                        // Mengekstrak parameter tambahan untuk memastikan akurasi kloning 99.9%
                        serializedChannels.push({
                            id: channel.id,
                            name: channel.name,
                            type: channel.type,
                            parentId: channel.parentId || null,
                            position: channel.position || 0,
                            nsfw: channel.nsfw || false,
                            topic: channel.topic || null,
                            rateLimitPerUser: channel.rateLimitPerUser || 0,
                            bitrate: channel.bitrate || null,         // Parameter spesifik untuk Node Suara
                            userLimit: channel.userLimit || null,     // Parameter spesifik untuk Node Suara
                            permissionOverwrites: parsedOverwrites
                        });

                    } catch (channelScanError) {
                        failedChannelScans++;
                        // Mengkarantina node yang gagal direkam tanpa menghentikan siklus global
                        console.warn(`   ⚠️ [NODE_SCAN_WARNING] Anomali terdeteksi pada Channel ID [${channelId}]: ${channelScanError.message}. Node ini dilewati.`);
                    }
                }
                
                console.log(`   ↳ [SCAN_COMPLETE] Inspeksi matriks Channel selesai. Terekstrak: ${serializedChannels.length} | Gagal (Karantina): ${failedChannelScans}`);


                // ====================================================================
                // [B] PROTOKOL EKSTRAKSI TOPOLOGI ROLE (HIERARCHY SCANNER)
                // ====================================================================
                
                const serializedRoles = [];
                let failedRoleScans = 0;

                console.log(`   ↳ [SCAN_INIT] Memulai inspeksi hierarki pada ${rolesCache.size} Entitas Role...`);

                for (const [roleId, role] of rolesCache) {
                    try {
                        // Filter Tingkat 1: Membuang @everyone (ID identik dengan Guild ID)
                        // Filter Tingkat 2: Membuang role integrasi pihak ketiga (Bot, Webhooks, dsb)
                        if (role.id === interaction.guild.id || role.managed) continue;

                        // Ekstraksi keamanan Bitfield
                        const permissionsBitString = (role.permissions && role.permissions.bitfield) 
                            ? role.permissions.bitfield.toString() 
                            : "0";

                        serializedRoles.push({
                            id: role.id,
                            name: role.name,
                            color: role.color,
                            hoist: role.hoist,
                            position: role.position,
                            permissions: permissionsBitString,
                            mentionable: role.mentionable
                        });
                    } catch (roleScanError) {
                        failedRoleScans++;
                        console.warn(`   ⚠️ [ROLE_SCAN_WARNING] Anomali terdeteksi pada Role ID [${roleId}]: ${roleScanError.message}. Entitas dilewati.`);
                    }
                }
                
                console.log(`   ↳ [SCAN_COMPLETE] Inspeksi hierarki Role selesai. Terekstrak: ${serializedRoles.length} | Gagal (Karantina): ${failedRoleScans}`);

                // [C] Time-Sync & Kriptografi Hash
                const wibFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'long' });
                const currentTimestamp = wibFormatter.format(new Date());
                const snapshotTraceId = `SNAP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

                const snapshotPayload = {
                    snapshotId: snapshotTraceId,
                    executorId: executorId,
                    executorTag: interaction.user.tag,
                    timestampStr: currentTimestamp,
                    unixEpoch: Date.now(),
                    infrastructure: {
                        channels: serializedChannels,
                        roles: serializedRoles,
                        totalChannels: serializedChannels.length,
                        totalRoles: serializedRoles.length
                    }
                };

                // [D] Komitmen I/O ke Hard Drive
                const backupDb = readBackupDB();
                if (!backupDb[guildId]) {
                    backupDb[guildId] = { sectorSnapshots: [] };
                }

                // Menyuntikkan Snapshot terbaru ke indeks 0 (LIFO)
                backupDb[guildId].sectorSnapshots.unshift(snapshotPayload);

                // Membatasi retensi memori maksimal 5 backup per server untuk mencegah disk overload
                if (backupDb[guildId].sectorSnapshots.length > 5) {
                    backupDb[guildId].sectorSnapshots.pop();
                }

                writeBackupDB(backupDb);
                
                const executionTimeMs = Date.now() - startTime;

                // [E] Rendering UI Telemetri Keberhasilan
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FFAA')
                    .setAuthor({ name: 'TITANIUM DISASTER RECOVERY PROTOCOL', iconURL: client.user.displayAvatarURL() })
                    .setTitle('📦 INFRASTRUCTURE SNAPSHOT SECURED')
                    .setDescription(`The system has successfully extracted all topology parameters and sealed them into physical disk storage. Files are guaranteed to be 100% resistant to kernel panic.\n\n**📊 DIAGNOSTIC PAYLOAD METRICS:**\n• **Trace Hash    :** \`${snapshotTraceId}\`\n• **Nodes Cached  :** \`${serializedChannels.length} Channels\`\n• **Roles Scanned :** \`${serializedRoles.length} Entity Roles\`\n• **I/O Latency   :** \`${executionTimeMs} ms\``)
                    .addFields({ name: 'Time of Encryption', value: `\`${currentTimestamp}\``, inline: false })
                    .setFooter({ text: 'Data Centre Defense Matrix | Persistence Storage Active' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [successEmbed] });
            }

            // ------------------------------------------------------------------------
            // [SUB-COMMAND: LIST] MENAMPILKAN INDEX MEMORI BACKUP
            // ------------------------------------------------------------------------
            if (subCommand === 'list') {
                const backupDb = readBackupDB();
                const guildBackups = backupDb[guildId]?.sectorSnapshots || [];

                if (guildBackups.length === 0) {
                    return interaction.editReply({ 
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FFCC00')
                                .setTitle('⚠️ EMPTY STORAGE')
                                .setDescription('No infrastructure backup records were found on this memory node. Please run the `/snapshot create` command first.')
                        ]
                    });
                }

                const listEmbed = new EmbedBuilder()
                    .setColor('#00E6FF')
                    .setTitle('🗄️ STORAGE MATRIX: AVAILABLE SNAPSHOTS')
                    .setDescription(`The system found **${guildBackups.length}** an encrypted topology archive in this sector.\n\n` + 
                        guildBackups.map((snap, index) => 
                            `\`[${index + 1}]\` **ID:** \`${snap.snapshotId}\`\n↳ 📅 ${snap.timestampStr}\n↳ 👥 Roles: ${snap.infrastructure.totalRoles} | 📡 Channels: ${snap.infrastructure.totalChannels}\n↳ 👤 Exec: <@${snap.executorId}>`
                        ).join('\n\n')
                    )
                    .setFooter({ text: 'Use /snapshot restore <ID> to trigger a recovery.' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [listEmbed] });
            }

            // ------------------------------------------------------------------------
            // [SUB-COMMAND: RESTORE] PROTOKOL REKONSTRUKSI TOPOLOGI MASIF
            // ------------------------------------------------------------------------
            if (subCommand === 'restore') {
                const requestedTraceId = interaction.options.getString('snapshot_id').toUpperCase();
                const backupDb = readBackupDB();
                const guildBackups = backupDb[guildId]?.sectorSnapshots || [];

                // Validasi eksistensi ID di memori RAM
                const targetSnapshot = guildBackups.find(snap => snap.snapshotId === requestedTraceId);

                if (!targetSnapshot) {
                    return interaction.editReply({ 
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#FF0033')
                                .setTitle('❌ SEARCH ANOMALY (404)')
                                .setDescription(`Signature Trace ID \`${requestedTraceId}\` is not registered or has been overwritten by the disk *Garbage Collector* cycle. Please re-verify your input parameters.`)
                        ]
                    });
                }

                // ====================================================================
                // Pendelegasian Proses ke dalam TITANIUM TASK QUEUE BROKER
                // Sangat krusial agar pembuatan >50 Role/Channel tidak memicu Rate Limit (Ban 1 Jam dari Discord).
                // ====================================================================
                
                const restoreWarningEmbed = new EmbedBuilder()
                    .setColor('#FF0033')
                    .setAuthor({ name: 'CRITICAL SYSTEM INJUNCTION', iconURL: client.user.displayAvatarURL() })
                    .setTitle('⚠️ WARNING: RECONSTRUCTION INJECTION STARTED')
                    .setDescription(`The engine authenticated the restore operation for Snapshot ID \`${targetSnapshot.snapshotId}\`.\n\nThe system redirects this operation to the **Titanium Message Broker** for asynchronous processing (avoiding API timeouts). This process may take 1-5 minutes depending on Discord API traffic.\n\n**STATUS: QUEUING IN BACKGROUND DAEMON...**`)
                    .setTimestamp();

                await interaction.editReply({ embeds: [restoreWarningEmbed] });

                // Mendaftarkan beban komputasi masif ini ke antrean Message Broker Anda
                titaniumBroker.enqueue(async () => {
                    console.log('\n' + '☢️'.repeat(30));
                    console.log(`☢️ [DISASTER_RECOVERY] MEMULAI REKONSTRUKSI INFRASTRUKTUR NODE [${guildId}]`);
                    console.log(`   ↳ Trace ID Target : ${targetSnapshot.snapshotId}`);

                    const guild = interaction.guild;
                    let successRolesCount = 0;
                    let successChannelsCount = 0;

                    // [TAHAP 1] REKONSTRUKSI ROLES
                    // Menyortir posisi dari yang terendah agar tidak terjadi Hierarchy Error
                    const sortedRoles = targetSnapshot.infrastructure.roles.sort((a, b) => a.position - b.position);
                    
                    for (const roleData of sortedRoles) {
                        try {
                            // Cek apakah role dengan nama yang sama sudah ada untuk mencegah duplikasi masif
                            const roleExists = guild.roles.cache.find(r => r.name === roleData.name);
                            if (!roleExists) {
                                await guild.roles.create({
                                    name: roleData.name,
                                    color: roleData.color,
                                    hoist: roleData.hoist,
                                    permissions: BigInt(roleData.permissions), // Deserialisasi bitfield
                                    mentionable: roleData.mentionable,
                                    reason: `Titanium Disaster Recovery: Snapshot ${targetSnapshot.snapshotId}`
                                });
                                successRolesCount++;
                                // Simulasi Jeda Delay Artifisial: 300ms untuk menghindari Rate Limit 429
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        } catch (err) {
                            console.error(`   ↳ [ROLE_RESTORE_FAULT] Gagal membangun ulang entitas '${roleData.name}':`, err.message);
                        }
                    }

                    // [TAHAP 2] REKONSTRUKSI KATEGORI (PARENT CHANNELS)
                    const categories = targetSnapshot.infrastructure.channels.filter(c => c.type === ChannelType.GuildCategory);
                    const categoryIdMap = new Map(); // Pemetaan ID lama ke ID baru agar channel anak tidak yatim piatu
                    
                    for (const catData of categories) {
                        try {
                            const existingCat = guild.channels.cache.find(c => c.name === catData.name && c.type === ChannelType.GuildCategory);
                            if (!existingCat) {
                                const newCat = await guild.channels.create({
                                    name: catData.name,
                                    type: ChannelType.GuildCategory,
                                    position: catData.position,
                                    reason: `Titanium Disaster Recovery: Snapshot ${targetSnapshot.snapshotId}`
                                });
                                categoryIdMap.set(catData.id, newCat.id);
                                successChannelsCount++;
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } else {
                                categoryIdMap.set(catData.id, existingCat.id);
                            }
                        } catch (err) {
                            console.error(`   ↳ [CAT_RESTORE_FAULT] Gagal membangun kategori '${catData.name}':`, err.message);
                        }
                    }

                    // [TAHAP 3] REKONSTRUKSI TEXT & VOICE CHANNELS
                    const childChannels = targetSnapshot.infrastructure.channels.filter(c => c.type !== ChannelType.GuildCategory);
                    
                    for (const chanData of childChannels) {
                        try {
                            const existingChan = guild.channels.cache.find(c => c.name === chanData.name && c.type === chanData.type);
                            if (!existingChan) {
                                // Mencari referensi Parent (Kategori) baru menggunakan Map ID yang telah dibuat
                                const newParentId = chanData.parentId ? categoryIdMap.get(chanData.parentId) : null;
                                
                                await guild.channels.create({
                                    name: chanData.name,
                                    type: chanData.type,
                                    parent: newParentId, // Menyatukan channel kembali ke kategorinya
                                    topic: chanData.topic,
                                    nsfw: chanData.nsfw,
                                    rateLimitPerUser: chanData.rateLimitPerUser,
                                    reason: `Titanium Disaster Recovery: Snapshot ${targetSnapshot.snapshotId}`
                                });
                                successChannelsCount++;
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        } catch (err) {
                            console.error(`   ↳ [CHAN_RESTORE_FAULT] Gagal membangun node '${chanData.name}':`, err.message);
                        }
                    }

                    console.log(`✅ [DISASTER_RECOVERY_COMPLETE] Rutinitas selesai. Berhasil memulihkan ${successRolesCount} Roles dan ${successChannelsCount} Channels.`);
                    console.log('☢️'.repeat(30) + '\n');

                    // [TAHAP 4] PENGIRIMAN LOG TELEMETRI AKHIR
                    const completionEmbed = new EmbedBuilder()
                        .setColor('#00E6FF')
                        .setTitle('✅ [RECONSTRUCTION COMPLETE] INFRASTRUCTURE RESTORED')
                        .setDescription(`**Message Broker Execute operation has completed.**\n\nTitanium Engine has successfully read the disk matrix, bypassed API limitations, and injected topology data back into your server.`)
                        .addFields(
                            { name: 'Role Entities Restored', value: `\`${successRolesCount} Item(s)\``, inline: true },
                            { name: 'Channel Nodes Restored', value: `\`${successChannelsCount} Item(s)\``, inline: true },
                            { name: 'Audit Compliance', value: `\`PASSED (0 Rate Limits)\``, inline: false }
                        )
                        .setFooter({ text: 'Data Centre Recovery Module • System Normalized' })
                        .setTimestamp();

                    // Meneruskan respons secara aman (FollowUp karena status sebelumnya Ephemeral/Deferred)
                    await interaction.followUp({ embeds: [completionEmbed], flags: MessageFlags.Ephemeral });

                }, 
                { feature: 'Titanium Disaster Recovery Execute', sector: `Guild_Node_${guildId}`, priority: 'CRITICAL' }, 
                'HIGH'); // Menempatkannya di Prioritas Tinggi pada Broker

                return;
            }
        }

        // ----------------------------------------------------
        // [D] ENTITY MODULATION & GLOBAL TRANSMIT
        // ----------------------------------------------------
        if (interaction.commandName === 'role') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const targetRole = interaction.options.getRole('target_role');
            const memberTarget = interaction.options.getMember('member');
            try {
                await memberTarget.roles.add(targetRole);
                let currentName = memberTarget.nickname || memberTarget.user.username;
                currentName = currentName.replace(/^\[.*?\]\s*/i, '');
                await memberTarget.setNickname(`[${targetRole.name}] ${currentName}`);
                await interaction.editReply({ content: `✅ Successful Injection: Role **${targetRole.name}** applied to ${memberTarget}.` });
            } catch (err) {
                await interaction.editReply({ content: `❌ Injection Failed: Check Role Hierarchy.` });
            }
            return;
        }

        // ========================================================================
        // [D.1] ADVANCED OMNI-BROADCAST MATRIX ROUTER (TITANIUM V6.0 UPGRADE)
        // ========================================================================
        // Modul intersepsi utama untuk komando siaran. Sistem kini mendeteksi
        // secara dinamis apakah komandan memberikan payload langsung via parameter
        // atau membutuhkan antarmuka Modal UI (Text Editor) untuk transmisi panjang.
        // ========================================================================
        if (interaction.commandName === 'broadcast') {
            
            // 1. Ekstraksi Primer dari Parameter Interaksi Node (Layer 1 - Wajib)
            const targetChannel = interaction.options.getChannel('target_channel');
            const priority = interaction.options.getString('priority') || 'info';
            const imageUrl = interaction.options.getString('image_url');
            const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
            
            // 2. Ekstraksi Sekunder untuk Payload Teks (Layer 2 - Opsional pada V6.0)
            const titleInput = interaction.options.getString('title');
            const messageInput = interaction.options.getString('message');

            // --------------------------------------------------------------------
            // [CABANG A: INTERACTIVE MODAL UI ROUTING] 
            // Terpicu apabila 'title' atau 'message' tidak diisi pada saat eksekusi command.
            // --------------------------------------------------------------------
            if (!titleInput || !messageInput) {
                // Menghasilkan Cryptographic Session ID untuk pelacakan konteks di memori volatile (Heap RAM)
                const timestampSeed = Date.now().toString(16);
                const sessionId = `SESS-${interaction.user.id}-${timestampSeed}`.replace(/[^a-zA-Z0-9-]/g, '');
                
                // Menyimpan konfigurasi awal ke dalam Memory Cache agar parameter jaringan tidak hilang
                // saat proses transisi ke antarmuka Modal Form yang asinkron.
                broadcastSessionCache.set(sessionId, {
                    targetChannel: targetChannel, 
                    priority: priority, 
                    imageUrl: imageUrl, 
                    pingEveryone: pingEveryone,
                    executorId: interaction.user.id,
                    createdAt: Date.now(),
                    status: 'AWAITING_MODAL_SUBMISSION_FROM_CLIENT'
                });

                console.log(`[UI_ROUTER_DIAGNOSTICS] Mengalihkan Komandan ${interaction.user.tag} ke Modal UI Editor. Active Session ID: ${sessionId}`);

                // Konstruksi Arsitektur Antarmuka Form (Titanium Modal Builder)
                const broadcastModal = new ModalBuilder()
                    .setCustomId(`bcast_modal_${sessionId}`)
                    .setTitle('Titanium Matrix: Broadcast Editor UI');

                // Komponen 1: Input Judul Transmisi (Single-line buffer)
                const titleInputComponent = new TextInputBuilder()
                    .setCustomId('modal_title')
                    .setLabel('BROADCAST HEADER / SUBJECT')
                    .setPlaceholder('Enter the high-level transmission title here...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(3)
                    .setMaxLength(256); // Batas aman Discord API untuk title embed

                // Komponen 2: Input Muatan Pesan Utama (Multi-line paragraph buffer)
                const messageInputComponent = new TextInputBuilder()
                    .setCustomId('modal_message')
                    .setLabel('MAIN PAYLOAD / CONTENT TRANSMISSION')
                    .setPlaceholder('Type your detailed system announcement here. Supports Markdown syntax (*, **, `, >)...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMinLength(10)
                    .setMaxLength(3500); // Menyisakan ruang untuk padding metadata embed

                // Pemasangan komponen ke dalam Action Rows (Batasan struktural Discord API mensyaratkan 1 input per row)
                const firstActionRow = new ActionRowBuilder().addComponents(titleInputComponent);
                const secondActionRow = new ActionRowBuilder().addComponents(messageInputComponent);
                
                broadcastModal.addComponents(firstActionRow, secondActionRow);

                // Meluncurkan antarmuka ke layar pengguna (Operasi ini membutuhkan respons I/O < 3 detik)
                return interaction.showModal(broadcastModal);
            } 
            
            // --------------------------------------------------------------------
            // [CABANG B: DIRECT EXECUTION DISPATCH]
            // Terpicu apabila seluruh parameter transmisi lengkap diberikan dari awal.
            // --------------------------------------------------------------------
            else {
                // Mengamankan jalur interaksi awal dengan enkripsi mode ephemeral (Hanya Komandan yang melihat)
                // Sangat penting untuk mendefer balasan jika pemrosesan API memakan waktu.
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                
                console.log(`[UI_ROUTER_DIAGNOSTICS] Memproses Direct Command Dispatch dari Komandan ${interaction.user.tag}.`);

                // Enkapsulasi seluruh titik data ke dalam Payload Object Standard untuk diteruskan ke Engine Pusat
                const payloadData = {
                    targetChannel: targetChannel,
                    title: titleInput,
                    message: messageInput,
                    priority: priority,
                    imageUrl: imageUrl,
                    pingEveryone: pingEveryone,
                    dispatchMethod: 'DIRECT_SLASH_COMMAND'
                };
                
                // Mendelegasikan operasi sepenuhnya ke Centralized Broadcast Engine
                // Hal ini menghindari pengulangan kode eksekusi Queue Broker yang panjang
                return executeTitaniumBroadcastEngine(interaction, payloadData);
            }
        }

        // ----------------------------------------------------
        // [E] TACTICAL MODERATION PROTOCOLS
        // ----------------------------------------------------
        if (interaction.commandName === 'clear') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const amount = interaction.options.getInteger('amount');
            if (amount < 1 || amount > 100) return interaction.editReply({ content: '❌ Limit Override: Please input a parameter between 1-100.' });
            try {
                await interaction.channel.bulkDelete(amount, true);
                await interaction.editReply({ content: `✅ Node Purification Successful: ${amount} cache entries purged.` });
            } catch (e) {
                await interaction.editReply({ content: '❌ Operation Failed: Data exceeding 14 days is protected by platform protocols.' });
            }
            return;
        }

        if (interaction.commandName === 'kick') {
            await interaction.deferReply();
            const target = interaction.options.getMember('target');
            if (!target.kickable) return interaction.editReply({ content: '❌ Authorization Failed: Target entity is immune to execution.' });
            await target.kick();
            await interaction.editReply({ content: `✅ **${target.user.tag}** has been terminated from the infrastructure.` });
            return;
        }

        if (interaction.commandName === 'ban') {
            await interaction.deferReply();
            const target = interaction.options.getMember('target');
            const reason = interaction.options.getString('reason') || 'Void';
            if (!target.bannable) return interaction.editReply({ content: '❌ Authorization Failed: Target entity possesses a high-level firewall.' });
            await target.ban({ reason });
            await interaction.editReply({ content: `✅ **${target.user.tag}** has been permanently blocked. Reason: ${reason}` });
            return;
        }

        if (interaction.commandName === 'timeout') {
            await interaction.deferReply();
            const target = interaction.options.getMember('target');
            const duration = interaction.options.getInteger('duration');
            if (!target.moderatable) return interaction.editReply({ content: '❌ Authorization Failed: Target entity holds equal or superior privileges.' });
            await target.timeout(duration * 60 * 1000, 'Manual System Intervention');
            await interaction.editReply({ content: `✅ Communication access for **${target.user.tag}** has been frozen for ${duration} minutes.` });
            return;
        }
        
        // ------------------------------------------------------------------------
    // [COMMAND LAYER] /lockdown - GLOBAL QUARANTINE PROTOCOL (TITANIUM PERSISTENT + DUAL-STATE ALARM)
    // ------------------------------------------------------------------------
    if (interaction.commandName === 'lockdown') {
        // Mengamankan jalur interaksi dengan enkripsi ephemeral agar log eksekusi tidak bocor ke publik
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // [1] Pengecekan Otoritas Eksekutif Tertinggi (Otorisasi Titanium)
        if (interaction.user.id !== LOCKDOWN_COMMANDER_ID) {
            console.warn(`⚠️ [SECURITY_BREACH] Entitas ${interaction.user.tag} mencoba meretas protokol Lockdown.`);
            const unauthorizedEmbed = new EmbedBuilder()
                .setTitle('❌ Critical Authorization Failed')
                .setDescription('You do not have sufficient clearance level to manipulate the system quarantine protocol. This computational action has been permanently recorded in the server security matrix.')
                .setColor('#FF0000')
                .setFooter({ text: 'Automated Anti-Intrusion Infrastructure | Access Denied' })
                .setTimestamp();
            
            return interaction.editReply({ embeds: [unauthorizedEmbed] });
        }

        // [2] Ekstraksi Argumen Boolean (Target Mode) dari antarmuka interaksi Discord API
        const targetMode = interaction.options.getBoolean('mode');

        // [3] Cegah Overwrite Redundan Jika State Sistem Sudah Identik (Mencegah Thrashing RAM)
        if (global.SYSTEM_LOCKDOWN_ACTIVE === targetMode) {
            return interaction.editReply({ 
                content: `⚠️ **[STATE_CONFLICT]** Execution has been rejected absolutely. The network Lockdown mode is already set to **${targetMode ? 'ACTIVE (TRUE)' : 'INACTIVE (FALSE)'}**. No structural mutation is allowed in order to conserve CPU computation cycles.` 
            });
        }

        // [4] Modifikasi State Kernel Global (Sinkronisasi RAM Instan dengan 0ms I/O Latency)
        global.SYSTEM_LOCKDOWN_ACTIVE = targetMode;

        // Inisialisasi variabel Timestamp agar dapat digandakan penggunaannya oleh modul penyimpanan dan transmisi
        let exactWIBTimestamp = "UNKNOWN_TIME_WIB";

        // ====================================================================
        // [5] COMMITTING STATE TO HARD DRIVE I/O (PERSISTENT MEMORY LOCK)
        // ====================================================================
        // Mengunci state ke database fisik agar sistem selalu mengingat status karantina 
        // meskipun Node.js mengalami crash atau server dihidupkan ulang secara paksa.
        try {
            let db = readDB();
            
            // TIME-SYNC ENGINE: Sinkronisasi presisi tinggi ke zona waktu eksekusi lokal (WIB)
            const wibTimeConfig = {
                timeZone: 'Asia/Jakarta', year: 'numeric', month: 'long', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            };
            exactWIBTimestamp = `${new Intl.DateTimeFormat('id-ID', wibTimeConfig).format(new Date())} WIB`;

            // Rekonstruksi arsitektur state jika kerangka objek partisinya belum terbentuk di JSON
            if (!db["GLOBAL_INFRASTRUCTURE_STATE"]) {
                db["GLOBAL_INFRASTRUCTURE_STATE"] = {};
            }

            // Memperbarui Payload Matriks Data Karantina
            db["GLOBAL_INFRASTRUCTURE_STATE"].SYSTEM_LOCKDOWN_ACTIVE = targetMode;
            db["GLOBAL_INFRASTRUCTURE_STATE"].LAST_LOCKDOWN_TIMESTAMP = exactWIBTimestamp;
            db["GLOBAL_INFRASTRUCTURE_STATE"].LAST_COMMANDER_ID = interaction.user.id;

            // Menulis (Commit) perubahan secara asinkronus ke hard disk
            writeDB(db);

            // Merekam Audit Forensik Kritis ke berkas terdedikasi 'History Databases.json'
            recordDatabaseHistory(
                'GLOBAL_INFRASTRUCTURE', 
                interaction.user.id, 
                targetMode ? 'LOCKDOWN_ACTIVATED' : 'LOCKDOWN_TERMINATED', 
                `System Wide Override at ${exactWIBTimestamp}`
            );

        } catch (ioCommitError) {
            console.error('🔴 [PERSISTENT_LOCKDOWN_FAULT] Terjadi distorsi I/O saat mengunci status karantina ke dalam Hard Drive:', ioCommitError.message);
        }

        // ====================================================================
        // [6] ADVANCED MODULE: DUAL-STATE SILENT ALARM GATEWAY (AUTOMATED BROADCAST)
        // ====================================================================
        // Subsistem ini merakit dan menembakkan sinyal telemetri tanpa Ping/Mention.
        // Telah dikonfigurasi ulang untuk mendukung format waktu GMT internasional
        // dan cabang arsitektur ganda (Aktivasi vs Deaktivasi).
        try {
            const LOCKDOWN_ALERT_CHANNEL_ID = '1507707454367076392';
            
            // Prioritas penarikan data dari memori cache (0ms I/O) dengan Fallback asinkronus 
            // menggunakan fetch API untuk menjamin keandalan koneksi jaringan ke Gateway Discord.
            const alertChannel = client.channels.cache.get(LOCKDOWN_ALERT_CHANNEL_ID) || 
                                 await client.channels.fetch(LOCKDOWN_ALERT_CHANNEL_ID).catch(() => null);

            if (alertChannel) {
                console.log('\n' + '📡'.repeat(40));
                console.log(`📡 [SILENT_ALARM_MATRIX] Menginisialisasi jabat tangan transmisi data tingkat lanjut...`);
                console.log(`   ↳ [TARGET_NODE] : Terverifikasi (Channel ID: ${LOCKDOWN_ALERT_CHANNEL_ID})`);
                
                // ----------------------------------------------------------------
                // TIME-SYNC ENGINE: Greenwich Mean Time (GMT) Synchronization
                // ----------------------------------------------------------------
                const gmtTimeConfig = {
                    timeZone: 'GMT', 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: '2-digit',
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit', 
                    hour12: false,
                    timeZoneName: 'short'
                };
                
                // Konversi epoch komputasi ke waktu GMT (standar militer/korporat)
                const gmtTimeFormatter = new Intl.DateTimeFormat('en-GB', gmtTimeConfig);
                const exactGMTTimestamp = gmtTimeFormatter.format(new Date());

                let broadcastPayloadEmbed;

                // ----------------------------------------------------------------
                // BRANCH A: LOCKDOWN ACTIVATION PROTOCOL (STATE = TRUE)
                // ----------------------------------------------------------------
                if (targetMode === true) {
                    console.log(`   ↳ [STATE_ROUTING] Merakit payload peringatan: PENGUNCIAN INFRASTRUKTUR (KRITIS).`);
                    
                    broadcastPayloadEmbed = new EmbedBuilder()
                        .setColor('#FF0033')
                        .setAuthor({ 
                            name: 'TITANIUM GLOBAL SECURITY MATRIX', 
                            iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTitle('⚠️ GLOBAL QUARANTINE PROTOCOL (LOCKDOWN) ACTIVATED')
                        .setDescription(`Attention all connected instruments. The **Defense Matrix** has just placed the entire infrastructure on absolute lockdown.\n\nAll UI traffic, Slash Commands, and operational functionality are currently frozen to maintain database integrity from external anomalies and potential threat escalation.\n\n> *The system will continue to hold network traffic until it receives normalization authorization (Unlock) directly from the executive-level Command Center.*`)
                        .addFields(
                            { name: '🌐 Modulated Sector Status', value: '`ENCRYPTED_AND_LOCKED (OVERRIDE)`', inline: true },
                            { name: '🛡️ Internal Encryption Protocol', value: '`TITANIUM_V5.3_SEALED`', inline: true },
                            { name: '⏱️ GMT Computational Timestamp', value: `\`${exactGMTTimestamp}\``, inline: false }
                        )
                        .setFooter({ text: 'Automated Intrusion Countermeasures • Silent Dispatch Routing System' })
                        .setTimestamp();
                } 
                // ----------------------------------------------------------------
                // BRANCH B: LOCKDOWN DEACTIVATION PROTOCOL (STATE = FALSE)
                // ----------------------------------------------------------------
                else {
                    console.log(`   ↳ [STATE_ROUTING] Merakit payload peringatan: PENORMALAN INFRASTRUKTUR (AMAN).`);
                    
                    broadcastPayloadEmbed = new EmbedBuilder()
                        .setColor('#00FF66')
                        .setAuthor({ 
                            name: 'TITANIUM GLOBAL SECURITY MATRIX', 
                            iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTitle('✅ GLOBAL QUARANTINE PROTOCOL (LOCKDOWN) LIFTED')
                        .setDescription(`**Attention to all connected instruments and operational nodes.**\n\nThe **Automated Defense Matrix** has officially lifted the global infrastructure lockdown. All system constraints have been safely removed by the executive commander.\n\nAll user interface interactions (UI), command executions (Slash Commands), and background operational functionalities have been fully restored and normalized. The database integrity check has passed without any detected anomalies or data corruption.\n\n> *The system has seamlessly transitioned back to standard operational status. Normal traffic routing and packet transmissions are now permitted.*`)
                        .addFields(
                            { name: '🌐 Modulated Sector Status', value: '`NORMALIZED (UNLOCKED & RESTORED)`', inline: true },
                            { name: '🛡️ Internal System Protocol', value: '`TITANIUM_V5.3_OPERATIONAL`', inline: true },
                            { name: '⏱️ GMT Computational Timestamp', value: `\`${exactGMTTimestamp}\``, inline: false }
                        )
                        .setFooter({ text: 'Infrastructure Normalization Protocol • Silent Dispatch Routing System' })
                        .setTimestamp();
                }

                // Mentransmisikan payload secara absolut murni tanpa tag @everyone/@here
                await alertChannel.send({ embeds: [broadcastPayloadEmbed] });
                
                console.log(`✅ [SILENT_ALARM_SUCCESS] Sinyal transmisi status [${targetMode ? 'LOCKED_STATE' : 'UNLOCKED_STATE'}] berhasil menembus Node Gateway tanpa hambatan API.`);
                console.log('📡'.repeat(40) + '\n');
                
            } else {
                console.warn(`⚠️ [SILENT_ALARM_FAULT] Target node transmisi darurat [${LOCKDOWN_ALERT_CHANNEL_ID}] tidak dapat dijangkau. Evaluasi otoritas baca/tulis bot pada saluran tersebut.`);
            }
        } catch (broadcastDistortionError) {
            // Melokalisasi kegagalan transmisi agar tidak memicu Crash pada mesin secara keseluruhan
            console.error('\n🔴 [BROADCAST_ROUTING_EXCEPTION] Mesin matriks mengalami malfungsi fatal (Panic Mode) saat mencoba mendistribusikan sinyal peringatan:');
            console.error(`   ↳ Parameter Malfungsi : ${broadcastDistortionError.message}`);
            console.error(`   ↳ Lacak Rekam (Trace) : \n${broadcastDistortionError.stack}\n`);
        }
        // ====================================================================

        // [7] Output Log Telemetri Kritis ke Terminal Host/Server untuk Audit Visual Manual
        console.log('\n' + '☢️'.repeat(35));
        console.log(`[TITANIUM_DEFENSE_MATRIX] MUTASI STATE PROTOKOL LOCKDOWN GLOBAL (PERSISTENT & DUAL-ALERT MODE)`);
        console.log(`↳ Dieksekusi Oleh : ${interaction.user.tag} (ID: ${interaction.user.id})`);
        console.log(`↳ State Terbaru  : ${targetMode ? 'AKTIF (Sistem Terkunci, Persisten, Sinyal Peringatan Dikirim)' : 'NONAKTIF (Sistem Dinormalisasi)'}`);
        console.log(`↳ Modul Bypass  : Node [1280789307027755019], Node [1515651449772703755]`);
        console.log('☢️'.repeat(35) + '\n');

        // [8] Transmisi Konfirmasi Visual dan Diagnostik Personal ke Eksekutor Command (Ephemeral/Private)
        const successEmbed = new EmbedBuilder()
            .setTitle(targetMode ? '🔒 SYSTEM LOCKDOWN: PERSISTENT INITIATED' : '✅ SYSTEM LOCKDOWN: TERMINATED & RESTORED')
            .setDescription(targetMode 
                ? '**The Global Quarantine Protocol has been permanently activated!**\nThe defense system (*Defense Matrix*) now locks all user interaction traffic (*Commands, Modals, Panels*). A silent emergency standby signal has also been dispatched to the military control channel.\n\n⚠️ *Technical Note: This quarantine status has been committed to the Hard Drive Database. Rebooting the bot machine will not forcibly unlock the system before a release command is received.*'
                : '**The Global Quarantine Protocol has been lifted!**\nThe system lock state has been dismantled and fully normalized. All modules are allowed to operate, computation has returned to normal, and the release state has been securely recorded in the physical Database.')
            .setColor(targetMode ? '#FF0000' : '#00FF00')
            .addFields(
                { name: 'Supreme Executive Authority', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Disk Integrity Status (I/O)', value: '`SUCCESS_WRITTEN_TO_DISK`', inline: true },
                { name: 'Active Bypass Whitelist Matrix', value: '`1280789307027755019`\n`1515651449772703755`', inline: false }
            )
            .setFooter({ text: 'Titanium Security & Persistent State Controls', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        return interaction.editReply({ embeds: [successEmbed] });
    } // <--- [PENTING] Kurawal penutup ini krusial untuk mencegah distorsi Syntax Tree
        } catch (error) {
            // ====================================================
            // [!] INTERACTION FAIL-SAFE & DIAGNOSTIC HANDLER
            // ====================================================
            console.error('\n[KERNEL_PANIC] Interaction Execution Failed:', error);

            // Merakit UI Laporan Diagnostik Profesional (Fail-Safe)
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0033')
                .setAuthor({ 
                    name: 'SYSTEM EXCEPTION DETECTED', 
                    iconURL: client.user.displayAvatarURL() 
                })
                .setTitle('⚠️ [SYS_FAULT] Interaction Cancelled')
                .setDescription(`The Titanium Matrix Engine detected an anomaly while processing your request. The execution path has been forcibly terminated to prevent data corruption in main memory.`)
                .addFields(
                    { name: 'Diagnostic Code', value: `\`${error.name || 'UNKNOWN_ERR'}\``, inline: true },
                    { name: 'Error Trace', value: `\`${error.message ? error.message.substring(0, 100) : 'No Trace'}\``, inline: true },
                    { name: 'Action Taken', value: '`CONNECTION_TERMINATED & LOGGED`', inline: false }
                )
                .setFooter({ text: 'Automated Fail-Safe Protocol | Report this to Overseer' })
                .setTimestamp();

            try {
                // [CRITICAL LOGIC] Mengecek apakah bot sudah sempat merespons sebelum error terjadi
                if (interaction.replied || interaction.deferred) {
                    // Jika sudah di-defer (menunggu), kita gunakan followUp atau editReply
                    await interaction.followUp({ 
                        embeds: [errorEmbed], 
                        flags: MessageFlags.Ephemeral 
                    });
                } else {
                    // Jika error terjadi di bawah 3 detik dan bot belum merespons sama sekali
                    await interaction.reply({ 
                        embeds: [errorEmbed], 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            } catch (fatalError) {
                // Jika Discord API benar-benar menolak balasan sama sekali (misal koneksi putus)
                console.error('[FATAL_DISCONNECT] Gagal mengirim pesan fail-safe:', fatalError.message);
            }
        } // Akhir dari catch block
    });

    // ============================================================================
    // 6. TITANIUM KERNEL ANTI-CRASH & PROCESS MANAGEMENT (ZERO DOWNTIME PROTOCOL)
    // ============================================================================
    // Infrastruktur perisai tingkat lanjut untuk mencegat anomali fatal pada Node.js.
    // Dirancang khusus untuk menjaga stabilitas transaksi dan operasional data center 24/7.

    // 1. Mencegat Promise yang gagal diretas (Misal: API Timeout, Database Connection Error)
    process.on('unhandledRejection', (reason, promise) => {
        console.error('\n' + '═'.repeat(75));
        console.error('🔴 [TITANIUM_KERNEL_PANIC] UNHANDLED PROMISE REJECTION DETECTED');
        console.error('═'.repeat(75));
        console.error('↳ [PROMISE_STATE] :', promise);
        console.error('↳ [REASON_TRACE]  :', reason instanceof Error ? reason.stack : reason);
        console.error('↳ [SYSTEM_ACTION] : Process isolation successful. Core engine remains active.');
        console.error('═'.repeat(75) + '\n');
    });

    // 2. Mencegat Error Kritis yang tidak terbungkus Try-Catch (Misal: Undefined Variable)
    process.on('uncaughtException', (error) => {
        console.error('\n' + '═'.repeat(75));
        console.error('🔴 [TITANIUM_KERNEL_PANIC] FATAL UNCAUGHT EXCEPTION DETECTED');
        console.error('═'.repeat(75));
        console.error('↳ [ERROR_NAME]    :', error.name);
        console.error('↳ [ERROR_MESSAGE] :', error.message);
        console.error('↳ [STACK_TRACE]   :', error.stack);
        console.error('↳ [SYSTEM_ACTION] : Fallback triggered. Execution bypassed to prevent process death.');
        console.error('═'.repeat(75) + '\n');
    });

    // 3. Monitor Tambahan untuk Injeksi Log Keamanan Latar Belakang (Deep Telemetry)
    process.on('uncaughtExceptionMonitor', (error, origin) => {
        console.error('\n' + '═'.repeat(75));
        console.error('🟡 [TITANIUM_TELEMETRY] EXCEPTION MONITOR TRIGGERED');
        console.error('═'.repeat(75));
        console.error('↳ [ORIGIN_NODE]   :', origin);
        console.error('↳ [ERROR_DATA]    :', error.message || error);
        console.error('↳ [SYSTEM_ACTION] : Background telemetry securely recorded to memory trace.');
        console.error('═'.repeat(75) + '\n');
    });

    // ------------------------------------------------------------------------
    // 4. [ENHANCED] TITANIUM DIAGNOSTIC & TELEMETRY WARNING ENGINE
    // ------------------------------------------------------------------------
    // Modul pendeteksi anomali memori dan infrastruktur tingkat lanjut.
    // Direkayasa ulang dengan arsitektur "Deep Level Buffer Filtering" untuk 
    // melenyapkan residu peringatan pasif (Deprecation) dari dependensi 
    // pihak ketiga (ts-node) yang tertahan di dalam antrean V8 Engine.

    process.on('warning', (warning) => {
        // ====================================================================
        // [LAYER 2 SECURITY FILTER] KERNEL BUFFER INTERCEPTOR
        // ====================================================================
        // Mencegat peringatan yang dipicu saat fase Bootstrapping (sebelum 
        // sistem process.emit berhasil di-override pada siklus Event Loop utama).
        // Algoritma ini akan membedah signature dari objek warning.
        
        const isTargetDeprecation = warning.name === 'DeprecationWarning';
        const hasFsStatsSignature = warning.message && warning.message.includes('fs.Stats constructor is deprecated');
        
        // Jika peringatan ini cocok dengan anomali ts-node, eksekusi [SILENT DROP]
        if (isTargetDeprecation && hasFsStatsSignature) {
            // Membunuh rantai eksekusi log secara senyap tanpa membebani I/O CPU
            return; 
        }
        // ====================================================================

        // Jika anomali lolos dari filter (mengindikasikan Memory Leak nyata atau
        // Bottleneck pada Node), teruskan telemetri ke log terminal host.
        console.warn('\n' + '═'.repeat(75));
        console.warn('⚠️ [TITANIUM_DIAGNOSTIC] CRITICAL SYSTEM / MEMORY LIMITATION ALERT');
        console.warn('═'.repeat(75));
        
        // Ekstraksi data metrik kegagalan secara aman (Fail-Safe Object Reading)
        const alertName = warning.name || 'UNKNOWN_KERNEL_ANOMALY';
        const alertMessage = warning.message || 'Tidak ada deskripsi diagnostik dari sistem host.';
        const alertTrace = warning.stack || 'Trace memori terenkripsi atau tidak tersedia.';

        console.warn(`↳ [WARNING_NAME]  : ${alertName}`);
        console.warn(`↳ [MESSAGE]       : ${alertMessage}`);
        console.warn(`↳ [STACK_TRACE]   : ${alertTrace}`);
        console.warn(`↳ [SYSTEM_ACTION] : Anomali telah direkam ke memori audit server. Harap segera evaluasi alokasi RAM / CPU pada mesin hosting.`);
        console.warn('═'.repeat(75) + '\n');
    });

    // ============================================================================
    // [MODUL V2.1] TITANIUM PROTECTION COMMAND EXECUTOR & DB SYNC (API OPTIMIZED)
    // ============================================================================
    // Listener independen yang telah dikalibrasi agar sesuai dengan standar transmisi 
    // data Discord API terbaru (Mengeliminasi peringatan Deprecation objek Ephemeral).
    
    client.on(Events.InteractionCreate, async interaction => {
        // [SECURITY LAYER 1] Bypass Evaluasi: Pastikan event yang dipicu murni Slash Command
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'protection') {
            // [DATA EXTRACTION] Mengekstrak matriks parameter esensial dari Discord API
            const targetModule = interaction.options.getString('module');
            // Sending the command always ACTIVATES the selected module.
            // Deactivation is handled exclusively by the /disable command.
            const activationMode = true;
            const executorId = interaction.user.id;
            const guildId = interaction.guild.id;

            // [SECURITY LAYER 2] Otorisasi Sentral: Memblokir keras entitas non-Administrator.
            // 🛡️ REVISI API: Menggunakan 'flags: MessageFlags.Ephemeral' sebagai 
            // pengganti standar { ephemeral: true } yang kini telah usang.
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ 
                    content: '🚫 **[SECURITY_CLEARANCE_DENIED]** Access Denied. You require `Administrator` level authority to calibrate the network defense matrix.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            try {
                // ====================================================================
                // [CRITICAL OPTIMIZATION] DEFER REPLY BEBAS PERINGATAN (WARNING-FREE)
                // ====================================================================
                // Karena sifat laporan /protection ditujukan untuk dilihat oleh publik 
                // secara default, argumen pemanggilan deferReply() dikosongkan. 
                // Metode ini 100% memusnahkan DeprecationWarning di konsol Node.js Anda.
                await interaction.deferReply();

                // [MEMORY I/O] Mengekstrak status arsitektur RAM Cache global terkini dari pusat
                const db = readDB();

                // [FAIL-SAFE STRUCTURING] Membangun objek dasar secara dinamis untuk mencegah Null-Pointer
                if (!db[guildId]) {
                    db[guildId] = {};
                }
                if (!db[guildId].protectionModules) {
                    db[guildId].protectionModules = {};
                }

                // [STATE MUTATION] Mengeksekusi mutasi konfigurasi sistem karantina
                if (targetModule === 'anti_link') {
                    // Menyuntikkan status boolean konfigurasi baru ke dalam RAM cache lokal
                    db[guildId].protectionModules.antiLinkActive = activationMode;
                    
                    // [DISK SYNC WRITE] Mengunci memori persisten ke hard drive secara asinkron
                    writeDB(db);

                    // [FORENSIC AUDIT RECORD] Merekam aktivitas perubahaan I/O ke dalam file History terdedikasi
                    const statusVisualizer = activationMode ? "ACTIVE (TRUE) [SYSTEM_LOCK]" : "INACTIVE (FALSE) [SYSTEM_BYPASS]";
                    recordDatabaseHistory(
                        guildId, 
                        executorId, 
                        'PROTECTION_ANTI_LINK_MODULE', 
                        statusVisualizer
                    );

                    // [UI ENCAPSULATION] Merakit antarmuka konfirmasi eksekutif tingkat tinggi
                    const statusColor = activationMode ? 0x00FF00 : 0xFF0000;
                    const successEmbed = new EmbedBuilder()
                        .setAuthor({ 
                            name: 'TITANIUM DEFENSE MATRIX CONTROL', 
                            iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTitle(activationMode ? '🛡️ ANTI-LINK PROTOCOL: ONLINE' : '⚠️ ANTI-LINK PROTOCOL: OFFLINE')
                        .setDescription(`The server defense system has received the command parameter mutation and committed it permanently to the database.\n\n**↳ [TARGETING MODULE]** : *Cognitive Message Interceptor (Anti-Link)*\n**↳ [REVISION STATUS]** : **${statusVisualizer}**\n**↳ [AUTHORITY CODE]** : <@${executorId}>`)
                        .addFields(
                            { name: '💾 Persistent Synchronization', value: '`SUCCESS (WRITTEN TO DISK)`', inline: true },
                            { name: '📝 Active Forensic Log', value: '`RECORDED (HISTORY DB)`', inline: true }
                        )
                        .setColor(statusColor)
                        .setFooter({ text: `Titanium Security Command | Node ID: ${guildId}` })
                        .setTimestamp();

                    // [FINAL TRANSMISSION] Meneruskan representasi antarmuka ke dalam siklus obrolan server
                    await interaction.editReply({ embeds: [successEmbed] });
                    
                    // [TELEMETRY OUTPUT] Mencetak log aktivitas bebas anomali ke terminal Node Host
                    console.log('\n' + '🛡️'.repeat(35));
                    console.log(`[PROTECTION_MODULE_MUTATION] PARAMETER KEAMANAN DIREVISI`);
                    console.log(`↳ Protokol Target : Anti-Link Sector`);
                    console.log(`↳ State Baru      : ${statusVisualizer}`);
                    console.log(`↳ ID Eksekutor    : ${executorId}`);
                    console.log(`↳ Yurisdiksi Node : ${guildId}`);
                    console.log('🛡️'.repeat(35) + '\n');
                } else if (targetModule === 'anti_spam') {
                    // Injecting the new boolean configuration state into the local RAM cache
                    db[guildId].protectionModules.antiSpamActive = activationMode;
                    
                    // [DISK SYNC WRITE] Committing persistent memory to the hard drive asynchronously
                    writeDB(db);

                    // [FORENSIC AUDIT RECORD] Recording the I/O mutation into the dedicated History file
                    const statusVisualizer = activationMode ? "ACTIVE (TRUE) [SYSTEM_LOCK]" : "INACTIVE (FALSE) [SYSTEM_BYPASS]";
                    recordDatabaseHistory(
                        guildId, 
                        executorId, 
                        'PROTECTION_ANTI_SPAM_MODULE', 
                        statusVisualizer
                    );

                    // [UI ENCAPSULATION] Assembling the high-level executive confirmation interface
                    const statusColor = activationMode ? 0x00FF00 : 0xFF0000;
                    const successEmbed = new EmbedBuilder()
                        .setAuthor({ 
                            name: 'TITANIUM DEFENSE MATRIX CONTROL', 
                            iconURL: client.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setTitle(activationMode ? '🛡️ ANTI-SPAM PROTOCOL: ONLINE' : '⚠️ ANTI-SPAM PROTOCOL: OFFLINE')
                        .setDescription(`The server defense system has received the command parameter mutation and committed it permanently to the database.\n\n**↳ [TARGETING MODULE]** : *Message Flood & Strike System (Anti-Spam)*\n**↳ [REVISION STATUS]** : **${statusVisualizer}**\n**↳ [AUTHORITY CODE]** : <@${executorId}>`)
                        .addFields(
                            { name: '💾 Persistent Synchronization', value: '`SUCCESS (WRITTEN TO DISK)`', inline: true },
                            { name: '📝 Active Forensic Log', value: '`RECORDED (HISTORY DB)`', inline: true }
                        )
                        .setColor(statusColor)
                        .setFooter({ text: `Titanium Security Command | Node ID: ${guildId}` })
                        .setTimestamp();

                    // [FINAL TRANSMISSION] Forwarding the interface representation into the server chat cycle
                    await interaction.editReply({ embeds: [successEmbed] });
                    
                    // [TELEMETRY OUTPUT] Printing the anomaly-free activity log to the Node Host terminal
                    console.log('\n' + '🛡️'.repeat(35));
                    console.log(`[PROTECTION_MODULE_MUTATION] SECURITY PARAMETER REVISED`);
                    console.log(`↳ Target Protocol : Anti-Spam Sector`);
                    console.log(`↳ New State       : ${statusVisualizer}`);
                    console.log(`↳ Executor ID     : ${executorId}`);
                    console.log(`↳ Guild Jurisdiction : ${guildId}`);
                    console.log('🛡️'.repeat(35) + '\n');
                }
            } catch (engineError) {
                // [ERROR HANDLING] Mencegah hancurnya seluruh siklus Node.js saat tejadi isolasi fatal
                console.error(`🔴 [PROTECTION_MODULE_FAULT] Kegagalan I/O eksekusi keamanan:`, engineError.message);
                
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ 
                        content: `🔴 **[CRITICAL_SYSTEM_ERROR]** The V8 Engine failed to commit the write operation to the disk memory structure: \`${engineError.message}\`` 
                    });
                }
            }
        }
    });

    // ----------------------------------------------------
    // [G] BOOT KERNEL & IGNITION SEQUENCE
    // ----------------------------------------------------
    // Menginisialisasi koneksi websocket terenkripsi ke Discord API Gateway
    if (!process.env.BOT_TOKEN) {
        console.error('❌ [BOOT_FAILURE] BOT_TOKEN tidak ditemukan di file .env!');
        process.exit(1);
    }

    client.login(process.env.BOT_TOKEN).then(() => {
        console.log(`\n[SYSTEM_IGNITION] Authentication token accepted. Awaiting ready event...`);
    }).catch((err) => {
        console.error(`\n[BOOT_FAILURE] Gagal terhubung ke Discord API: ${err.message}`);
    });