import type { ButtonInteraction } from 'discord.js';
import { ButtonCustomId } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { discordLog } from '../../utils/discordLogger.js';

const TRYOUT_CHANNEL_ID = '1509132280738873417';
const REFEREES_ROLE_ID = '1520869356903600369';

export async function handleTryoutConfirmButton(interaction: ButtonInteraction): Promise<void> {
  const pending = (globalThis as any).pendingTryout;
  if (!pending) {
    await interaction.reply({ content: 'No pending tryout result found.', ephemeral: true });
    return;
  }

  // Verify the person clicking is the host
  if (interaction.user.id !== pending.hostId) {
    await interaction.reply({ content: 'Only the tryout host can confirm this.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  // Post the result in the tryout channel
  const channel = await interaction.client.channels.fetch(TRYOUT_CHANNEL_ID).catch(() => null);
  if (channel && channel.isTextBased()) {
    let resultText =
      `**Tryout Result**\n\n` +
      `<@${pending.userId}> tryout result is **${pending.stage} ${pending.mastery} ${pending.level}**`;

    if (pending.notes) resultText += `\n\n**Notes:** ${pending.notes}`;
    if (pending.pros) resultText += `\n**Pros:** ${pending.pros}`;
    if (pending.cons) resultText += `\n**Cons:** ${pending.cons}`;

    await (channel as any).send({ content: resultText });

    // If Stage 1, also announce in the stage 1 channel
    if (pending.stage === 'Stage 1') {
      const STAGE1_CHANNEL_ID = '1509302161409052855';
      const stage1Channel = await interaction.client.channels.fetch(STAGE1_CHANNEL_ID).catch(() => null);
      if (stage1Channel && stage1Channel.isTextBased()) {
        await (stage1Channel as any).send({ content: resultText });
      }
    }
  }

  // Update player stage in DB
  try {
    const { Player } = await import('../../database/models/Player.js');
    const player = await Player.findOne({ discordId: pending.userId });
    if (player) {
      player.stage = pending.stage;
      await player.save();
    }
  } catch {}

  await interaction.editReply({ content: `Confirmed! ${pending.stage} has been given to ${pending.username}. Result posted in <#${TRYOUT_CHANNEL_ID}>.` });

  await discordLog('Tryout Result', `**Player:** ${pending.username}\n**Stage:** ${pending.stage}\n**Level:** ${pending.level}\n**Mastery:** ${pending.mastery}\n**Host:** <@${pending.hostId}>`, 'info');
  logger.info(`Tryout confirmed: ${pending.username} — ${pending.stage} by ${pending.hostId}`);

  (globalThis as any).pendingTryout = null;
}

export async function handleTryoutCancelButton(interaction: ButtonInteraction): Promise<void> {
  const pending = (globalThis as any).pendingTryout;
  if (!pending) {
    await interaction.reply({ content: 'No pending tryout result found.', ephemeral: true });
    return;
  }

  if (interaction.user.id !== pending.hostId) {
    await interaction.reply({ content: 'Only the tryout host can cancel this.', ephemeral: true });
    return;
  }

  (globalThis as any).pendingTryout = null;
  await interaction.reply({ content: 'Tryout result cancelled.', ephemeral: true });
}
