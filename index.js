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
  const userLastSeen = {}, warnings = {}, muted = {};
  let giveawayActive = false, giveawayWinnersCount = 1, giveawayParticipants = [];
  let welcomeMessage = '👋 Welcome to our investment group. We share opportunities, updates, and growth tips. 📈 Take risks wisely. Stay motivated and invest smartly. 💬 Reach out to the admin if you need help.';

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

      if (muted[sender] && Date.now() < muted[sender]) return;
      if (text.startsWith("!mute")) {
        const parts = text.split(" ");
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const mins = parseInt(parts[2]);
        if (mentioned && !isNaN(mins)) {
          muted[mentioned] = Date.now() + mins * 60000;
          return reply(`🔇 User muted for ${mins} minute(s).`);
        }
        return reply("❌ Use: !mute @user 5");
      }

      if (text.startsWith("!warn")) {
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentioned) return reply("❗ Mention a user to warn.");
        warnings[mentioned] = (warnings[mentioned] || 0) + 1;
        return reply(`⚠️ ${name} has ${warnings[mentioned]} warning(s).`);
      }

      if (text.startsWith("!warnings")) {
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentioned) return reply("❗ Mention a user.");
        return reply(`⚠️ Warnings: ${warnings[mentioned] || 0}`);
      }

      if (text.startsWith("!setwelcome")) {
        const welcomeText = text.replace("!setwelcome", "").trim();
        if (welcomeText) {
          welcomeMessage = welcomeText;
          return reply("✅ Welcome message updated.");
        }
        return reply("⚠️ Provide a welcome message.");
      }

      if (text.startsWith("!inactive")) {
        const days = parseInt(text.split(" ")[1]) || 7;
        const inactiveUsers = Object.entries(userLastSeen)
          .filter(([_, lastSeen]) => (Date.now() - lastSeen) > days * 86400000)
          .map(([id]) => id);
        return reply(`🙈 Inactive for ${days} days:
${inactiveUsers.join("
") || "None"}`);
      }

      if (text === "!ping") return reply("🏓 Pong! Bot is active.");

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
        }
        return reply("⚠️ Provide a valid number.");
      }

      if (text === "!endgiveaway") {
        if (giveawayParticipants.length === 0) return reply("🚫 No participants.");
        const shuffled = giveawayParticipants.sort(() => 0.5 - Math.random());
        const winners = shuffled.slice(0, giveawayWinnersCount);
        const names = await Promise.all(winners.map(async (id) => {
          const contact = await sock.onWhatsApp(id);
          return `🥇 @${contact?.[0]?.notify || id.split("@")[0]}`;
        }));
        await sock.sendMessage(from, {
          text: `🎊 *Giveaway Winners:*
${names.join("
")}`,
          mentions: winners
        });
        giveawayActive = false;
        return;
      }

      if (text === "!giveaway") {
        if (!giveawayActive) return reply("🚫 Giveaway not started.");
        if (!giveawayParticipants.includes(sender)) {
          giveawayParticipants.push(sender);
          return reply("🎁 You joined the giveaway!");
        }
        return reply("ℹ️ Already joined.");
      }

      if (text.toLowerCase().includes("tag all")) {
        const message = text.replace(/tag all/gi, "").trim();
        const metadata = await sock.groupMetadata(from);
        const members = metadata.participants.map(p => p.id);
        await sock.sendMessage(from, { text: `${message || "Group alert!"}`, mentions: members });
        return;
      }

      if (text.startsWith("!kick")) {
        const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentioned) return reply("❗ Mention user.");
        await sock.groupParticipantsUpdate(from, [mentioned], "remove");
        return reply("✅ User removed.");
      }

      if (text === "help" || text === ".menu") {
        return reply(`📖 *Bot Commands*

👤 Users:
• !ping, !giveaway, help, rules
🛠️ Admins:
• !startgiveaway, !endgiveaway, !setwinners N
• !warn @user, !warnings @user, !kick @user, !mute @user Mins
• !setwelcome <text>, !inactive <days>, tag all
        `);
      }

    } catch (err) {
      console.error("❌ Message error:", err);
    }
  });
}

startSock();