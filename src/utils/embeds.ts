import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { PlayerStatus } from '../types/index.js';

const BRAND_COLOR: ColorResolvable = 0x5865F2; // Discord blurple

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
    .setTitle(`❌ ${title}`)
    .setColor(0xED4245) // red
    .setDescription(description)
    .setTimestamp();
}

export function createSuccessEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setColor(0x57F287) // green
    .setDescription(description)
    .setTimestamp();
}

export function createWarningEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setColor(0xFEE75C) // yellow
    .setDescription(description)
    .setTimestamp();
}

export { BRAND_COLOR };
