/**
 * ======================================================================================
 * 🛡️ TITANIUM ENGINE - ASYNCHRONOUS TASK QUEUE & CONCURRENCY CONTROLLER
 * ======================================================================================
 * Arsitektur ini mengisolasi eksekusi command berat agar tidak memblokir Event Loop.
 * Menyediakan interaksi instan kepada pengguna dengan status visual "Waiting bot to reply".
 * ======================================================================================
 */

class CommandQueueEngine {
    constructor(maxConcurrentJobs = 3) {
        /**
         * Antrean internal untuk menampung request yang tertunda
         * @type {Array<{interaction: any, executeFn: Function, enqueuedAt: number}>}
         */
        this.queue = [];

        /**
         * Jumlah job yang saat ini sedang aktif dieksekusi secara simultan
         * @type {number}
         */
        this.activeWorkers = 0;

        /**
         * Batas maksimum perintah berat yang boleh berjalan bersamaan
         * @type {number}
         */
        this.maxConcurrentJobs = maxConcurrentJobs;

        console.log(`\n═`.repeat(75));
        console.log(`🚀 [QUEUE_INITIALIZED] Titanium Task Queue Engine Active`);
        console.log(`↳ [MAX_CONCURRENT_JOBS] : ${this.maxConcurrentJobs} Workers`);
        console.log(`↳ [STATUS]              : Operational & Monitoring Traffic`);
        console.log(`═`.repeat(75) + '\n');
    }

    /**
     * Memasukkan interaksi perintah baru ke dalam sistem antrean global
     * @param {any} interaction - Objek interaksi dari Discord.js
     * @param {Function} executeFn - Fungsi eksekusi asli dari command tersebut
     */
    async enqueue(interaction, executeFn) {
        const timestamp = Date.now();
        
        try {
            // PROTOKOL 1: Respon Instan (Pencegahan Interaction Timeout < 3 Detik)
            // Memastikan Discord mengetahui bahwa bot menerima perintah dalam hitungan milidetik
            if (this.activeWorkers >= this.maxConcurrentJobs) {
                await interaction.reply({
                    content: `⏳ **[TITANIUM QUEUE] Waiting bot to reply...**\n` +
                             `*Sistem sedang padat (Antrean ke: ${this.queue.length + 1}). Perintah Anda akan segera diproses secara otomatis.*`,
                    ephemeral: true
                });
            } else {
                // Jika antrean kosong atau aman, lakukan defer secara silent/loading standar
                await interaction.deferReply({ ephemeral: false });
            }

            // Masukkan data interaksi dan fungsi eksekusinya ke dalam array antrean
            this.queue.push({
                interaction,
                executeFn,
                enqueuedAt: timestamp
            });

            // Trigger pemrosesan antrean
            this.processNext();

        } catch (error) {
            console.error('═'.repeat(75));
            console.error('❌ [QUEUE_ENQUEUE_ERROR] Gagal mengamankan alur interaksi awal');
            console.error('↳ [ERROR_MESSAGE] :', error.message || error);
            console.error('═'.repeat(75));
        }
    }

    /**
     * Memproses item berikutnya yang berada di dalam antrean FIFO
     */
    async processNext() {
        // Jika kapasitas worker penuh atau tidak ada lagi antrean, hentikan siklus
        if (this.activeWorkers >= this.maxConcurrentJobs || this.queue.length === 0) {
            return;
        }

        // Ambil item pertama dari antrean (First-In, First-Out)
        this.activeWorkers++;
        const currentJob = this.queue.shift();
        const latencyInQueue = ((Date.now() - currentJob.enqueuedAt) / 1000).toFixed(2);

        // Telemetry Logging untuk monitoring server
        console.log(`\n═`.repeat(75));
        console.log(`⚡ [QUEUE_PROCESSING] Memulai Alokasi Sumber Daya Perintah`);
        console.log(`↳ [COMMAND]         : /${currentJob.interaction.commandName || 'Unknown'}`);
        console.log(`↳ [USER_ID]         : ${currentJob.interaction.user.id}`);
        console.log(`↳ [LATENCY_QUEUE]   : ${latencyInQueue} detik dalam antrean`);
        console.log(`↳ [ACTIVE_WORKERS]  : ${this.activeWorkers}/${this.maxConcurrentJobs}`);
        console.log(`═`.repeat(75) + '\n');

        // Eksekusi fungsi asli dari perintah tersebut menggunakan try-catch terisolasi
        try {
            // Beritahu pengguna secara visual jika sebelumnya mereka mendapatkan pesan "Waiting bot to reply"
            if (currentJob.interaction.replied && !currentJob.interaction.deferred) {
                await currentJob.interaction.editReply({
                    content: `⚙️ **[TITANIUM CORE] Processing Command...**\n*Alokasi sistem berhasil didapatkan, mengeksekusi data...*`
                });
            }

            // Jalankan fungsi asli command (melemparkan objek interaksi ke command file asli)
            await currentJob.executeFn(currentJob.interaction);

        } catch (executeError) {
            console.error('═'.repeat(75));
            console.error('❌ [QUEUE_EXECUTION_FAILURE] Kegagalan runtime pada eksekusi internal perintah');
            console.error('↳ [COMMAND_NAME]  :', currentJob.interaction.commandName);
            console.error('↳ [ERROR_TRACE]   :', executeError.stack || executeError);
            console.error('═'.repeat(75));

            // Kirim notifikasi error aman ke user agar interaksi tidak menggantung lambat
            try {
                const errorMessage = `❌ **[RUNTIME_ERROR]** Terjadi kesalahan internal saat memproses perintah Anda.`;
                if (currentJob.interaction.deferred || currentJob.interaction.replied) {
                    await currentJob.interaction.editReply({ content: errorMessage });
                } else {
                    await currentJob.interaction.reply({ content: errorMessage, ephemeral: true });
                }
            } catch (failToReport) {
                // Silent drop jika interaksi Discord sudah hangus sama sekali karena masalah jaringan luar
            }
        } finally {
            // Melepaskan kapasitas worker, menandakan satu slot kosong siap digunakan kembali
            this.activeWorkers--;
            
            // Rekursif: Panggil fungsi ini kembali untuk memproses antrean yang tersisa
            this.processNext();
        }
    }
}

module.exports = CommandQueueEngine;