const fs = require('fs');
const { Chats } = require('./services');
const states = {},
  emotes = {},
  counts = { twitch: 0, kick: 0, starvios: 0 };
const clients = new Chats((type, data) => {
  if (type === 'status') {
    states[data.platform] = data;
    console.log(data.platform + ': ' + data.text);
  }
  if (type === 'emotes') {
    emotes[data.platform] = { count: data.count, failed: data.failed };
    console.log(data.platform + ': ' + data.count + ' emotes externos');
  }
  if (type === 'message') counts[data.platform]++;
});
clients.start({
  twitch: { channel: 'hads1', enabled: true },
  kick: { channel: 'hads1', enabled: true },
  starvios: { channel: 'hads', enabled: true },
});
setTimeout(
  () => {
    clients.stop();
    const result = {
      at: new Date().toISOString(),
      states,
      emotes,
      messagesReceived: counts,
    };
    fs.writeFileSync('live-result.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    process.exit(
      ['twitch', 'kick', 'starvios'].every((p) => states[p]?.state === 'ok')
        ? 0
        : 1,
    );
  },
  process.argv.includes('--watch') ? 60000 : 20000,
);
