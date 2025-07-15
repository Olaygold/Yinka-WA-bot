const axios = require("axios");

exports.run = async (sock, msg, args) => {
    if (!args) return sock.sendMessage(msg.key.remoteJid, { text: "❓ Ask me something!" });

    try {
        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: args }]
        }, {
            headers: {
                "Authorization": "Bearer sk-demo-YINKA1234567", // Replace with your own
                "Content-Type": "application/json"
            }
        });

        const reply = response.data.choices[0].message.content;
        await sock.sendMessage(msg.key.remoteJid, { text: reply });
    } catch (err) {
        await sock.sendMessage(msg.key.remoteJid, { text: "⚠️ Error talking to GPT." });
    }
};
