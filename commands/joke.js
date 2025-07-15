exports.run = async (sock, msg) => {
    const jokes = [
        "Why did the chicken join WhatsApp? To get to the other chat!",
        "I'm not lazy, I'm just in energy-saving mode.",
        "Why don't scientists trust atoms? Because they make up everything!"
    ];
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    await sock.sendMessage(msg.key.remoteJid, { text: joke });
};
