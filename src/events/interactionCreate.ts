import type { Interaction, ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction, AutocompleteInteraction } from 'discord.js';
import { logger } from '../utils/logger.js';
import { commands } from '../commands/index.js';
import { handleCreateProfileButton } from '../components/buttons/createProfile.js';
import { handleChallengeButton } from '../components/buttons/challenge.js';
import { handleApplyLeaderboardButton } from '../components/buttons/applyLeaderboard.js';
import { handleClaimTicketButton } from '../components/buttons/claimTicket.js';
import { handleCloseTicketButton, handleDMWinnerButton, handleDMScoreModal } from '../components/buttons/closeTicket.js';
import { handleTryoutConfirmButton, handleTryoutCancelButton } from '../components/buttons/tryoutResult.js';
import { handleGeneralSupportButton, handleGeneralSupportModal } from '../components/buttons/generalSupport.js';
import { handleCreateProfileModal } from '../components/modals/createProfileModal.js';
import { handleApplyLeaderboardModal } from '../components/modals/applyLeaderboardModal.js';
import { handleClaimTicketModal } from '../components/modals/claimTicketModal.js';
import { handleChallengeOpponentSelect } from '../components/selects/challengeOpponentSelect.js';
import { ButtonCustomId, ModalCustomId, SelectCustomId } from '../types/index.js';

export async function execute(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
  } catch (error) {
    logger.error(`Error handling interaction (${interaction.type}):`, error);

    if (interaction.isRepliable()) {
      const errorMessage = 'An error occurred while processing your request.';
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage }).catch(() => {});
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
      }
    }
  }
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const command = commands.find((cmd) => cmd.data.name === interaction.commandName);
  if (!command) return;

  // The execute function handles autocomplete when interaction.isAutocomplete() is true
  await command.execute(interaction as any);
}

async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.find((cmd) => cmd.data.name === interaction.commandName);

  if (!command) {
    logger.warn(`Unknown command: ${interaction.commandName}`);
    await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    return;
  }

  await command.execute(interaction);
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  switch (interaction.customId) {
    case ButtonCustomId.CREATE_PROFILE:
      await handleCreateProfileButton(interaction);
      break;
    case ButtonCustomId.CHALLENGE:
      await handleChallengeButton(interaction);
      break;
    case ButtonCustomId.APPLY_LEADERBOARD:
      await handleApplyLeaderboardButton(interaction);
      break;
    case ButtonCustomId.CLAIM_TICKET:
      await handleClaimTicketButton(interaction);
      break;
    case ButtonCustomId.CLOSE_TICKET:
      await handleCloseTicketButton(interaction);
      break;
    case ButtonCustomId.GENERAL_SUPPORT:
      await handleGeneralSupportButton(interaction);
      break;
    default:
      // Check for DM winner buttons (customId format: "dm_win_challenger:TICKET_ID")
      if (interaction.customId.startsWith('dm_win_')) {
        await handleDMWinnerButton(interaction);
      } else if (interaction.customId.startsWith(ButtonCustomId.TRYOUT_CONFIRM)) {
        await handleTryoutConfirmButton(interaction);
      } else if (interaction.customId === ButtonCustomId.TRYOUT_CANCEL) {
        await handleTryoutCancelButton(interaction);
      } else {
        logger.warn(`Unknown button customId: ${interaction.customId}`);
      }
  }
}

async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  // Check for DM score modal (customId format: "modal_dm_score:TICKET_ID:OUTCOME")
  if (interaction.customId.startsWith(ModalCustomId.DM_SCORE)) {
    await handleDMScoreModal(interaction);
    return;
  }

  switch (interaction.customId) {
    case ModalCustomId.CREATE_PROFILE:
      await handleCreateProfileModal(interaction);
      break;
    case ModalCustomId.APPLY_LEADERBOARD:
      await handleApplyLeaderboardModal(interaction);
      break;
    case ModalCustomId.CLAIM_TICKET:
      await handleClaimTicketModal(interaction);
      break;
    case ModalCustomId.GENERAL_SUPPORT:
      await handleGeneralSupportModal(interaction);
      break;
    default:
      logger.warn(`Unknown modal customId: ${interaction.customId}`);
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  switch (interaction.customId) {
    case SelectCustomId.CHALLENGE_OPPONENT:
      await handleChallengeOpponentSelect(interaction);
      break;
    default:
      logger.warn(`Unknown select menu customId: ${interaction.customId}`);
  }
}
