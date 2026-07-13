import type { ButtonInteraction } from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ModalCustomId, ModalInputCustomId } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { hasRefereePermission } from '../../utils/permissions.js';

export async function handleClaimTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!hasRefereePermission(interaction.member as any)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can claim tickets.')], ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(ModalCustomId.CLAIM_TICKET)
    .setTitle('Claim Ticket');

  const fightTypeInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.CLAIM_FIGHT_TYPE)
    .setLabel('Fight Type (auto or normal)')
    .setPlaceholder('auto or normal')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const countryInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.CLAIM_COUNTRY)
    .setLabel('Country (e.g. Germany, France)')
    .setPlaceholder('Germany')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(50);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(fightTypeInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(countryInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}
