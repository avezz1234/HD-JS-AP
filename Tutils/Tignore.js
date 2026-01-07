const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { deferPrivate, replyPrivate } = require("../utils/respond");
const { closeTicket, displayTicketId, safeDeleteChannel } = require("../tickets/ticketWorkflow");
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
  return m[1].toLowerCase(); // I <3 HEX
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
    .setName("tignore")
    .setDescription("Ignore the current ticket (logs + closes the channel)"),
  
  async execute(interaction) {
    // Only works in servers, not DMs
    if (!interaction.inGuild()) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a server.",
      });
    }

    // Extract the ticket ID from the channel name (e.g., "12ab34cd-support")
    const channel = interaction.channel;
    const ticketId = parseTicketIdFromChannel(channel);
    
    if (!ticketId) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a ticket channel.",
      });
    }

    // Make sure the ticket actually exists in the database
    const record = await getTicketRecord(interaction.guildId, ticketId);
    if (!record) {
      return replyPrivate(interaction, {
        content: `Ticket \`${ticketId.toUpperCase()}\` wasn't found (already closed?).`,
      });
    }

    // Check if the user has permission to ignore tickets
    const permsCfg = await getTicketPermissionsConfig(interaction.guildId);
    if (!isTicketModerator(interaction, permsCfg)) {
      return replyPrivate(interaction, {
        content: "You don't have permission to ignore tickets.",
      });
    }

    // Defer the response since closing might take a moment
    await deferPrivate(interaction);

    // Close the ticket with "ignored" status and log it
    const res = await closeTicket({
      client: interaction.client,
      guildId: interaction.guildId,
      ticketId,
      action: "ignored", // Mark as ignored rather than resolved/denied
      moderatorUserId: interaction.user.id,
      reason: null, // No reason needed for ignores
    });

    // Handle errors - usually missing logs channel or permissions
    if (!res.ok) {
      if (res.code === "NO_LOGS_CHANNEL") {
        return replyPrivate(interaction, {
          content: "Ticket logs channel is not set. Use /tlogs to set one first.",
        });
      }
      return replyPrivate(interaction, {
        content: "I couldn't close that ticket (missing config or permissions).",
      });
    }

    // Confirm the action before deleting the channel
    await replyPrivate(interaction, {
      content: `Ignored ticket \`${displayTicketId(ticketId)}\` and logged it. Closing channel…`,
    });

    // Delete the ticket channel
    await safeDeleteChannel(interaction.client, interaction.channelId);
    
    return null;
  },
};

// Normally this would ignore and log tickets with ID. (I <3 HEX)
//hehe actually comented neow