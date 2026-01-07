const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { deferPrivate, replyPrivate } = require("../utils/respond");
const {
  getTicketPermissionsConfig,
  getTicketRecord,
} = require("../storage/guildConfigStore");

/**
 * Extracts the ticket ID from a channel name.
 * Ticket channels are named like "12ab34cd-ticket-name"
 * This grabs the first 8 hex characters before the dash.
 * @param {Object} channel - Discord channel object
 * @returns {string|null} - Lowercase ticket ID or null if not found
 */
function parseTicketIdFromChannel(channel) {
  const name = channel?.name ? String(channel.name) : "";
  // Look for 8 hex characters followed by a dash at the start
  const m = name.match(/^([0-9a-fA-F]{8})-/);
  if (!m) return null;
  return m[1].toLowerCase();
}

/**
 * Checks if the user has permission to moderate tickets.
 * They need either "Manage Server" permission OR one of the configured moderator roles.
 * @param {Object} interaction - Discord interaction object
 * @param {Object} permsCfg - Ticket permissions configuration
 * @returns {boolean} - True if user can moderate tickets
 */
function isTicketModerator(interaction, permsCfg) {
  const memberPerms = interaction.memberPermissions;
  // Check if they have Manage Server permission
  const isManageServer = Boolean(
    memberPerms && memberPerms.has(PermissionFlagsBits.ManageGuild)
  );

  // Check if they have any of the configured moderator roles
  const roleIds = permsCfg.ticketModeratorRoleIds ?? [];
  const memberRoles = interaction.member?.roles;
  const hasRole =
    typeof memberRoles?.cache?.has === "function"
      ? roleIds.some((id) => memberRoles.cache.has(id))
      : false;

  return isManageServer || hasRole;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tpull")
    .setDescription("Pull a user into the current ticket channel")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to add to this ticket")
        .setRequired(true)
    ),
  
  async execute(interaction) {
    // Only works in servers, not DMs
    if (!interaction.inGuild()) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a server.",
      });
    }

    // Make sure we're in a text-based channel
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return replyPrivate(interaction, {
        content: "This command must be used in a server text channel.",
      });
    }

    // Extract the ticket ID from the channel name (e.g., "12ab34cd-support")
    const ticketId = parseTicketIdFromChannel(channel);
    if (!ticketId) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a ticket channel.",
      });
    }

    // Verify the ticket actually exists in the database
    const record = await getTicketRecord(interaction.guildId, ticketId);
    if (!record) {
      return replyPrivate(interaction, {
        content: `Ticket \`${ticketId.toUpperCase()}\` wasn't found (already closed?).`,
      });
    }

    // Check if the user has permission to pull users into tickets
    const permsCfg = await getTicketPermissionsConfig(interaction.guildId);
    if (!isTicketModerator(interaction, permsCfg)) {
      return replyPrivate(interaction, {
        content: "You don't have permission to pull users into tickets.",
      });
    }

    // Defer since we're about to modify channel permissions
    await deferPrivate(interaction);

    // Get the user they want to pull into the ticket
    const user = interaction.options.getUser("user", true);

    try {
      // Give the user permission to view and interact with this ticket channel
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      return replyPrivate(interaction, {
        content: `Pulled <@${user.id}> into ticket \`${ticketId.toUpperCase()}\`.`,
      });
    } catch (err) {
      // Usually fails if bot lacks Manage Channels permission
      console.error("Failed to tpull user into ticket", err);
      return replyPrivate(interaction, {
        content: "I couldn't update permissions for that user (missing permissions?).",
      });
    }
  },
};

// very reliant on a LOT of other code lel
//NO i did not copy and paste from Tignore.js i swear