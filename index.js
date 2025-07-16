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

  const userLastSeen = {};
  const mutedUsers = {};
  let giveawayActive = false;
  let giveawayWinnersCount = 1;
  let giveawayParticipants = [];
  let welcomeMessage = `👋 Welcome to our investment group. We share opportunities, updates, and growth tips.
📈 Take risks wisely. Stay motivated and invest smartly.
💬 Reach out to the admin if you need help.`;

  sock.ev.on('connection.update', async (update) => {
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
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const from = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
      const name = msg.pushName || "User";
      const reply = (text) => sock.sendMessage(from, { text });

      userLastSeen[sender] = Date.now();

      if (mutedUsers[sender] && Date.now() < mutedUsers[sender]) {
        return;
      }

      if (text.startsWith("!mute")) {
        const [_, mention, mins] = text.split(" ");
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentioned || isNaN(mins)) return reply("Usage: !mute @user 5");
        mutedUsers[mentioned] = Date.now() + parseInt(mins) * 60000;
        return reply(`🔇 Muted user for ${mins} minutes.`);
      }

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
          .filter(([_, lastSeen]) => (Date.now() - lastSeen) > days * 24 * 60 * 60 * 1000)
          .map(([id]) => id);
        return reply(`🙈 Users inactive for ${days} days:
${inactiveUsers.join("\n") || "None"}`);
      }

      if (text === "!ping") {
        return reply("🏓 Pong! Bot is active.");
      }

      if (text === "!startgiveaway") {
        giveawayActive = true;
        giveawayParticipants = [];
        return reply("🎉 Giveaway started. Use !setwinners <number> to set winner count.");
      }

      if (text.startsWith("!setwinners")) {
        const num = parseInt(text.split(" ")[1]);
        if (!isNaN(num) && num > 0) {
          giveawayWinnersCount = num;
          return reply(`🏆 Winner count set to ${giveawayWinnersCount}`);
        } else {
          return reply("⚠️ Provide a valid number.");
        }
      }

      if (text === "!endgiveaway") {
        if (giveawayParticipants.length === 0) return reply("🚫 No participants.");
        const shuffled = giveawayParticipants.sort(() => 0.5 - Math.random());
        const winners = shuffled.slice(0, giveawayWinnersCount);
        const names = await Promise.all(winners.map(async (id) => {
          const contact = await sock.onWhatsApp(id);
          const name = contact?.[0]?.notify || contact?.[0]?.jid.split('@')[0] || id;
          return `🥇 @${id.split('@')[0]} (${name})`;
        }));
        return sock.sendMessage(from, {
          text: `🎊 *Giveaway Winners:*
${names.join("\n")}`,
          mentions: winners
        });
      }

      if (text === "!giveaway") {
        if (!giveawayActive) return reply("🚫 Giveaway not started.");
        if (!giveawayParticipants.includes(sender)) {
          giveawayParticipants.push(sender);
          return reply("🎁 Added to giveaway!");
        } else {
          return reply("ℹ️ Already participating.");
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
        return reply(`📖 *Bot Menu*

👤 User:
• !ping
• !giveaway

🛠 Admin:
• !startgiveaway / !endgiveaway
• !setwinners <number>
• !setwelcome <text>
• !inactive <days>
• !mute @user <minutes>
• !tagall or 'tag all'

📢 Investment Tip:
"Opportunities multiply as they are seized."`);
      }

    } catch (error) {
      console.error("❌ Error:", error);
    }
  });
}

startSock();
