const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal'); // ✅ Make sure it's installed!

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        // printQRInTerminal: true, // deprecated — we handle it manually
    });

    // Show QR Code manually
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('📲 Scan the QR below to log in:');
            qrcode.generate(qr, { small: true }); // ✅ shows QR in terminal
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
