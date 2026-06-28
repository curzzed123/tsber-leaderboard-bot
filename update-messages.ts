import 'dotenv/config';
import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID!;

const LB_CHANNELS = [
  { id: process.env.LEADERBOARD_CHANNEL_1_ID!, title: '🏆 Top 10 Leaderboard', min: 1, max: 10 },
  { id: process.env.LEADERBOARD_CHANNEL_2_ID!, title: '⚔️ Top 20 Leaderboard', min: 11, max: 20 },
  { id: process.env.LEADERBOARD_CHANNEL_3_ID!, title: '🎖️ Top 30 Leaderboard', min: 21, max: 30 },
];
const TICKETS_CHANNEL_ID = process.env.TICKETS_CHANNEL_ID!;

const GRADIENT_BAR = '████████▓▓▓▒▒▒░░░';

function vacantSlot(rank: number): string {
  return (
    `**#${rank}** Vacant\n` +
    `ID: —\n` +
    `*No player registered*\n` +
    `<< | .vacant. | >>\n` +
    `Region: —\n` +
    `Stage: —\n` +
    `Status: Empty\n` +
    `wins: 0 losses: 0\n` +
    GRADIENT_BAR
  );
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  await client.login(TOKEN);
  console.log(`Logged in as ${client.user?.tag}`);

  for (const lb of LB_CHANNELS) {
    if (!lb.id) continue;
    const channel = await client.channels.fetch(lb.id) as TextChannel;
    if (!channel) continue;

    const messages = await channel.messages.fetch({ limit: 20 });
    const botMsg = messages.find((m) => m.author.id === client.user!.id && m.embeds.length > 0);

    const entries: string[] = [];
    for (let rank = lb.min; rank <= lb.max; rank++) {
      entries.push(vacantSlot(rank));
    }

    const embed = new EmbedBuilder()
      .setTitle(lb.title)
      .setColor(0x1a1a2e)
      .setDescription(entries.join('\n\u200B\n'))
      .setTimestamp()
      .setFooter({ text: 'Click a username to view their Roblox profile • Updated in real-time' });

    if (botMsg) {
      await botMsg.edit({ embeds: [embed] });
      console.log(`Edited "${lb.title}" in #${channel.name}`);
    } else {
      await channel.send({ embeds: [embed] });
      console.log(`Sent new "${lb.title}" in #${channel.name}`);
    }
  }

  if (TICKETS_CHANNEL_ID) {
    const channel = await client.channels.fetch(TICKETS_CHANNEL_ID) as TextChannel;
    if (channel) {
      const messages = await channel.messages.fetch({ limit: 20 });
      const botMsg = messages.find((m) => m.author.id === client.user!.id && m.embeds.length > 0);

      const embed = new EmbedBuilder()
        .setTitle('🎫 Challenge Tickets')
        .setColor(0x5865F2)
        .setDescription(
          '**Welcome to the TSBER Challenge System!**\n\n' +
          '**Create** — Register your profile with Roblox verification to join the leaderboard.\n' +
          '**Challenge** — Select an eligible opponent to challenge and start a match ticket.\n\n' +
          'Click a button below to get started.',
        )
        .setFooter({ text: 'Persistent buttons • Work even after bot restarts' })
        .setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('btn_create_profile').setLabel('Create').setStyle(ButtonStyle.Success).setEmoji('📝'),
        new ButtonBuilder().setCustomId('btn_challenge').setLabel('Challenge').setStyle(ButtonStyle.Primary).setEmoji('⚔️'),
      );

      if (botMsg) {
        await botMsg.edit({ embeds: [embed], components: [row] });
        console.log(`Edited ticket panel in #${channel.name}`);
      } else {
        await channel.send({ embeds: [embed], components: [row] });
        console.log(`Sent new ticket panel in #${channel.name}`);
      }
    }
  }

  console.log('\nAll messages updated! Check your Discord.');
  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
