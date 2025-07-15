const fs = require('fs');
const path = require('path');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');     // For terminal display
const QRCode = require('qrcode');              // For image saving

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // If QR code is generated, show and save it
        if (qr) {
            console.log('📲 Scan the QR below to log in:\n');
            qrcode.generate(qr, { small: true }); // Show in terminal

            const qrDir = path.join(__dirname, 'qrcodes');
            if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir); // Make folder if not exist

            const filePath = path.join(qrDir, 'qr.png');
            try {
                await QRCode.toFile(filePath, qr, {
                    color: {
                        dark: '#000000',
                        light: '#ffffff',
                    },
                    width: 300,
                });
                console.log(`🖼️ QR Code saved to ${filePath}`);
            } catch (err) {
                console.error('❌ Failed to save QR code image:', err);
            }
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
