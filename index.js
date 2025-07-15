const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const qrcodeImage = require('qrcode');

// 📁 Ensure QR folder exists
const qrFolder = path.join(__dirname, 'qrcodes');
if (!fs.existsSync(qrFolder)) {
    fs.mkdirSync(qrFolder);
}

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📲 Scan the QR below to log in:');
            qrcode.generate(qr, { small: true });

            // 🖼️ Save QR to file
            const filePath = path.join(qrFolder, 'qr.png');
            await qrcodeImage.toFile(filePath, qr);
            console.log(`✅ QR Code saved to ${filePath}`);
        }

        const error = lastDisconnect?.error;
        const statusCode = error instanceof Boom ? error.output?.statusCode : null;

        if (connection === 'close') {
            console.log('❌ Disconnected. Reason:', statusCode);
            if (statusCode !== DisconnectReason.loggedOut) {
                startSock(); // reconnect
            } else {
                console.log('🔒 You are logged out. Delete auth folder and restart.');
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp connection established!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        console.log(`📨 Message from ${from}: ${text}`);

        if (text?.toLowerCase() === 'hi') {
            await sock.sendMessage(from, { text: '👋 Hello! Welcome to Yinka Bot!' });
        } else if (text?.toLowerCase() === 'help') {
            await sock.sendMessage(from, {
                text: '🛠 Available Commands:\n- hi\n- help',
            });
        } else {
            await sock.sendMessage(from, {
                text: `❓ Unknown command: "${text}"`,
            });
        }
    });
}

startSock();


// ✅ ADD THIS PART BELOW YOUR EXISTING CODE
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use('/qrcodes', express.static('qrcodes'));

app.get('/', (req, res) => {
  res.send('<h2>🖼️ <a href="/qrcodes/qr.png">Click here to view QR Code</a></h2>');
});

app.listen(PORT, () => {
  console.log(`🌐 QR code viewer running at http://localhost:${PORT}`);
});
