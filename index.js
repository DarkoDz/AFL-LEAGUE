require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} = require('discord.js');

const PREFIX = '.';
const DATA_PATH = path.join(__dirname, 'data', 'league.json');

function ensureDataFile() {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) {
    const initial = {
      settings: {
        transferMarketEnabled: false,
        maxPlayersPerTeam: 25,
      },
      teams: {},
      signups: [],
      offers: [],
      stats: {},
      trades: [],
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}

function uniquePush(arr, value) {
  if (!arr.includes(value)) arr.push(value);
}

function mentionToId(raw) {
  if (!raw) return null;
  const m = raw.match(/^<@!?(\d+)>$/);
  return m ? m[1] : null;
}

function roleMentionToId(raw) {
  if (!raw) return null;
  const m = raw.match(/^<@&(\d+)>$/);
  return m ? m[1] : null;
}

function parseIntStrict(val) {
  if (!/^[-+]?\d+$/.test(val ?? '')) return null;
  return Number.parseInt(val, 10);
}

function canManageLeague(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

function getTeamByLeader(db, leaderId) {
  return Object.values(db.teams).find((team) => team.leaders.includes(leaderId)) || null;
}

function buildTeamsText(db) {
  const teams = Object.values(db.teams);
  if (!teams.length) return 'No teams configured yet.';
  return teams
    .map((t) => `${t.emoji || '🏳️'} **${t.name}** | role: <@&${t.roleId}> | leaders: ${t.leaders.map((id) => `<@${id}>`).join(', ') || 'not set'}`)
    .join('\n');
}

function findStatTargetKey(key) {
  const valid = {
    goals: 'goals',
    goal: 'goals',
    assists: 'assists',
    assist: 'assists',
    cleansheets: 'cleanSheets',
    clean: 'cleanSheets',
    cleansheet: 'cleanSheets',
    games: 'games',
    game: 'games',
  };
  return valid[key.toLowerCase()] || null;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once('clientReady', () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const parts = message.content.trim().slice(PREFIX.length).split(/\s+/);
  const command = (parts.shift() || '').toLowerCase();

  const db = readDb();

  try {
    if (command === 'sign') {
      uniquePush(db.signups, message.author.id);
      writeDb(db);
      await message.reply('✅ You are now signed up in the transfer list.');
      return;
    }

    if (command === 'offer') {
      if (!db.settings.transferMarketEnabled) {
        await message.reply('❌ Transfer market is disabled. Use `.enable transfer market` first.');
        return;
      }

      const playerId = mentionToId(parts[0]);
      const teamRoleId = roleMentionToId(parts[1]);
      if (!playerId || !teamRoleId) {
        await message.reply('Usage: `.offer @player @teamRole`');
        return;
      }

      db.offers.push({
        id: `offer-${Date.now()}`,
        by: message.author.id,
        playerId,
        teamRoleId,
        createdAt: new Date().toISOString(),
      });
      writeDb(db);
      await message.reply(`✅ Offer created for <@${playerId}> to join <@&${teamRoleId}>.`);
      return;
    }

    if (command === 'release') {
      const playerId = mentionToId(parts[0]);
      if (!playerId) {
        await message.reply('Usage: `.release @player`');
        return;
      }

      const yourTeam = getTeamByLeader(db, message.author.id);
      if (!yourTeam && !canManageLeague(message.member)) {
        await message.reply('❌ Only team leaders/admins can release players.');
        return;
      }

      const member = await message.guild.members.fetch(playerId);
      const targetRole = yourTeam ? yourTeam.roleId : Object.keys(db.teams).find((id) => member.roles.cache.has(id));
      if (!targetRole || !member.roles.cache.has(targetRole)) {
        await message.reply('❌ Player is not in your team.');
        return;
      }

      await member.roles.remove(targetRole);
      await message.reply(`✅ Released <@${playerId}> from <@&${targetRole}>.`);
      return;
    }

    if (command === 'add' && parts[0]?.toLowerCase() === 'team') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can add teams.');
        return;
      }

      const roleId = roleMentionToId(parts[1]);
      const name = parts[2];
      const emoji = parts[3] || '🏳️';
      const leaders = parts.slice(4).map(mentionToId).filter(Boolean);

      if (!roleId || !name) {
        await message.reply('Usage: `.add team @role TeamName 😀 @leader1 @leader2`');
        return;
      }

      db.teams[roleId] = {
        roleId,
        name,
        emoji,
        leaders,
      };
      writeDb(db);
      await message.reply(`✅ Team added: ${emoji} **${name}** with role <@&${roleId}>.`);
      return;
    }

    if (command === 'edit' && parts[0]?.toLowerCase() === 'team') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can edit teams.');
        return;
      }

      const roleId = roleMentionToId(parts[1]);
      const team = roleId ? db.teams[roleId] : null;
      if (!team) {
        await message.reply('❌ Team not found.');
        return;
      }

      if (parts[2]) team.name = parts[2];
      if (parts[3]) team.emoji = parts[3];
      const leaders = parts.slice(4).map(mentionToId).filter(Boolean);
      if (leaders.length) team.leaders = leaders;

      writeDb(db);
      await message.reply(`✅ Team updated: ${team.emoji} **${team.name}**.`);
      return;
    }

    if (command === 'trade') {
      if (parts[0]?.toLowerCase() === 'accept') {
        const tradeId = parts[1];
        const trade = db.trades.find((t) => t.id === tradeId && t.status === 'pending');
        if (!trade) {
          await message.reply('❌ Pending trade not found.');
          return;
        }

        const fromTeam = db.teams[trade.fromRoleId];
        const toTeam = db.teams[trade.toRoleId];
        const isFromLeader = fromTeam?.leaders.includes(message.author.id);
        const isToLeader = toTeam?.leaders.includes(message.author.id);

        if (!isFromLeader && !isToLeader && !canManageLeague(message.member)) {
          await message.reply('❌ You are not allowed to accept this trade.');
          return;
        }

        uniquePush(trade.approvals, message.author.id);

        const fromApproved = trade.approvals.some((id) => fromTeam.leaders.includes(id));
        const toApproved = trade.approvals.some((id) => toTeam.leaders.includes(id));

        if (fromApproved && toApproved) {
          const member = await message.guild.members.fetch(trade.playerId);
          const toRole = message.guild.roles.cache.get(trade.toRoleId);
          if (toRole && toRole.members.size >= db.settings.maxPlayersPerTeam) {
            await message.reply(`❌ Trade blocked. Target team already reached max players (${db.settings.maxPlayersPerTeam}).`);
            return;
          }
          await member.roles.remove(trade.fromRoleId);
          await member.roles.add(trade.toRoleId);
          trade.status = 'completed';
          trade.completedAt = new Date().toISOString();
          writeDb(db);
          await message.reply(`✅ Trade completed: <@${trade.playerId}> moved to <@&${trade.toRoleId}>.`);
          return;
        }

        writeDb(db);
        await message.reply(`✅ Acceptance saved. Waiting for both sides. Trade ID: \`${trade.id}\``);
        return;
      }

      const playerId = mentionToId(parts[0]);
      const fromRoleId = roleMentionToId(parts[1]);
      const toRoleId = roleMentionToId(parts[2]);

      if (!playerId || !fromRoleId || !toRoleId) {
        await message.reply('Usage: `.trade @player @fromTeamRole @toTeamRole` then `.trade accept <id>` by both leaders.');
        return;
      }

      const fromTeam = db.teams[fromRoleId];
      const toTeam = db.teams[toRoleId];
      if (!fromTeam || !toTeam) {
        await message.reply('❌ Both teams must be configured first.');
        return;
      }

      const isAllowed = fromTeam.leaders.includes(message.author.id)
        || toTeam.leaders.includes(message.author.id)
        || canManageLeague(message.member);
      if (!isAllowed) {
        await message.reply('❌ Only team leaders/admins can create trades.');
        return;
      }

      const tradeId = `trade-${Date.now()}`;
      db.trades.push({
        id: tradeId,
        playerId,
        fromRoleId,
        toRoleId,
        status: 'pending',
        approvals: [message.author.id],
        createdAt: new Date().toISOString(),
      });
      writeDb(db);
      await message.reply(`📝 Trade request created with ID \`${tradeId}\`. A leader from each team must run: ".trade accept ${tradeId}"`);
      return;
    }

    if (command === 'enable' && parts.join(' ').toLowerCase() === 'transfer market') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can enable transfer market.');
        return;
      }
      db.settings.transferMarketEnabled = true;
      writeDb(db);
      await message.reply('✅ Transfer market enabled.');
      return;
    }

    if (command === 'disable' && parts.join(' ').toLowerCase() === 'transfer market') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can disable transfer market.');
        return;
      }
      db.settings.transferMarketEnabled = false;
      writeDb(db);
      await message.reply('✅ Transfer market disabled.');
      return;
    }

    if (command === 'max' && parts[0]?.toLowerCase() === 'players') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can change max players.');
        return;
      }

      const number = parseIntStrict(parts[1]);
      if (number === null || number <= 0) {
        await message.reply('Usage: `.max players 25`');
        return;
      }

      db.settings.maxPlayersPerTeam = number;
      writeDb(db);
      await message.reply(`✅ Max players per team set to ${number}.`);
      return;
    }

    if (command === 'show' && parts[0]?.toLowerCase() === 'teams') {
      if (parts[1]?.toLowerCase() === 'members') {
        const lines = [];
        for (const team of Object.values(db.teams)) {
          const role = message.guild.roles.cache.get(team.roleId);
          if (!role) continue;
          const members = role.members.map((m) => `<@${m.id}>`).join(', ') || 'No members';
          lines.push(`${team.emoji || '🏳️'} **${team.name}**: ${members}`);
        }
        await message.reply(lines.length ? lines.join('\n') : 'No teams found.');
        return;
      }

      await message.reply(buildTeamsText(db));
      return;
    }

    if (command === 'add' && parts[0]?.toLowerCase() === 'stats') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can add stats.');
        return;
      }
      const playerId = mentionToId(parts[1]);
      const statKey = findStatTargetKey(parts[2] || '');
      const value = parseIntStrict(parts[3]);
      if (!playerId || !statKey || value === null) {
        await message.reply('Usage: `.add stats @player goals 1`');
        return;
      }

      if (!db.stats[playerId]) db.stats[playerId] = { goals: 0, assists: 0, cleanSheets: 0, games: 0 };
      db.stats[playerId][statKey] += value;
      writeDb(db);
      await message.reply(`✅ Added ${value} ${statKey} to <@${playerId}>.`);
      return;
    }

    if (command === 'edit' && parts[0]?.toLowerCase() === 'stats') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can edit stats.');
        return;
      }
      const playerId = mentionToId(parts[1]);
      const statKey = findStatTargetKey(parts[2] || '');
      const value = parseIntStrict(parts[3]);
      if (!playerId || !statKey || value === null) {
        await message.reply('Usage: `.edit stats @player goals 10`');
        return;
      }

      if (!db.stats[playerId]) db.stats[playerId] = { goals: 0, assists: 0, cleanSheets: 0, games: 0 };
      db.stats[playerId][statKey] = value;
      writeDb(db);
      await message.reply(`✅ Updated ${statKey} for <@${playerId}> to ${value}.`);
      return;
    }

    if (command === 'remove' && parts[0]?.toLowerCase() === 'player' && parts[1]?.toLowerCase() === 'stats') {
      if (!canManageLeague(message.member)) {
        await message.reply('❌ Only admins can remove stats.');
        return;
      }
      const playerId = mentionToId(parts[2]);
      if (!playerId) {
        await message.reply('Usage: `.remove player stats @player`');
        return;
      }

      delete db.stats[playerId];
      writeDb(db);
      await message.reply(`✅ Removed all stats for <@${playerId}>.`);
      return;
    }

    await message.reply('❓ Unknown command.');
  } catch (error) {
    console.error(error);
    await message.reply('❌ Something went wrong while processing the command.');
  }
});

ensureDataFile();

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env file');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
