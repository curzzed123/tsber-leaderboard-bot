import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

export const makehook: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('makehook')
    .setDescription('Create a custom embed message')
    .addStringOption((option) =>
      option.setName('title').setDescription('Embed title').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('description').setDescription('Embed description / body text').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('color').setDescription('Hex color (e.g. #FF0000 or FF0000)').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('thumbnail').setDescription('Thumbnail image URL (top right small)').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('image').setDescription('Large image URL (bottom)').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('footer').setDescription('Footer text').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('author').setDescription('Author name (top left)').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('field1_name').setDescription('Field 1 name').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('field1_value').setDescription('Field 1 value').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('field2_name').setDescription('Field 2 name').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('field2_value').setDescription('Field 2 value').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('field3_name').setDescription('Field 3 name').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('field3_value').setDescription('Field 3 value').setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName('timestamp').setDescription('Show timestamp').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('content').setDescription('Message content above the embed (plain text)').setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const colorStr = interaction.options.getString('color');
    const thumbnail = interaction.options.getString('thumbnail');
    const image = interaction.options.getString('image');
    const footer = interaction.options.getString('footer');
    const author = interaction.options.getString('author');
    const field1Name = interaction.options.getString('field1_name');
    const field1Value = interaction.options.getString('field1_value');
    const field2Name = interaction.options.getString('field2_name');
    const field2Value = interaction.options.getString('field2_value');
    const field3Name = interaction.options.getString('field3_name');
    const field3Value = interaction.options.getString('field3_value');
    const showTimestamp = interaction.options.getBoolean('timestamp') ?? false;
    const content = interaction.options.getString('content');

    // If nothing provided at all
    if (!title && !description && !content && !field1Name && !image) {
      await interaction.reply({ content: 'Provide at least a title, description, or content.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    if (footer) embed.setFooter({ text: footer });
    if (author) embed.setAuthor({ name: author });

    // Parse color
    let color = 0x5865F2; // default blurple
    if (colorStr) {
      const hex = colorStr.replace('#', '');
      const parsed = parseInt(hex, 16);
      if (!isNaN(parsed)) color = parsed;
    }
    embed.setColor(color);

    if (showTimestamp) embed.setTimestamp();

    // Add fields
    const fields: { name: string; value: string; inline: boolean }[] = [];
    if (field1Name && field1Value) fields.push({ name: field1Name, value: field1Value, inline: false });
    if (field2Name && field2Value) fields.push({ name: field2Name, value: field2Value, inline: false });
    if (field3Name && field3Value) fields.push({ name: field3Name, value: field3Value, inline: false });
    if (fields.length > 0) embed.addFields(fields);

    // Send the embed
    try {
      const messageOptions: any = { embeds: [embed] };
      if (content) messageOptions.content = content;

      await interaction.channel!.send(messageOptions);
      await interaction.reply({ content: 'Embed sent.', ephemeral: true });
    } catch (error) {
      logger.error('Failed to send makehook embed:', error);
      await interaction.reply({ content: 'Failed to send embed. Check permissions.', ephemeral: true });
    }
  },
};
