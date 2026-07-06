import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { ButtonCustomId } from '../types/index.js';
import { logger } from '../utils/logger.js';

const TICKETS_CHANNEL_ID = '1509211671464513547';
const SUPPORT_CHANNEL_ID = '1511290951434371134';

export async function setupTicketPanel(client: Client, _guildId: string): Promise<void> {
  // ─── LB Ticket Panel ───
  const lbChannel = await client.channels.fetch(TICKETS_CHANNEL_ID);
  if (lbChannel && lbChannel.isTextBased()) {
    const textChannel = lbChannel as TextChannel;

    const embed = new EmbedBuilder()
      .setTitle('Challenge Tickets')
      .setColor(0x5865F2)
      .setDescription(
        '**Welcome to the TSBER Challenge System!**\n\n' +
        '**Create** — Register your profile with Roblox verification to join the leaderboard.\n' +
        '**Challenge** — Select an eligible opponent to challenge and start a match ticket.\n' +
        '**Apply for Leaderboard** — Open a ticket to apply for a spot on the leaderboard.\n\n' +
        'Click a button below to get started.',
      )
      .setFooter({ text: 'Persistent buttons • Work even after bot restarts' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ButtonCustomId.CREATE_PROFILE).setLabel('Create').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(ButtonCustomId.CHALLENGE).setLabel('Challenge').setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ButtonCustomId.APPLY_LEADERBOARD).setLabel('Apply for Leaderboard').setStyle(ButtonStyle.Secondary),
    );

    const messages = await textChannel.messages.fetch({ limit: 20 });
    const botMsg = messages.find((m) => m.author.id === client.user!.id && m.embeds.length > 0);

    if (botMsg) {
      await botMsg.edit({ embeds: [embed], components: [row1, row2] });
      logger.info(`LB ticket panel edited (message ${botMsg.id})`);
    } else {
      const message = await textChannel.send({ embeds: [embed], components: [row1, row2] });
      logger.info(`LB ticket panel created (message ${message.id})`);
    }
  }

  // ─── General Support Ticket Panel ───
  const supportChannel = await client.channels.fetch(SUPPORT_CHANNEL_ID);
  if (supportChannel && supportChannel.isTextBased()) {
    const sChannel = supportChannel as TextChannel;

    const supportEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(
        '# General Support\n' +
        'Open a ticket if you need help with anything.\n' +
        'A staff member will assist you.\n\n' +
        '> **Note:** Opening a ticket for no reason may result in a warning.',
      );

    const supportRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ButtonCustomId.GENERAL_SUPPORT).setLabel('Open Support Ticket').setStyle(ButtonStyle.Primary),
    );

    const sMessages = await sChannel.messages.fetch({ limit: 20 });
    const sBotMsg = sMessages.find((m) => m.author.id === client.user!.id && m.embeds.length > 0);

    if (sBotMsg) {
      await sBotMsg.edit({ embeds: [supportEmbed], components: [supportRow] });
      logger.info(`Support panel edited (message ${sBotMsg.id})`);
    } else {
      const sMessage = await sChannel.send({ embeds: [supportEmbed], components: [supportRow] });
      logger.info(`Support panel created (message ${sMessage.id})`);
    }
  }
}
