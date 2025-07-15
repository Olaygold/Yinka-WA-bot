exports.run = async (sock, msg) => {
    const now = new Date().toLocaleString();
    await sock.sendMessage(msg.key.remoteJid, { text: `🕒 Current time: ${now}` });
};
