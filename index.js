const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require('qrcode');
const fs = require('fs');
const express = require('express');

const { state, saveState } = useSingleFileAuthState('./auth_info.json');

async function startSock() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // 🔕 disables deprecated terminal QR
        browser: ['Ubuntu', 'Chrome', '22.04.4']
    });

    // ✅ Save session credentials on update
    sock.ev.on('creds.update', saveState);

    // ✅ Listen for connection events
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 🧾 Save QR to file if available
        if (qr) {
            console.log("📸 QR code received, saving to qr.png...");
            await qrcode.toFile('./qr.png', qr);
        }

        // 🔌 Reconnect if disconnected unintentionally
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("❌ Connection closed. Reconnecting?", shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            console.log("✅ Connected to WhatsApp!");
        }
    });

    // ✅ Example message handler
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            const msg = messages[0];
            const from = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

            if (text === '!ping') {
                await sock.sendMessage(from, { text: '🏓 Pong!' });
            }

            if (text === '!hi') {
                await sock.sendMessage(from, { text: '👋 Hello from your Render-hosted bot!' });
            }
        }
    });
}

// 🧠 Start socket
startSock();

// 🌍 Serve QR image via Express
const app = express();
app.use(express.static('.')); // serves qr.png

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Web server running on http://localhost:${PORT} (or Render public URL)`);
    console.log(`➡️ Visit /qr.png to scan the code`);
});
