require("dotenv").config();
const fs = require("fs");
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require("discord.js");
const os = require("os");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const ENTRY_CHANNEL_ID = process.env.ENTRY_CHANNEL_ID;
const GACHA_CHANNEL_ID = process.env.GACHA_CHANNEL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

let gachaItems = [];

const loadGacha = () => {
  if (fs.existsSync("gacha.json")) {
    gachaItems = JSON.parse(fs.readFileSync("gacha.json", "utf-8"));
  }
};

const saveGacha = () => {
  fs.writeFileSync("gacha.json", JSON.stringify(gachaItems, null, 2));
};

loadGacha();

const commands = [
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('ユーザーをキック')
    .addUserOption(option =>
      option.setName('user').setDescription('キックするユーザー').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('ユーザーをBAN')
    .addUserOption(option =>
      option.setName('user').setDescription('BANするユーザー').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('softban')
    .setDescription('ソフトBAN')
    .addUserOption(option =>
      option.setName('user').setDescription('対象ユーザー').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('一時BAN')
    .addUserOption(option =>
      option.setName('user').setDescription('対象ユーザー').setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('time').setDescription('分単位').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('タイムアウト')
    .addUserOption(option =>
      option.setName('user').setDescription('対象ユーザー').setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('time').setDescription('秒単位').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('del')
    .setDescription('ユーザーのメッセージを削除')
    .addUserOption(option =>
      option.setName('user').setDescription('対象ユーザー').setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('count').setDescription('削除件数（任意）').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Botの状態確認')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
  try {
    console.log('グローバルスラッシュコマンドを登録中...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('登録完了！');
  } catch (err) {
    console.error(err);
  }
})();

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== ENTRY_CHANNEL_ID) return;
  if (gachaItems.find(u => u.userId === msg.author.id)) return;

  gachaItems.push({
    userId: msg.author.id,
    tag: `${msg.author.username}#${msg.author.discriminator}`,
    avatar: msg.author.displayAvatarURL(),
    messageId: msg.id,
    content: msg.content,
    rarity: "未設定",
  });
  saveGacha();
});

client.on("messageCreate", (msg) => {
  if (msg.author.bot) return;
  if (msg.channel.id !== GACHA_CHANNEL_ID) return;
  if (!msg.content.includes("メンバーガチャ")) return;

  if (gachaItems.length === 0)
    return msg.channel.send("まだ参加者がいません！");

  const winner = gachaItems[Math.floor(Math.random() * gachaItems.length)];

  msg.channel.send({
    content: `メンバーガチャ結果:\n**${winner.tag}** (ID: ${winner.userId})\nメッセージ: ${winner.content}\nレア度: ${winner.rarity}`,
    files: [winner.avatar],
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member } = interaction;
  const target = options.getUser("user");

  const perms = {
    del: "ManageMessages",
    kick: "KickMembers",
    ban: "BanMembers",
    softban: "BanMembers",
    tempban: "BanMembers",
    timeout: "ModerateMembers",
  };

  if (commandName in perms) {
    if (!member.permissions.has(perms[commandName]))
      return interaction.reply({ content: "権限がありません", ephemeral: true });
  }

  switch (commandName) {
    case "kick":
      await interaction.guild.members.kick(target.id);
      return interaction.reply(`${target.tag} をkickしました`);
    case "ban":
      await interaction.guild.members.ban(target.id);
      return interaction.reply(`${target.tag} をBANしました`);
    case "tempban":
      const time = options.getInteger("time");
      await interaction.guild.members.ban(target.id);
      setTimeout(async () => { await interaction.guild.members.unban(target.id); }, time * 60 * 1000);
      return interaction.reply(`${target.tag} を${time}分BANしました`);
    case "softban":
      await interaction.guild.members.ban(target.id, { deleteMessageDays: 1 });
      await interaction.guild.members.unban(target.id);
      return interaction.reply(`${target.tag} をsoftBANしました`);
    case "timeout":
      const ttime = options.getInteger("time");
      await interaction.guild.members.timeout(target.id, ttime * 1000);
      return interaction.reply(`${target.tag} を${ttime}秒タイムアウトしました`);
    case "del":
      const delUser = options.getUser("user");
      const count = options.getInteger("count") || 10;
      const delChannel = interaction.channel;

      const messages = await delChannel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter(m => m.author.id === delUser.id).first(count);

      for (const msg of toDelete) { await msg.delete().catch(() => {}); }
      return interaction.reply(`指定ユーザーの最新 ${toDelete.length} 件のメッセージを削除しました`);
    case "status":
      const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
      const cpu = os.loadavg()[0].toFixed(2);
      const ping = client.ws.ping;
      return interaction.reply(`CPU Load: ${cpu}\nメモリ使用量: ${mem}MB\nPing: ${ping}ms`);
  }
});

client.login(process.env.TOKEN);
