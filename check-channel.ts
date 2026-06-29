import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('clientReady', async () => {
  console.log('Logged in as', client.user!.tag);
  const ch = await client.channels.fetch('1509211671464513547').catch((e: Error) => console.log('Error:', e.message));
  if (ch) {
    console.log('Channel type:', ch.type);
    console.log('Channel name:', (ch as any).name);
    console.log('Is text:', ch.isTextBased());
  } else {
    console.log('Channel is null');
  }
  client.destroy();
  process.exit(0);
});
client.login(process.env.DISCORD_TOKEN);
