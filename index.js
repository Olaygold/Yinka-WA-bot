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
    const userLastSeen = {};
    let giveawayActive = false;
    let giveawayWinnersCount = 1;
    let giveawayParticipants = [];
    


let welcomeMessage = `👋 Welcome to our investment group.

We share opportunities, updates, and growth tips.

💼 You can earn, grow, and connect with like-minded investors.

📢 Stay tuned for updates and participate in giveaways!

📩 Need help or want to invest? Contact admin @yinka_invests or reply "!help"`;

  

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

    sock.ev.on('group-participants.update', async (update) => {
        if (update.action === 'add') {
            await sock.sendMessage(update.id, { text: welcomeMessage });
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const name = msg.pushName || "User";
        const reply = (text) => sock.sendMessage(from, { text });

        userLastSeen[sender] = Date.now();

        if (text.startsWith("!setwelcome")) {
            const welcomeText = text.replace("!setwelcome", "").trim();
            if (welcomeText) {
                welcomeMessage = welcomeText;
                return reply("✅ Welcome message updated.");
            } else {
                return reply("⚠️ Please provide a welcome message.");
            }
        }

        if (text.startsWith("!inactive")) {
            const days = parseInt(text.split(" ")[1]) || 7;
            const inactiveUsers = Object.entries(userLastSeen)
                .filter(([id, lastSeen]) => (Date.now() - lastSeen) > days * 24 * 60 * 60 * 1000)
                .map(([id]) => id);
            return reply(`🙈 Users inactive for ${days} days:\n${inactiveUsers.join("\n")}`);

          
        if (text === "!ping") {
            return reply("🏓 Pong! Bot is active.");
        }

        if (text.startsWith("!setinterval")) {
            const minutes = parseInt(text.split(" ")[1]);
            if (isNaN(minutes)) return reply("⚠️ Provide minutes like `!setinterval 2`");
            sock.sendMessage(from, { text: `⏱️ Users will now wait ${minutes} minute(s) between messages.` });
        }

        if (text === "!startgiveaway") {
            giveawayActive = true;
            giveawayParticipants = [];
            return reply("🎉 Giveaway started. Use `!setwinners 2` to choose winner count.");
        }

        if (text.startsWith("!setwinners")) {
            const num = parseInt(text.split(" ")[1]);
            if (!isNaN(num) && num > 0) {
                giveawayWinnersCount = num;
                return reply(`🏆 Winner count set to ${giveawayWinnersCount}`);
            } else {
                return reply("⚠️ Provide a valid number. Example: !setwinners 2");
            }
        }

        if (text === "!endgiveaway") {
            if (giveawayParticipants.length === 0) return reply("🚫 No participants in giveaway.");
            const shuffled = giveawayParticipants.sort(() => 0.5 - Math.random());
            const winners = shuffled.slice(0, giveawayWinnersCount);
            giveawayActive = false;
            return reply(`🎊 Winners:
${winners.join("
")}`);
        }

        if (text === "!giveaway") {
            if (!giveawayActive) return reply("🚫 Giveaway has not started.");
            if (!giveawayParticipants.includes(sender)) {
                giveawayParticipants.push(sender);
                return reply("🎁 You have been added to the giveaway!");
            } else {
                return reply("ℹ️ You are already in the giveaway.");
            }
        }

        if (text.toLowerCase().includes("tag all")) {
            const cleanMsg = text.replace(/tag all/gi, "").trim();
            const metadata = await sock.groupMetadata(from);
            const members = metadata.participants.map(p => p.id);
            return sock.sendMessage(from, {
                text: cleanMsg || ".",
                mentions: members
            });
        }

        if (text === "help" || text === ".menu") {
            reply(`📖 *Bot Command Menu*

👤 *User Commands*
• hi
• rules
• !ping
• !giveaway
• help / .menu

🛠️ *Admin Commands*
• !startgiveaway / !endgiveaway
• !setwinners <number>
• !setwelcome <text>
• !inactive <days>
• !setrules <text>
• !tagall or write 'tag all' inside message
• !kick @user
• !warn @user / !warnings @user

📢 *Motivation*
"Don't be afraid to take risks. Every big investment starts with one brave move."

💬 *About*
This bot supports your investment group by enforcing rules, helping with giveaways, and automating engagement.

📞 Contact Admin: reach out in group.`);
        }

        if (text.startsWith("!kick")) {
            const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!mentioned) return reply("❗ Mention a user.");
            await sock.groupParticipantsUpdate(from, [mentioned], "remove");
            reply("✅ User has been removed.");
        }
    });
}

startSock();
