const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth'); // Fixed here ✅

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        const error = lastDisconnect?.error;
        const statusCode = error instanceof Boom ? error.output?.statusCode : null;

        if (connection === 'close') {
            console.log('❌ Connection closed. Code:', statusCode);
            if (statusCode !== DisconnectReason.loggedOut) {
                startSock(); // reconnect
            } else {
                console.log('🔒 Logged out. Delete auth and scan again.');
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
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
            await sock.sendMessage(from, { text: '🛠 Available commands:\n- hi\n- help' });
        } else {
            await sock.sendMessage(from, { text: `❓ Unrecognized command: "${text}"` });
        }
    });
}

startSock();
