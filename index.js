require("dotenv").config();
const fs = require("fs");
const os = require("os");
const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, SlashCommandBuilder } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const ENTRY_CHANNEL_ID = process.env.ENTRY_CHANNEL_ID;
const SAVE_FILE = "./gacha.json";
let gachaItems = [];

if (fs.existsSync(SAVE_FILE)) gachaItems = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
function saveGacha() { fs.writeFileSync(SAVE_FILE, JSON.stringify(gachaItems, null, 2), "utf8"); }

const commands = [
  new SlashCommandBuilder().setName("gacha").setDescription("ガチャを回す"),
  new SlashCommandBuilder().setName("del").setDescription("メッセージ削除").addIntegerOption(opt => opt.setName("amount").setDescription("削除する件数").setRequired(true)),
  new SlashCommandBuilder().setName("kick").setDescription("ユーザーをキック").addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true)),
  new SlashCommandBuilder().setName("ban").setDescription("ユーザーをBAN").addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true)),
  new SlashCommandBuilder().setName("tempban").setDescription("一時BAN").addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true)).addIntegerOption(opt => opt.setName("seconds").setDescription("秒数").setRequired(true)),
  new SlashCommandBuilder().setName("softban").setDescription("ソフトBAN").addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true)),
  new SlashCommandBuilder().setName("timeout").setDescription("タイムアウト").addUserOption(opt => opt.setName("target").setDescription("対象ユーザー").setRequired(true)).addIntegerOption(opt => opt.setName("seconds").setDescription("秒数").setRequired(true)),
  new SlashCommandBuilder().setName("status").setDescription("CPU/メモリ/Bot ping確認"),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

client.once("ready", async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
  } catch (err) { console.error(err); }
});

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id === ENTRY_CHANNEL_ID && !msg.content.startsWith("!")) {
    gachaItems.push(msg.content);
    saveGacha();
    msg.react("✅");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const member = interaction.options.getMember("target");
  const seconds = interaction.options.getInteger("seconds");

  if ([ "gacha" ].includes(commandName) && interaction.channel.id !== ENTRY_CHANNEL_ID) {
    return interaction.reply({ content: "このチャンネルでは使えないよ！", ephemeral: true });
  }

  switch (commandName) {
    case "gacha":
      if (gachaItems.length === 0) return interaction.reply("まだガチャの中身がないよ！");
      return interaction.reply(`🎉 ガチャ結果: **${gachaItems[Math.floor(Math.random() * gachaItems.length)]}**`);
    case "del":
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: "権限がないよ！", ephemeral: true });
      const amount = interaction.options.getInteger("amount");
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      await interaction.channel.bulkDelete(messages, true);
      return interaction.reply({ content: `🗑️ ${amount} 件削除したよ！`, ephemeral: true });
    case "kick":
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply("権限がないよ！");
      await member.kick("Kick by Bot");
      return interaction.reply(`${member.user.tag} をキックしたよ`);
    case "ban":
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply("権限がないよ！");
      await member.ban({ reason: "Ban by Bot" });
      return interaction.reply(`${member.user.tag} をBANしたよ`);
    case "tempban":
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply("権限がないよ！");
      await member.ban({ reason: "Tempban" });
      setTimeout(async () => await interaction.guild.members.unban(member.id, "Tempban解除"), seconds * 1000);
      return interaction.reply(`${member.user.tag} を ${seconds} 秒の一時BANしたよ`);
    case "softban":
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply("権限がないよ！");
      await member.ban({ reason: "Softban", deleteMessageDays: 7 });
      await interaction.guild.members.unban(member.id, "Softban解除");
      return interaction.reply(`${member.user.tag} をソフトBANしたよ`);
    case "timeout":
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply("権限がないよ！");
      await member.timeout(seconds * 1000, "Timeout by Bot");
      return interaction.reply(`${member.user.tag} を ${seconds} 秒タイムアウトしたよ`);
    case "status":
      const cpuLoad = (os.loadavg()[0] / os.cpus().length * 100).toFixed(2);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
      const usedMem = totalMem - freeMem;
      const memPercent = ((usedMem / totalMem) * 100).toFixed(2);
      const botPing = client.ws.ping;
      return interaction.reply(`🖥 CPU負荷: ${cpuLoad}%\n💾 メモリ: ${usedMem}MB / ${totalMem}MB (${memPercent}%)\n🏓 Bot Ping: ${botPing}ms`);
    default: return;
  }
});

client.login(process.env.DISCORD_TOKEN);
