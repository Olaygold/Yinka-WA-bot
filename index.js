
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const express = require('express');

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
    const warnings = {};

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

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const name = msg.pushName || "User";
        const reply = (text) => sock.sendMessage(from, { text });

        // Commands
        if (text === "hi") {
            reply("👋 Hello! Welcome to the Group Bot!");
        } else if (text === "help" || text === ".menu") {
            reply(`📖 *Available Commands*

👤 *User Commands:*
• hi - Say hello
• rules - View group rules
• help / .menu - View this menu
• !giveaway - Enter giveaway
• !groupinfo - Get group info
• !ping - Check bot status

🛠️ *Admin Commands:*
• !warn @user - Issue warning
• !warnings @user - View warnings
• !kick @user - Remove user
• !mute @user - Mute user (admin-only)
• !unmute @user - Unmute user
• !tagall - Mention everyone
• !welcome on/off - Enable/disable welcome message
• !setrules <text> - Set group rules
`);
        } else if (text === "rules") {
            const rulesPath = './rules.txt';
            if (fs.existsSync(rulesPath)) {
                const rulesText = fs.readFileSync(rulesPath, 'utf8');
                reply(`📜 Group Rules:
${rulesText}`);
            } else {
                reply("⚠️ No rules have been set. Use !setrules <text> to set them.");
            }
        } else if (text.startsWith("!setrules")) {
            const ruleText = text.slice(10).trim();
            if (!ruleText) return reply("⚠️ Provide the rules text.");
            fs.writeFileSync('./rules.txt', ruleText);
            reply("✅ Rules updated successfully.");
        } else if (text === "!giveaway") {
            reply("🎁 You've been added to the giveaway! Winners will be announced soon.");
        } else if (text === "!groupinfo") {
            const metadata = await sock.groupMetadata(from);
            reply(`👥 *Group Info*
Name: ${metadata.subject}
Members: ${metadata.participants.length}`);
        } else if (text === "!tagall") {
            const metadata = await sock.groupMetadata(from);
            const members = metadata.participants.map(p => p.id);
            await sock.sendMessage(from, {
                text: "📢 @everyone",
                mentions: members
            });
        } else if (text.startsWith("!warn")) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!mentioned) return reply("❗ Mention a user to warn.");
            warnings[mentioned] = (warnings[mentioned] || 0) + 1;
            if (warnings[mentioned] >= 3) {
                await sock.groupParticipantsUpdate(from, [mentioned], "remove");
                reply("⛔ User removed after 3 warnings.");
            } else {
                reply(`⚠️ Warning issued. Total: ${warnings[mentioned]}`);
            }
        } else if (text.startsWith("!warnings")) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!mentioned) return reply("❗ Mention a user.");
            const count = warnings[mentioned] || 0;
            reply(`⚠️ User has ${count} warning(s).`);
        } else if (text.startsWith("!kick")) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!mentioned) return reply("❗ Mention a user.");
            await sock.groupParticipantsUpdate(from, [mentioned], "remove");
            reply("✅ User has been removed.");
        }
    });
}

startSock();
