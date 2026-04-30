require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const UserManager = require('./userManager');
const GameManager = require('./gameManager');
const EconomyManager = require('./economyManager');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not set. Create a .env file (see .env.example)');
  process.exit(1);
}

// 🔗 Replace this with the real Telegram channel URL.
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/your_channel';

// Telegram user IDs that have access to the in-bot admin panel.
const ADMIN_IDS = new Set([386567097, 386567098]);

function isAdmin(userId) {
  return ADMIN_IDS.has(userId);
}

const bot = new Telegraf(BOT_TOKEN);
const userManager = new UserManager();
const gameManager = new GameManager(userManager, bot);
const economyManager = new EconomyManager(userManager);

// --- State for flows ---
// depositState: userId -> { step: 'amount', pendingId }
const depositState = new Map();
// withdrawState: userId -> { step: 'address'|'amount', address? }
const withdrawState = new Map();
// createTableState: userId -> { step: 'custom_bet'|'custom_tickets', bet?, maxPlayers?, isPrivate? }
const createTableState = new Map();
// adminState: userId -> { step: string, ...payload }
const adminState = new Map();

// --- Main menu keyboard ---

function buildMainKeyboard(userId) {
  const rows = [
    ['🎮 Create table', '📋 Public tables'],
    ['💰 Balance', '👥 Referrals'],
    ['📥 Deposit', '📤 Withdraw'],
    ['📖 Instruction'],
  ];
  if (isAdmin(userId)) {
    rows.push(['🛠 Admin']);
  }
  return Markup.keyboard(rows).resize();
}

// --- Helpers ---

function getName(ctx) {
  return ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
}

function getBotUsername() {
  return bot.botInfo ? bot.botInfo.username : 'bot';
}

function tableCreateBetKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('$1', 'ctb_1'), Markup.button.callback('$5', 'ctb_5')],
    [Markup.button.callback('$10', 'ctb_10'), Markup.button.callback('💵 Other amount', 'ctb_custom')],
  ]);
}

function tableCreatePlayersKeyboard(bet) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('2', `ctp_${bet}_2`),
      Markup.button.callback('3', `ctp_${bet}_3`),
      Markup.button.callback('4', `ctp_${bet}_4`),
    ],
    [
      Markup.button.callback('5', `ctp_${bet}_5`),
      Markup.button.callback('6', `ctp_${bet}_6`),
    ],
  ]);
}

function tableCreateTypeKeyboard(bet, maxPlayers) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🌐 Public', `ctt_${bet}_${maxPlayers}_pub`)],
    [Markup.button.callback('🔒 Private', `ctt_${bet}_${maxPlayers}_prv`)],
  ]);
}

function tableJoinErrorText(reason, needed) {
  const map = {
    in_game: '⚠️ You are already at another table.',
    table_not_found: '❌ Table not found.',
    table_unavailable: '❌ This table is no longer available.',
    table_full: '❌ The table is already full.',
    private_only: '❌ This is a private table. Join only via invite link.',
    invalid_tickets: '❌ Ticket count must be a positive integer.',
    invalid_bet: '❌ Bet must be a positive integer.',
    already_in_table: '⚠️ You are already at this table.',
  };

  if (reason === 'no_funds') {
    return `❌ Insufficient funds. You need at least <b>$${needed}</b>.`;
  }

  return map[reason] || '❌ Failed to join the table.';
}

async function showPublicTables(ctx) {
  const tables = gameManager.listPublicTables();
  if (!tables.length) {
    return ctx.reply('📋 There are no public tables right now. Create a new one!');
  }

  const buttons = tables.map((t) => [
    Markup.button.callback(
      `#${t.id} | $${t.bet} | ${t.players}/${t.maxPlayers} players`,
      `jpb_${t.id}`
    ),
  ]);

  return ctx.reply('📋 <b>Public tables:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
  });
}

async function promptJoinPrivateByToken(ctx, token) {
  const table = gameManager.getTableByInviteToken(token);
  if (!table) {
    return ctx.reply('❌ Private table not found or already finished.');
  }

  if (table.status !== 'waiting') {
    return ctx.reply('❌ This table is no longer accepting players.');
  }

  await ctx.reply(
    `🔒 <b>Private table #${table.id}</b>\n` +
      `💵 Bet: <b>$${table.bet}</b>\n` +
      `👥 Players: <b>${table.players.length}/${table.maxPlayers}</b>\n\n` +
      'Enter the number of tickets you want to buy (positive integer):',
    { parse_mode: 'HTML' }
  );

  createTableState.set(ctx.from.id, {
    step: 'join_private_tickets',
    token,
  });
}

// --- Ban middleware ---

bot.use(async (ctx, next) => {
  const userId = ctx.from && ctx.from.id;
  if (!userId) return next();
  if (isAdmin(userId)) return next();
  if (userManager.isBanned(userId)) {
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery('🚫 You are banned.', { show_alert: true });
      } catch (_) {}
      return;
    }
    try {
      await ctx.reply('🚫 You are banned from using this bot.');
    } catch (_) {}
    return;
  }
  return next();
});

// --- /start with referral support ---

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const payload = ctx.startPayload || '';

  console.log(`User ${getName(ctx)} (${userId}) started the bot with payload: "${payload}"`);

  let referrerId = null;
  let inviteToken = null;

  if (payload.startsWith('ref_')) {
    const refId = parseInt(payload.slice(4), 10);
    if (!isNaN(refId) && refId !== userId) {
      referrerId = refId;
    }
  } else if (payload.startsWith('table_')) {
    inviteToken = payload.slice(6).toUpperCase();
  }

  const user = userManager.getOrCreate(userId, getName(ctx), referrerId);

  let text =
    `👋 Welcome to <b>Lottery Bot</b>!\n` +
    `💰 Balance: <b>$${user.balance}</b>\n\n` +
    `Pick an action from the menu below:`;

  if (referrerId && user.referredBy === referrerId) {
    const referrer = userManager.get(referrerId);
    if (referrer) {
      text += `\n\n✅ You signed up via referral from <b>${referrer.username}</b>`;
    }
  }

  await ctx.reply(text, { parse_mode: 'HTML', ...buildMainKeyboard(userId) });

  if (inviteToken) {
    if (gameManager.isInGame(userId)) {
      await ctx.reply('⚠️ You are already at another table and cannot join via link right now.');
      return;
    }
    await promptJoinPrivateByToken(ctx, inviteToken);
  }
});

// --- 📖 Instruction ---

bot.hears('📖 Instruction', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));

  const text =
    `📖 <b>How to play Lottery Bot</b>\n\n` +
    `🎮 <b>The game</b>\n` +
    `Lottery Bot is a multiplayer lottery where 2–6 players compete at one table. ` +
    `Every player buys one or more tickets. Each ticket is a random set of 5 numbers from 1 to 30.\n\n` +
    `🎯 <b>How a round works</b>\n` +
    `1. Create a table or join a public/private one.\n` +
    `2. Choose your bet, number of players and tickets.\n` +
    `3. When the table is full or the creator starts the game, ` +
    `numbers are drawn one by one every couple of seconds.\n` +
    `4. The first player whose ticket has all 5 numbers drawn wins the whole pot ` +
    `(minus a small 5% commission).\n\n` +
    `💰 <b>Bets &amp; tickets</b>\n` +
    `• Quick bet options: $1, $5, $10, or any custom whole-dollar amount.\n` +
    `• Tickets per player: any positive integer — choose what fits your budget.\n` +
    `• Cost = bet × tickets, deducted from your balance when joining.\n\n` +
    `🏆 <b>Prizes</b>\n` +
    `• Winner takes the pot minus 5% commission.\n` +
    `• If the deck is exhausted with no winner, all bets are refunded.\n\n` +
    `👥 <b>Referrals</b>\n` +
    `• Invite friends and earn $0.05 per successful deposit they make.\n\n` +
    `📰 Stay tuned to our channel for news and updates!`;

  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.url('📰 Follow the channel', CHANNEL_URL)],
    ]),
  });
});

// --- 🎮 Create table ---

bot.hears('🎮 Create table', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));

  if (gameManager.isInGame(ctx.from.id)) {
    return ctx.reply('⚠️ You are already at a table. Wait for the game to finish.');
  }

  // Clear any leftover create-table state
  createTableState.delete(ctx.from.id);

  return ctx.reply('🎮 Create a table\n\n1) Choose a bet:', tableCreateBetKeyboard());
});

bot.action('ctb_custom', async (ctx) => {
  await ctx.answerCbQuery();

  if (gameManager.isInGame(ctx.from.id)) {
    return ctx.reply('⚠️ You are already at a table.');
  }

  createTableState.set(ctx.from.id, { step: 'custom_bet' });

  try {
    await ctx.editMessageText(
      '💵 Enter your custom bet amount in whole dollars (positive integer, no cents):'
    );
  } catch (_) {
    await ctx.reply(
      '💵 Enter your custom bet amount in whole dollars (positive integer, no cents):'
    );
  }
});

bot.action(/^ctb_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const bet = parseInt(ctx.match[1], 10);

  try {
    await ctx.editMessageText(
      `🎮 Create a table\n\nBet: <b>$${bet}</b>\n\n2) Choose number of players (2–6):`,
      {
        parse_mode: 'HTML',
        ...tableCreatePlayersKeyboard(bet),
      }
    );
  } catch (_) {}
});

bot.action(/^ctp_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const bet = parseInt(ctx.match[1], 10);
  const maxPlayers = parseInt(ctx.match[2], 10);

  try {
    await ctx.editMessageText(
      `🎮 Create a table\n\nBet: <b>$${bet}</b>\nPlayers: <b>${maxPlayers}</b>\n\n3) Choose table type:`,
      {
        parse_mode: 'HTML',
        ...tableCreateTypeKeyboard(bet, maxPlayers),
      }
    );
  } catch (_) {}
});

bot.action(/^ctt_(\d+)_(\d+)_(pub|prv)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const bet = parseInt(ctx.match[1], 10);
  const maxPlayers = parseInt(ctx.match[2], 10);
  const mode = ctx.match[3];
  const isPrivate = mode === 'prv';
  const typeText = isPrivate ? '🔒 Private' : '🌐 Public';

  createTableState.set(ctx.from.id, {
    step: 'create_tickets',
    bet,
    maxPlayers,
    isPrivate,
  });

  try {
    await ctx.editMessageText(
      `🎮 Create a table\n\n` +
        `Bet: <b>$${bet}</b>\n` +
        `Players: <b>${maxPlayers}</b>\n` +
        `Type: <b>${typeText}</b>\n\n` +
        `4) Enter the number of tickets for yourself (positive integer):`,
      { parse_mode: 'HTML' }
    );
  } catch (_) {
    await ctx.reply(
      `4) Enter the number of tickets for yourself (positive integer):`
    );
  }
});

async function finalizeCreateTable(ctx, bet, maxPlayers, isPrivate, ticketCount) {
  const userId = ctx.from.id;
  const result = await gameManager.createTable(
    userId,
    getName(ctx),
    ctx.chat.id,
    bet,
    maxPlayers,
    isPrivate,
    ticketCount
  );

  if (!result.ok) {
    return ctx.reply(tableJoinErrorText(result.reason, result.needed), {
      parse_mode: 'HTML',
    });
  }

  if (isPrivate) {
    const link = `https://t.me/${getBotUsername()}?start=table_${result.inviteToken}`;
    return ctx.reply(
      `✅ Private table created: <b>#${result.table.id}</b>\n` +
        `💵 Bet: <b>$${bet}</b>\n` +
        `👥 Max players: <b>${maxPlayers}</b>\n\n` +
        `🔗 Invite link:\n🔴 <code>${link}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  return ctx.reply(
    `✅ Public table created: <b>#${result.table.id}</b>\n` +
      `💵 Bet: <b>$${bet}</b>\n` +
      `👥 Max players: <b>${maxPlayers}</b>\n\n` +
      'It is now listed in «📋 Public tables».',
    { parse_mode: 'HTML' }
  );
}

// --- 📋 Public tables ---

bot.hears('📋 Public tables', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));
  if (gameManager.isInGame(ctx.from.id)) {
    return ctx.reply('⚠️ You are already at a table.');
  }
  return showPublicTables(ctx);
});

bot.action(/^jpb_([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tableId = ctx.match[1];
  const table = gameManager.getTableById(tableId);
  if (!table || table.status !== 'waiting' || table.isPrivate) {
    return ctx.answerCbQuery('❌ Table unavailable', { show_alert: true });
  }

  createTableState.set(ctx.from.id, {
    step: 'join_public_tickets',
    tableId,
  });

  try {
    await ctx.editMessageText(
      `🎮 Table #${table.id}\n` +
        `💵 Bet: <b>$${table.bet}</b>\n` +
        `👥 Players: <b>${table.players.length}/${table.maxPlayers}</b>\n\n` +
        'Enter the number of tickets you want to buy (positive integer):',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Back to list', 'back_public')],
        ]),
      }
    );
  } catch (_) {}
});

bot.action('back_public', async (ctx) => {
  await ctx.answerCbQuery();
  createTableState.delete(ctx.from.id);
  try {
    await ctx.deleteMessage();
  } catch (_) {}
  return showPublicTables(ctx);
});

bot.action(/^start_table_([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tableId = ctx.match[1];
  const result = await gameManager.startTableByCreator(ctx.from.id, tableId);

  if (result.ok) {
    return;
  }

  const map = {
    table_not_found: '❌ Table not found.',
    not_creator: '❌ Only the creator can start the game.',
    not_enough_players: '❌ At least 2 players are required to start.',
    table_unavailable: '❌ The game is already running or the table is unavailable.',
  };

  return ctx.answerCbQuery(map[result.reason] || '❌ Failed to start the game', {
    show_alert: true,
  });
});

// --- 💰 Balance ---

bot.hears('💰 Balance', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));
  ctx.reply(
    `💰 <b>Balance</b>\n\n` +
      `🏷 Name: ${user.username}\n` +
      `💵 Balance: <b>$${user.balance}</b>\n` +
      `📊 Spent: <b>$${user.totalSpent}</b>\n` +
      `🎮 Games played: <b>${user.games}</b>\n` +
      `🏆 Wins: <b>${user.wins}</b>`,
    { parse_mode: 'HTML' }
  );
});

// --- 👥 Referrals ---

bot.hears('👥 Referrals', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));
  const link = userManager.getReferralLink(getBotUsername(), ctx.from.id);

  ctx.reply(
    `👥 <b>Referral program</b>\n\n` +
      `Invite friends and earn <b>$0.05</b> per successful deposit your referral makes.\n\n` +
      `👤 Referrals: <b>${user.referrals.length}</b>\n` +
      `💵 Earned: <b>$${user.referralEarnings}</b>\n\n` +
      `🔗 Your link:\n<code>${link}</code>`,
    { parse_mode: 'HTML' }
  );
});

// --- 📥 Deposit ---

bot.hears('📥 Deposit', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));
  const info = economyManager.getDepositInfo(ctx.from.id);

  ctx.reply(
    `📥 <b>Deposit</b>\n\n` +
      `💰 Current balance: <b>$${info.balance}</b>\n\n` +
      `Send funds to this address:\n` +
      `<code>${info.address}</code>\n\n` +
      `After paying, tap the button below and enter the deposit amount.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ I have paid', 'dep_paid')],
      ]),
    }
  );
});

bot.action('dep_paid', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  const pending = economyManager.createPendingDeposit(userId);
  if (!pending.ok) {
    return ctx.reply('❌ Failed to create deposit request.');
  }

  depositState.set(userId, {
    step: 'amount',
    pendingId: pending.pendingId,
  });

  return ctx.reply('💵 Enter the deposit amount (e.g. 5 or 12.5):');
});

// --- 📤 Withdraw ---

bot.hears('📤 Withdraw', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));

  if (user.balance <= 0) {
    return ctx.reply('❌ You have no funds to withdraw.');
  }

  withdrawState.set(ctx.from.id, { step: 'address' });
  ctx.reply(
    `📤 <b>Withdraw</b>\n\n` +
      `💰 Balance: <b>$${user.balance}</b>\n\n` +
      `Enter your wallet address for the withdrawal:`,
    { parse_mode: 'HTML' }
  );
});

// --- Text handler for create-table / deposit / withdraw flows ---

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Skip menu buttons
  const menuLabels = [
    '🎮 Create table',
    '📋 Public tables',
    '💰 Balance',
    '👥 Referrals',
    '📥 Deposit',
    '📤 Withdraw',
    '📖 Instruction',
    '🛠 Admin',
  ];
  if (menuLabels.includes(text)) return;

  // --- Admin state ---
  const adState = adminState.get(userId);
  if (adState && isAdmin(userId)) {
    if (await handleAdminText(ctx, adState, text)) return;
  }

  // --- Create table state ---
  const ctState = createTableState.get(userId);
  if (ctState) {
    if (ctState.step === 'custom_bet') {
      const bet = parseInt(text, 10);
      if (!Number.isInteger(bet) || bet <= 0 || String(bet) !== text) {
        return ctx.reply('❌ Please enter a positive whole number (no cents). Try again:');
      }
      createTableState.delete(userId);
      return ctx.reply(
        `🎮 Create a table\n\nBet: <b>$${bet}</b>\n\n2) Choose number of players (2–6):`,
        {
          parse_mode: 'HTML',
          ...tableCreatePlayersKeyboard(bet),
        }
      );
    }

    if (ctState.step === 'create_tickets') {
      const tickets = parseInt(text, 10);
      if (!Number.isInteger(tickets) || tickets <= 0 || String(tickets) !== text) {
        return ctx.reply('❌ Please enter a positive whole number of tickets. Try again:');
      }
      createTableState.delete(userId);
      return finalizeCreateTable(ctx, ctState.bet, ctState.maxPlayers, ctState.isPrivate, tickets);
    }

    if (ctState.step === 'join_public_tickets') {
      const tickets = parseInt(text, 10);
      if (!Number.isInteger(tickets) || tickets <= 0 || String(tickets) !== text) {
        return ctx.reply('❌ Please enter a positive whole number of tickets. Try again:');
      }
      createTableState.delete(userId);
      const result = await gameManager.joinPublicTable(
        userId,
        getName(ctx),
        ctx.chat.id,
        ctState.tableId,
        tickets
      );
      if (!result.ok) {
        return ctx.reply(tableJoinErrorText(result.reason, result.needed), {
          parse_mode: 'HTML',
        });
      }
      return;
    }

    if (ctState.step === 'join_private_tickets') {
      const tickets = parseInt(text, 10);
      if (!Number.isInteger(tickets) || tickets <= 0 || String(tickets) !== text) {
        return ctx.reply('❌ Please enter a positive whole number of tickets. Try again:');
      }
      createTableState.delete(userId);
      const result = await gameManager.joinPrivateByToken(
        userId,
        getName(ctx),
        ctx.chat.id,
        ctState.token,
        tickets
      );
      if (!result.ok) {
        return ctx.reply(tableJoinErrorText(result.reason, result.needed), {
          parse_mode: 'HTML',
        });
      }
      return;
    }
  }

  // --- Deposit state ---
  const dep = depositState.get(userId);
  if (dep && dep.step === 'amount') {
    const amount = parseFloat(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      return ctx.reply('❌ Please enter a valid deposit amount (number greater than 0).');
    }

    const result = economyManager.confirmDeposit(userId, dep.pendingId, amount);
    if (!result.ok) {
      if (result.reason === 'already_processed') {
        depositState.delete(userId);
        return ctx.reply('⚠️ This deposit has already been processed.');
      }
      if (result.reason === 'invalid_pending') {
        depositState.delete(userId);
        return ctx.reply('❌ Deposit session expired. Tap «📥 Deposit» again.');
      }
      return ctx.reply('❌ Failed to process the deposit. Check the amount and try again.');
    }

    depositState.delete(userId);
    let replyText =
      `✅ <b>Deposit credited</b>\n\n` +
      `💵 Amount: <b>$${result.amount}</b>\n` +
      `💰 New balance: <b>$${result.balance}</b>`;

    if (result.referralReward > 0) {
      replyText += `\n\n👥 Referrer reward: <b>$${result.referralReward}</b>`;
    }

    return ctx.reply(replyText, { parse_mode: 'HTML' });
  }

  // --- Withdraw state ---
  const state = withdrawState.get(userId);
  if (!state) return;

  if (state.step === 'address') {
    if (text.length < 5) {
      return ctx.reply('❌ Address is too short. Enter a valid wallet address:');
    }
    state.address = text;
    state.step = 'amount';
    const user = userManager.get(userId);
    return ctx.reply(
      `📤 Address: <code>${text}</code>\n\n` +
        `Enter the amount to withdraw (max <b>$${user.balance}</b>):`,
      { parse_mode: 'HTML' }
    );
  }

  if (state.step === 'amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Please enter a valid amount (number greater than 0):');
    }

    const result = economyManager.requestWithdraw(userId, state.address, amount);
    withdrawState.delete(userId);

    if (result.ok) {
      return ctx.reply(
        `✅ <b>Withdrawal request created</b>\n\n` +
          `💵 Amount: <b>$${result.request.amount}</b>\n` +
          `📬 Address: <code>${result.request.address}</code>\n` +
          `📋 Status: <b>${result.request.status}</b>\n\n` +
          `⏳ Funds will be sent shortly.`,
        { parse_mode: 'HTML' }
      );
    }

    const msgs = {
      no_funds: '❌ Insufficient balance.',
      invalid_amount: '❌ Invalid amount.',
      invalid_address: '❌ Invalid address.',
    };
    return ctx.reply(msgs[result.reason] || '❌ Failed to create the request.');
  }
});

// --- 🛠 Admin panel ---

function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Stats', 'adm_stats')],
    [Markup.button.callback('👤 User info', 'adm_user'), Markup.button.callback('📜 Recent users', 'adm_list')],
    [Markup.button.callback('➕ Add balance', 'adm_add'), Markup.button.callback('💵 Set balance', 'adm_set')],
    [Markup.button.callback('🚫 Ban user', 'adm_ban'), Markup.button.callback('✅ Unban user', 'adm_unban')],
    [Markup.button.callback('🎮 Active tables', 'adm_tables')],
    [Markup.button.callback('📢 Broadcast', 'adm_broadcast')],
  ]);
}

function adminGuard(ctx) {
  if (!isAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      ctx.answerCbQuery('⛔ Admins only', { show_alert: true }).catch(() => {});
    }
    return false;
  }
  return true;
}

async function showAdminPanel(ctx) {
  return ctx.reply('🛠 <b>Admin panel</b>\n\nChoose an action:', {
    parse_mode: 'HTML',
    ...adminPanelKeyboard(),
  });
}

bot.hears('🛠 Admin', (ctx) => {
  if (!adminGuard(ctx)) return;
  adminState.delete(ctx.from.id);
  return showAdminPanel(ctx);
});

bot.command('admin', (ctx) => {
  if (!adminGuard(ctx)) return;
  adminState.delete(ctx.from.id);
  return showAdminPanel(ctx);
});

bot.action('adm_stats', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const stats = userManager.getStats();
  const tables = gameManager.listPublicTables();
  const text =
    `📊 <b>Statistics</b>\n\n` +
    `👥 Users: <b>${stats.users}</b>\n` +
    `🚫 Banned: <b>${stats.banned}</b>\n` +
    `🔗 With referrer: <b>${stats.withReferrer}</b>\n\n` +
    `💰 Total balance: <b>$${stats.totalBalance}</b>\n` +
    `📊 Total spent: <b>$${stats.totalSpent}</b>\n\n` +
    `🎮 Games played: <b>${stats.totalGames}</b>\n` +
    `🏆 Total wins: <b>${stats.totalWins}</b>\n\n` +
    `📋 Public tables waiting: <b>${tables.length}</b>`;
  return ctx.reply(text, { parse_mode: 'HTML', ...adminPanelKeyboard() });
});

bot.action('adm_list', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const users = userManager.getAllUsers().slice(-20).reverse();
  if (!users.length) {
    return ctx.reply('📜 No users yet.', adminPanelKeyboard());
  }
  let text = `📜 <b>Last ${users.length} users:</b>\n\n`;
  for (const u of users) {
    const ban = u.banned ? ' 🚫' : '';
    text += `<code>${u.id}</code> ${u.username}${ban} | $${u.balance} | games: ${u.games}\n`;
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...adminPanelKeyboard() });
});

bot.action('adm_tables', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const tables = gameManager.listPublicTables();
  if (!tables.length) {
    return ctx.reply('🎮 No public tables waiting.', adminPanelKeyboard());
  }
  let text = `🎮 <b>Public tables (${tables.length}):</b>\n\n`;
  for (const t of tables) {
    text += `#${t.id} | $${t.bet} | ${t.players}/${t.maxPlayers}\n`;
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...adminPanelKeyboard() });
});

bot.action('adm_user', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'user_info' });
  return ctx.reply('👤 Enter target user ID:');
});

bot.action('adm_add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'add_balance_id' });
  return ctx.reply('➕ Enter target user ID to add balance to:');
});

bot.action('adm_set', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'set_balance_id' });
  return ctx.reply('💵 Enter target user ID to set balance for:');
});

bot.action('adm_ban', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'ban_id' });
  return ctx.reply('🚫 Enter target user ID to ban:');
});

bot.action('adm_unban', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'unban_id' });
  return ctx.reply('✅ Enter target user ID to unban:');
});

bot.action('adm_broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'broadcast_text' });
  return ctx.reply('📢 Send the broadcast message text (it will be sent to all users):');
});

function formatUserCard(user) {
  const ban = user.banned ? ' 🚫 banned' : '';
  return (
    `👤 <b>${user.username}</b>${ban}\n` +
    `🆔 <code>${user.id}</code>\n` +
    `💰 Balance: <b>$${user.balance}</b>\n` +
    `📊 Spent: <b>$${user.totalSpent}</b>\n` +
    `🎮 Games: <b>${user.games}</b> | 🏆 Wins: <b>${user.wins}</b>\n` +
    `👥 Referrals: <b>${user.referrals.length}</b> | Earned: <b>$${user.referralEarnings}</b>\n` +
    `🔗 Referred by: <b>${user.referredBy || '—'}</b>`
  );
}

async function handleAdminText(ctx, state, text) {
  const adminId = ctx.from.id;

  const requireUserId = (raw) => {
    const id = parseInt(raw, 10);
    if (!Number.isInteger(id) || String(id) !== raw.trim()) return null;
    return id;
  };

  if (state.step === 'user_info') {
    const id = requireUserId(text);
    if (id === null) {
      await ctx.reply('❌ Invalid user ID. Try again or send /admin to cancel.');
      return true;
    }
    adminState.delete(adminId);
    const user = userManager.get(id);
    if (!user) {
      await ctx.reply('❌ User not found.', adminPanelKeyboard());
      return true;
    }
    await ctx.reply(formatUserCard(user), { parse_mode: 'HTML', ...adminPanelKeyboard() });
    return true;
  }

  if (state.step === 'add_balance_id' || state.step === 'set_balance_id') {
    const id = requireUserId(text);
    if (id === null) {
      await ctx.reply('❌ Invalid user ID. Try again.');
      return true;
    }
    if (!userManager.get(id)) {
      adminState.delete(adminId);
      await ctx.reply('❌ User not found.', adminPanelKeyboard());
      return true;
    }
    adminState.set(adminId, {
      step: state.step === 'add_balance_id' ? 'add_balance_amount' : 'set_balance_amount',
      targetId: id,
    });
    await ctx.reply(
      state.step === 'add_balance_id'
        ? '➕ Enter amount to add (positive number, e.g. 5 or 12.5):'
        : '💵 Enter the new balance value (number ≥ 0):'
    );
    return true;
  }

  if (state.step === 'add_balance_amount') {
    const amount = parseFloat(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Try again.');
      return true;
    }
    userManager.addBalance(state.targetId, amount);
    const user = userManager.get(state.targetId);
    adminState.delete(adminId);
    await ctx.reply(
      `✅ Added <b>$${amount}</b> to user <code>${state.targetId}</code>.\n💰 New balance: <b>$${user.balance}</b>`,
      { parse_mode: 'HTML', ...adminPanelKeyboard() }
    );
    return true;
  }

  if (state.step === 'set_balance_amount') {
    const amount = parseFloat(text);
    if (!Number.isFinite(amount) || amount < 0) {
      await ctx.reply('❌ Invalid amount. Try again.');
      return true;
    }
    userManager.setBalance(state.targetId, amount);
    const user = userManager.get(state.targetId);
    adminState.delete(adminId);
    await ctx.reply(
      `✅ Balance of <code>${state.targetId}</code> set to <b>$${user.balance}</b>.`,
      { parse_mode: 'HTML', ...adminPanelKeyboard() }
    );
    return true;
  }

  if (state.step === 'ban_id' || state.step === 'unban_id') {
    const id = requireUserId(text);
    if (id === null) {
      await ctx.reply('❌ Invalid user ID. Try again.');
      return true;
    }
    if (isAdmin(id)) {
      adminState.delete(adminId);
      await ctx.reply('⛔ Cannot ban/unban an admin.', adminPanelKeyboard());
      return true;
    }
    const ok = userManager.setBanned(id, state.step === 'ban_id');
    adminState.delete(adminId);
    if (!ok) {
      await ctx.reply('❌ User not found.', adminPanelKeyboard());
      return true;
    }
    await ctx.reply(
      state.step === 'ban_id'
        ? `🚫 User <code>${id}</code> has been banned.`
        : `✅ User <code>${id}</code> has been unbanned.`,
      { parse_mode: 'HTML', ...adminPanelKeyboard() }
    );
    return true;
  }

  if (state.step === 'broadcast_text') {
    adminState.delete(adminId);
    const message = text;
    const users = userManager.getAllUsers();
    let sent = 0;
    let failed = 0;
    for (const u of users) {
      if (u.banned) continue;
      try {
        await bot.telegram.sendMessage(u.id, `📢 <b>Announcement</b>\n\n${message}`, {
          parse_mode: 'HTML',
        });
        sent++;
      } catch (_) {
        failed++;
      }
    }
    await ctx.reply(
      `📢 Broadcast finished.\n✅ Sent: <b>${sent}</b>\n❌ Failed: <b>${failed}</b>`,
      { parse_mode: 'HTML', ...adminPanelKeyboard() }
    );
    return true;
  }

  return false;
}

// --- Graceful shutdown ---

const shutdown = (signal) => {
  console.log(`\n${signal}. Shutting down...`);
  gameManager.shutdown();
  bot.stop(signal);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// --- Launch ---

bot.launch().then(() => {
  console.log('🤖 Lottery Bot is running!');
  console.log(`   Username: @${getBotUsername()}`);
});
