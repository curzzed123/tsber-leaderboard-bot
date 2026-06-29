import type { ButtonInteraction } from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ModalCustomId, ModalInputCustomId } from '../../types/index.js';

export async function handleApplyLeaderboardButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(ModalCustomId.APPLY_LEADERBOARD)
    .setTitle('Apply for Leaderboard');

  const robloxUsernameInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.APPLY_ROBLOX_USERNAME)
    .setLabel('Roblox Username')
    .setPlaceholder('Enter your Roblox username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const regionInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.APPLY_REGION)
    .setLabel('Region (EU, AS, NA)')
    .setPlaceholder('EU, AS, or NA')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2);

  const experienceInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.APPLY_EXPERIENCE)
    .setLabel('Experience / Why you deserve a spot')
    .setPlaceholder('Tell us about your experience and why you should be on the leaderboard...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(robloxUsernameInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(regionInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(experienceInput);

  modal.addComponents(row1, row2, row3);

  await interaction.showModal(modal);
}
