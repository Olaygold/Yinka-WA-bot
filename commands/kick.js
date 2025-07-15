exports.run = async (sock, msg, args) => {
    const groupId = msg.key.remoteJid;
    const mentionedJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentionedJid.length) return sock.sendMessage(groupId, { text: "❗ Tag a user to kick." });
    await sock.groupParticipantsUpdate(groupId, mentionedJid, "remove");
};
