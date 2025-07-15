exports.run = async (sock, msg, args) => {
    const groupId = msg.key.remoteJid;
    if (!args) return sock.sendMessage(groupId, { text: "Use .welcome on OR .welcome off" });
    sock.sendMessage(groupId, { text: `✅ Welcome message is now *${args.toUpperCase()}*` });
};
