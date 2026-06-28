import type { ButtonInteraction } from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ModalCustomId, ModalInputCustomId } from '../../types/index.js';

export async function handleCreateProfileButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(ModalCustomId.CREATE_PROFILE)
    .setTitle('Create Your Profile');

  const robloxUsernameInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.ROBLOX_USERNAME)
    .setLabel('Roblox Username')
    .setPlaceholder('Enter your verified Roblox username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const regionInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.REGION)
    .setLabel('Region (EU, AS, NA)')
    .setPlaceholder('EU, AS, or NA')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2);

  const headshotInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.CUSTOM_HEADSHOT_URL)
    .setLabel('Profile Picture URL (optional)')
    .setPlaceholder('Paste a direct image URL — leave empty for Roblox avatar')
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(robloxUsernameInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(regionInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(headshotInput);

  modal.addComponents(row1, row2, row3);

  await interaction.showModal(modal);
}
