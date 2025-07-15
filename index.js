const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const { state, saveState } = useSingleFileAuthState('./auth_info.json');

async function startSock() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const error = lastDisconnect?.error;
            const statusCode = error instanceof Boom ? error.output.statusCode : null;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('❌ Connection closed:', statusCode, ', reconnecting:', shouldReconnect);

            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
        }
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!text) return;

        console.log(`📩 Message from ${from}: ${text}`);

        if (text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello') {
            await sock.sendMessage(from, { text: 'Hello! 👋 I am your bot. Type "help" to see what I can do.' });
        } else if (text.toLowerCase() === 'help') {
            await sock.sendMessage(from, {
                text: '🤖 Available commands:\n\n- `hi` / `hello`: Greet the bot\n- `help`: Show this help message',
            });
        } else {
            await sock.sendMessage(from, { text: `❓ I don't understand "${text}". Type "help" to see available commands.` });
        }
    });
}

startSock();
