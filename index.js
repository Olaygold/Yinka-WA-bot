const express = require("express");
const { default: makeWASocket, useSingleFileAuthState } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const P = require("pino");
const { Configuration, OpenAIApi } = require("openai");

// Load session state
const { state, saveState } = useSingleFileAuthState("./session/auth_info.json");

// Setup OpenAI (ChatGPT) — replace with your actual API key
const configuration = new Configuration({
  apiKey: "sk-xxx_your_free_key_here",
});
const openai = new OpenAIApi(configuration);

// Start Express server (needed for Render to keep bot alive)
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Yinka WhatsApp Bot is running!");
});

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});

// Start WhatsApp bot
async function startBot() {
  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveState);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!text) return;

    console.log("📩 Message from", sender, ":", text);

    // Reply with GPT response
    try {
      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: text }],
      });

      const reply = response.data.choices[0].message.content;
      await sock.sendMessage(sender, { text: reply });
    } catch (err) {
      console.error("❌ OpenAI Error:", err.message);
      await sock.sendMessage(sender, { text: "❌ GPT error. Try again later." });
    }
  });
}

startBot();
