exports.run = async (sock, msg) => {
    const groupId = msg.key.remoteJid;
    const metadata = await sock.groupMetadata(groupId);
    const members = metadata.participants.map(p => p.id);
    const mentions = members.map(id => ({ tag: `@${id.split('@')[0]}`, id }));
    await sock.sendMessage(groupId, {
        text: "👥 Tagging all members:
" + mentions.map(m => m.tag).join(' '),
        mentions: members,
    });
};
