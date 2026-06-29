import type { ButtonInteraction } from 'discord.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ModalCustomId, ModalInputCustomId } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { hasRefereePermission } from '../../utils/permissions.js';

const REFEREES_ROLE_ID = '1520869356903600369';

export async function handleClaimTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!hasRefereePermission(interaction.member as any)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can claim tickets.')], ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(ModalCustomId.CLAIM_TICKET)
    .setTitle('Claim Ticket — Set Fight Details');

  const fightTimeInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.CLAIM_FIGHT_TIME)
    .setLabel('Fight Time (YYYY-MM-DD HH:MM)')
    .setPlaceholder('e.g. 2026-06-29 6:30')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(25);

  const fightTypeInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.CLAIM_FIGHT_TYPE)
    .setLabel('Fight Type (auto or normal)')
    .setPlaceholder('auto or normal')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const ampmInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.CLAIM_AM_PM)
    .setLabel('AM or PM (UTC)')
    .setPlaceholder('AM or PM')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(2);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(fightTimeInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(fightTypeInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(ampmInput);

  modal.addComponents(row1, row2, row3);

  await interaction.showModal(modal);
}
