import { EmbedBuilder, ColorResolvable } from 'discord.js';

const BRAND_COLOR: ColorResolvable = 0x5865F2;

export function createBaseEmbed(
  title: string,
  description?: string,
  color: ColorResolvable = BRAND_COLOR,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }
  return embed;
}

export function createErrorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0xED4245)
    .setDescription(description)
    .setTimestamp();
}

export function createSuccessEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x57F287)
    .setDescription(description)
    .setTimestamp();
}

export function createWarningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0xFEE75C)
    .setDescription(description)
    .setTimestamp();
}

export { BRAND_COLOR };
