const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");

const { deferPrivate, replyPrivate } = require("../utils/respond");
const { getTicketPanelConfig } = require("../storage/guildConfigStore");
const {
  buildTicketPanelComponents,
  buildTicketPanelEmbed,
} = require("../tickets/panelView");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tpanel_push")
    .setDescription("Post the current ticket panel"),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a server.",
      });
    }

    const memberPerms = interaction.memberPermissions;
    if (memberPerms && !memberPerms.has(PermissionFlagsBits.ManageGuild)) {
      return replyPrivate(interaction, {
        content: "You need **Manage Server** to use this command.",
      });
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return replyPrivate(interaction, {
        content: "I can’t post the ticket panel in this channel type.",
      });
    }

    const me =
      interaction.guild.members.me ||
      interaction.guild.members.cache.get(interaction.client.user.id) ||
      null;

    const botPerms =
      (me && typeof channel.permissionsFor === "function"
        ? channel.permissionsFor(me)
        : null) ||
      interaction.appPermissions ||
      null;

    const isThread = typeof channel.isThread === "function" && channel.isThread();
    const sendPerm = isThread
      ? PermissionFlagsBits.SendMessagesInThreads
      : PermissionFlagsBits.SendMessages;

    if (
      botPerms &&
      !botPerms.has([
        PermissionFlagsBits.ViewChannel,
        sendPerm,
        PermissionFlagsBits.EmbedLinks,
      ])
    ) {
      const missing = [];
      if (!botPerms.has(PermissionFlagsBits.ViewChannel)) missing.push("View Channel");
      if (!botPerms.has(sendPerm)) {
        missing.push(isThread ? "Send Messages in Threads" : "Send Messages");
      }
      if (!botPerms.has(PermissionFlagsBits.EmbedLinks)) missing.push("Embed Links");

      return replyPrivate(interaction, {
        content: `I can’t post the ticket panel here — I’m missing ${missing
          .map((p) => `**${p}**`)
          .join(" + ")} in this channel.`,
      });
    }

    await deferPrivate(interaction);
    await replyPrivate(interaction, { content: "Posting ticket panel…" });

    const panel = await getTicketPanelConfig(interaction.guildId);
    const buttons = panel.buttons ?? [];

    if (!buttons.length) {
      return replyPrivate(interaction, {
        content: "No ticket buttons are configured yet.",
      });
    }

    try {
      await channel.send({
        embeds: [buildTicketPanelEmbed(panel)],
        components: buildTicketPanelComponents(buttons),
        allowedMentions: { parse: [] },
      });

      return replyPrivate(interaction, { content: "Ticket panel posted." });
    } catch (err) {
      console.error("Failed to post ticket panel", err);

      return replyPrivate(interaction, {
        content:
          "I couldn’t post the ticket panel here (likely missing permissions). Make sure I can **View Channel**, **Send Messages** (or **Send Messages in Threads**), and **Embed Links** in this channel.",
      });
    }
  },
};
// this one is even more botched without the setup wizard lol