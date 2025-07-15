const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// Load authentication state
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

// Create the socket
async function startSock() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    // Listen for connection updates
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
        }
    });

    // Save auth credentials every time they update
    sock.ev.on('creds.update', saveState);

    // Respond to incoming messages
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

// Start the bot
startSock();
