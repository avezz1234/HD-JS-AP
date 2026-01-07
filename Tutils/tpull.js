const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { deferPrivate, replyPrivate } = require("../utils/respond");
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
    .setName("tpull")
    .setDescription("Pull a user into the current ticket channel")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("User to add to this ticket")
        .setRequired(true)
    ),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a server.",
      });
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return replyPrivate(interaction, {
        content: "This command must be used in a server text channel.",
      });
    }

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
        content: "You don’t have permission to pull users into tickets.",
      });
    }

    await deferPrivate(interaction);

    const user = interaction.options.getUser("user", true);

    try {
      await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      return replyPrivate(interaction, {
        content: `Pulled <@${user.id}> into ticket \`${ticketId.toUpperCase()}\`.`,
      });
    } catch (err) {
      console.error("Failed to tpull user into ticket", err);
      return replyPrivate(interaction, {
        content: "I couldn’t update permissions for that user (missing permissions?).",
      });
    }
  },
};
// very reliant on a LOT of other code lel