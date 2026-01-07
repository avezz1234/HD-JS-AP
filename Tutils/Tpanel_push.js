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
    // Only works in servers, not DMs
    if (!interaction.inGuild()) {
      return replyPrivate(interaction, {
        content: "This command can only be used inside a server.",
      });
    }

    // Check if user has Manage Server permission
    const memberPerms = interaction.memberPermissions;
    if (memberPerms && !memberPerms.has(PermissionFlagsBits.ManageGuild)) {
      return replyPrivate(interaction, {
        content: "You need **Manage Server** to use this command.",
      });
    }

    // Make sure we're in a text-based channel (not voice, etc.)
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased()) {
      return replyPrivate(interaction, {
        content: "I can't post the ticket panel in this channel type.",
      });
    }

    // Get the bot's member object to check its permissions
    const me =
      interaction.guild.members.me ||
      interaction.guild.members.cache.get(interaction.client.user.id) ||
      null;

    // Get bot's permissions in this specific channel
    const botPerms =
      (me && typeof channel.permissionsFor === "function"
        ? channel.permissionsFor(me)
        : null) ||
      interaction.appPermissions ||
      null;

    // Check if we're in a thread (different permission needed)
    const isThread = typeof channel.isThread === "function" && channel.isThread();
    const sendPerm = isThread
      ? PermissionFlagsBits.SendMessagesInThreads
      : PermissionFlagsBits.SendMessages;

    // Verify the bot has all required permissions to post the panel
    if (
      botPerms &&
      !botPerms.has([
        PermissionFlagsBits.ViewChannel,
        sendPerm,
        PermissionFlagsBits.EmbedLinks,
      ])
    ) {
      // Build a list of missing permissions to tell the user
      const missing = [];
      if (!botPerms.has(PermissionFlagsBits.ViewChannel)) missing.push("View Channel");
      if (!botPerms.has(sendPerm)) {
        missing.push(isThread ? "Send Messages in Threads" : "Send Messages");
      }
      if (!botPerms.has(PermissionFlagsBits.EmbedLinks)) missing.push("Embed Links");

      return replyPrivate(interaction, {
        content: `I can't post the ticket panel here — I'm missing ${missing
          .map((p) => `**${p}**`)
          .join(" + ")} in this channel.`,
      });
    }

    // Defer since we're about to do some async work
    await deferPrivate(interaction);
    await replyPrivate(interaction, { content: "Posting ticket panel…" });

    // Fetch the configured ticket panel from the database
    const panel = await getTicketPanelConfig(interaction.guildId);
    const buttons = panel.buttons ?? [];

    // Make sure there are actually buttons configured
    // (this one is even more botched without the setup wizard lol)
    if (!buttons.length) {
      return replyPrivate(interaction, {
        content: "No ticket buttons are configured yet.",
      });
    }

    try {
      // Send the ticket panel with embed and buttons
      await channel.send({
        embeds: [buildTicketPanelEmbed(panel)],
        components: buildTicketPanelComponents(buttons),
        allowedMentions: { parse: [] }, // Prevent @everyone/@here pings
      });

      return replyPrivate(interaction, { content: "Ticket panel posted." });
    } catch (err) {
      // Log the error and tell the user something went wrong
      console.error("Failed to post ticket panel", err);

      return replyPrivate(interaction, {
        content:
          "I couldn't post the ticket panel here (likely missing permissions). Make sure I can **View Channel**, **Send Messages** (or **Send Messages in Threads**), and **Embed Links** in this channel.",
      });
    }
  },
};

// this one is even more botched without the setup wizard lol