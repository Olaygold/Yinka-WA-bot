
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Express to view QR Code if needed
const app = express();
const PORT = process.env.PORT || 3000;
app.use('/qrcodes', express.static('qrcodes'));
app.get('/', (req, res) => {
  res.send('<h2>🖼️ <a href="/qrcodes/qr.png">Click here to view QR Code</a></h2>');
});
app.listen(PORT, () => console.log(`🌐 QR code viewer running at http://localhost:${PORT}`));

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({ auth: state });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const qrDir = './qrcodes';
            if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);
            require('qrcode').toFile(path.join(qrDir, 'qr.png'), qr, () => {});
            qrcode.generate(qr, { small: true });
        }
        const error = lastDisconnect?.error;
        const statusCode = error instanceof Boom ? error.output?.statusCode : null;
        if (connection === 'close') {
            console.log('❌ Disconnected. Reason:', statusCode);
            if (statusCode !== DisconnectReason.loggedOut) startSock();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp connection established!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    const warnings = {};

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const name = msg.pushName || "User";
        const reply = (text) => sock.sendMessage(from, { text });

        switch (text.toLowerCase()) {
            case "hi":
                reply("👋 Hello! Welcome to Yinka Bot!");
                break;
            case "help":
            case ".menu":
                reply(`🛠 Available Commands:
- hi: Greet the bot
- help / .menu: Show this menu
- rules: Show group rules
- !warn @user: Warn a user
- !giveaway: Participate in giveaway`);
                break;
            case "rules":
                reply("📜 Group Rules:
1. Be respectful
2. No spam
3. Stay on topic");
                break;
            case "!giveaway":
                reply("🎁 You've been entered into the giveaway!");
                break;
            default:
                if (text.startsWith("!warn")) {
                    const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!mentionedJid) return reply("Please mention a user to warn.");
                    warnings[mentionedJid] = (warnings[mentionedJid] || 0) + 1;
                    if (warnings[mentionedJid] >= 3) {
                        await sock.groupParticipantsUpdate(from, [mentionedJid], "remove");
                        reply(`🚫 User removed after 3 warnings.`);
                    } else {
                        reply(`⚠️ Warned user. Total warnings: ${warnings[mentionedJid]}`);
                    }
                } else {
                    reply("❓ Unknown command. Type 'help' to see available options.");
                }
                break;
        }
    });
}

startSock();
