exports.run = async (sock, msg) => {
    const menu = `
*🤖 YINKA-BOT Menu*
• .alive – Check if bot is active
• .gpt <text> – Ask AI
• .ban @user – Remove user
• .kick @user – Kick user
• .tagall – Mention everyone
• .welcome on/off – Group welcome
• .menu – Show this menu
`;
    await sock.sendMessage(msg.key.remoteJid, { text: menu });
};
