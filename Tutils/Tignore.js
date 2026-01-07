const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { deferPrivate, replyPrivate } = require("../utils/respond");
const { closeTicket, displayTicketId, safeDeleteChannel } = require("../tickets/ticketWorkflow");
const {
  getTicketPermissionsConfig,
  getTicketRecord,
} = require("../storage/guildConfigStore");

function parseTicketIdFromChannel(channel) {
  const name = channel?.name ? String(channel.name) : "";
  const m = name.match(/^([0-9a-fA-F]{8})-/);
  if (!m) return null;
  return m[1].toLowerCase();
}

function isTicketModerator(interaction, permsCfg) {
  const memberPerms = interaction.memberPermissions;
  const isManageServer = Boolean(
    memberPerms && memberPerms.has(PermissionFlagsBits.ManageGuild)
  );

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
    if (!interaction.inGuild()) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a server.",
      });
    }

    const channel = interaction.channel;
    const ticketId = parseTicketIdFromChannel(channel);
    if (!ticketId) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a ticket channel.",
      });
    }

    const record = await getTicketRecord(interaction.guildId, ticketId);
    if (!record) {
      return replyPrivate(interaction, {
        content: `Ticket \`${ticketId.toUpperCase()}\` wasn’t found (already closed?).`,
      });
    }

    const permsCfg = await getTicketPermissionsConfig(interaction.guildId);
    if (!isTicketModerator(interaction, permsCfg)) {
      return replyPrivate(interaction, {
        content: "You don’t have permission to ignore tickets.",
      });
    }

    await deferPrivate(interaction);

    const res = await closeTicket({
      client: interaction.client,
      guildId: interaction.guildId,
      ticketId,
      action: "ignored",
      moderatorUserId: interaction.user.id,
      reason: null,
    });

    if (!res.ok) {
      if (res.code === "NO_LOGS_CHANNEL") {
        return replyPrivate(interaction, {
          content: "Ticket logs channel is not set. Use /tlogs to set one first.",
        });
      }

      return replyPrivate(interaction, {
        content: "I couldn’t close that ticket (missing config or permissions).",
      });
    }

    await replyPrivate(interaction, {
      content: `Ignored ticket \`${displayTicketId(ticketId)}\` and logged it. Closing channel…`,
    });

    await safeDeleteChannel(interaction.client, interaction.channelId);
    return null;
  },
};
//normally this would ignore and log tickets with ID. (I <3 HEX)