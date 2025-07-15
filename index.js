const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const express = require('./keepalive');
const config = require('./config');

const { default: makeWASocket, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const { state, saveState } = useSingleFileAuthState('./session/auth_info.json');

async function startBot() {
    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const sender = msg.key.remoteJid;

        if (body.startsWith(config.prefix)) {
            const cmd = body.slice(config.prefix.length).trim().split(' ')[0];
            const args = body.slice(config.prefix.length + cmd.length).trim();

            try {
                const command = require(`./commands/${cmd}`);
                command.run(sock, msg, args);
            } catch {
                await sock.sendMessage(sender, { text: "❌ Unknown command. Try .menu" });
            }
        }
    });
}

startBot();
