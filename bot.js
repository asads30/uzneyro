require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const UserManager = require('./userManager');
const GameManager = require('./gameManager');
const EconomyManager = require('./economyManager');
const { t, SUPPORTED_LANGS, LANG_NAMES, normalizeLang } = require('./i18n');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not set. Create a .env file (see .env.example)');
  process.exit(1);
}

const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/russianloto_channel';
const ADMIN_IDS = new Set([8760094634]);

function isAdmin(userId) {
  return ADMIN_IDS.has(userId);
}

const bot = new Telegraf(BOT_TOKEN);
const userManager = new UserManager();
const gameManager = new GameManager(userManager, bot);
const economyManager = new EconomyManager(userManager);

// State maps
const depositState = new Map();
const withdrawState = new Map();
const createTableState = new Map();
const adminState = new Map();
// Pending invite tokens for users who haven't picked a language yet
const pendingInvite = new Map();

// --- Helpers ---

function getName(ctx) {
  return ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
}

function getBotUsername() {
  return bot.botInfo ? bot.botInfo.username : 'bot';
}

function getLang(ctx) {
  return userManager.getLanguage(ctx.from.id);
}

function buildMainKeyboard(userId) {
  const lang = userManager.getLanguage(userId);
  const rows = [
    [t(lang, 'menu.create_table'), t(lang, 'menu.public_tables')],
    [t(lang, 'menu.balance'), t(lang, 'menu.referrals')],
    [t(lang, 'menu.deposit'), t(lang, 'menu.withdraw')],
    [t(lang, 'menu.instruction'), t(lang, 'menu.language')],
  ];
  if (isAdmin(userId)) {
    rows.push([t(lang, 'menu.admin')]);
  }
  return Markup.keyboard(rows).resize();
}

function languageInlineKeyboard(prefix = 'setlang_') {
  return Markup.inlineKeyboard(
    SUPPORTED_LANGS.map((code) => [Markup.button.callback(LANG_NAMES[code], `${prefix}${code}`)])
  );
}

// Resolves a localized menu label to a canonical action key across all languages.
const MENU_KEYS = [
  'menu.create_table',
  'menu.public_tables',
  'menu.balance',
  'menu.referrals',
  'menu.deposit',
  'menu.withdraw',
  'menu.instruction',
  'menu.language',
  'menu.admin',
];

function matchMenuAction(text) {
  for (const key of MENU_KEYS) {
    for (const lang of SUPPORTED_LANGS) {
      if (t(lang, key) === text) return key;
    }
  }
  return null;
}

function tableCreateBetKeyboard(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('$1', 'ctb_1'), Markup.button.callback('$5', 'ctb_5')],
    [Markup.button.callback('$10', 'ctb_10'), Markup.button.callback(t(lang, 'ct.btn_other'), 'ctb_custom')],
  ]);
}

function tableCreatePlayersKeyboard(bet) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('2', `ctp_${bet}_2`),
      Markup.button.callback('3', `ctp_${bet}_3`),
      Markup.button.callback('4', `ctp_${bet}_4`),
    ],
    [Markup.button.callback('5', `ctp_${bet}_5`), Markup.button.callback('6', `ctp_${bet}_6`)],
  ]);
}

function tableCreateTypeKeyboard(bet, maxPlayers, lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'ct.btn_public'), `ctt_${bet}_${maxPlayers}_pub`)],
    [Markup.button.callback(t(lang, 'ct.btn_private'), `ctt_${bet}_${maxPlayers}_prv`)],
  ]);
}

function tableJoinErrorText(lang, reason, needed) {
  const map = {
    in_game: 'err.in_game',
    table_not_found: 'err.table_not_found',
    table_unavailable: 'err.table_unavailable',
    table_full: 'err.table_full',
    private_only: 'err.private_only',
    invalid_tickets: 'err.invalid_tickets',
    invalid_bet: 'err.invalid_bet',
    already_in_table: 'err.already_in_table',
  };
  if (reason === 'no_funds') {
    return t(lang, 'err.no_funds', { needed });
  }
  return t(lang, map[reason] || 'err.join_fail');
}

async function showPublicTables(ctx) {
  const lang = getLang(ctx);
  const tables = gameManager.listPublicTables();
  if (!tables.length) {
    return ctx.reply(t(lang, 'pt.empty'));
  }

  const buttons = tables.map((tbl) => [
    Markup.button.callback(
      t(lang, 'pt.btn', { id: tbl.id, bet: tbl.bet, players: tbl.players, max: tbl.maxPlayers }),
      `jpb_${tbl.id}`
    ),
  ]);

  return ctx.reply(t(lang, 'pt.title'), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
  });
}

async function promptJoinPrivateByToken(ctx, token) {
  const lang = getLang(ctx);
  const table = gameManager.getTableByInviteToken(token);
  if (!table) return ctx.reply(t(lang, 'pt.private_not_found'));
  if (table.status !== 'waiting') return ctx.reply(t(lang, 'pt.private_closed'));

  await ctx.reply(
    t(lang, 'pt.private_prompt', {
      id: table.id,
      bet: table.bet,
      players: table.players.length,
      max: table.maxPlayers,
    }),
    { parse_mode: 'HTML' }
  );

  createTableState.set(ctx.from.id, { step: 'join_private_tickets', token });
}

// --- Ban middleware ---

bot.use(async (ctx, next) => {
  const userId = ctx.from && ctx.from.id;
  if (!userId) return next();
  if (isAdmin(userId)) return next();
  if (userManager.isBanned(userId)) {
    const lang = userManager.getLanguage(userId);
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery(t(lang, 'banned.short'), { show_alert: true });
      } catch (_) {}
      return;
    }
    try {
      await ctx.reply(t(lang, 'banned'));
    } catch (_) {}
    return;
  }
  return next();
});

// --- /start ---

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const payload = ctx.startPayload || '';
  console.log(`User ${getName(ctx)} (${userId}) started the bot with payload: "${payload}"`);

  let referrerId = null;
  let inviteToken = null;
  if (payload.startsWith('ref_')) {
    const refId = parseInt(payload.slice(4), 10);
    if (!isNaN(refId) && refId !== userId) referrerId = refId;
  } else if (payload.startsWith('table_')) {
    inviteToken = payload.slice(6).toUpperCase();
  }

  const isNew = !userManager.get(userId);
  userManager.getOrCreate(userId, getName(ctx), referrerId);

  if (isNew) {
    if (inviteToken) pendingInvite.set(userId, inviteToken);
    return ctx.reply(t('ru', 'lang.choose'), {
      parse_mode: 'HTML',
      ...languageInlineKeyboard('setlang_initial_'),
    });
  }

  await sendWelcome(ctx, referrerId);
  if (inviteToken) {
    if (gameManager.isInGame(userId)) {
      const lang = getLang(ctx);
      await ctx.reply(t(lang, 'start.invite_in_game'));
      return;
    }
    await promptJoinPrivateByToken(ctx, inviteToken);
  }
});

async function sendWelcome(ctx, referrerId) {
  const userId = ctx.from.id;
  const user = userManager.get(userId);
  const lang = userManager.getLanguage(userId);
  let text = t(lang, 'start.welcome', { balance: user.balance });
  if (referrerId && user.referredBy === referrerId) {
    const referrer = userManager.get(referrerId);
    if (referrer) {
      text += t(lang, 'start.referral_used', { name: referrer.username });
    }
  }
  await ctx.reply(text, { parse_mode: 'HTML', ...buildMainKeyboard(userId) });
}

// --- Language selection ---

bot.action(/^setlang_initial_(ru|uz|en)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = ctx.match[1];
  userManager.setLanguage(ctx.from.id, lang);
  try {
    await ctx.editMessageText(t(lang, 'lang.changed'), { parse_mode: 'HTML' });
  } catch (_) {}
  await sendWelcome(ctx, null);

  const token = pendingInvite.get(ctx.from.id);
  if (token) {
    pendingInvite.delete(ctx.from.id);
    if (gameManager.isInGame(ctx.from.id)) {
      await ctx.reply(t(lang, 'start.invite_in_game'));
      return;
    }
    await promptJoinPrivateByToken(ctx, token);
  }
});

bot.action(/^setlang_(ru|uz|en)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = ctx.match[1];
  userManager.setLanguage(ctx.from.id, lang);
  try {
    await ctx.editMessageText(t(lang, 'lang.changed'), { parse_mode: 'HTML' });
  } catch (_) {}
  await ctx.reply(t(lang, 'start.welcome', { balance: userManager.get(ctx.from.id).balance }), {
    parse_mode: 'HTML',
    ...buildMainKeyboard(ctx.from.id),
  });
});

// --- Menu via hears using canonical resolver ---

bot.on('text', async (ctx, next) => {
  // Pre-route menu labels regardless of current language
  const text = ctx.message.text.trim();
  const action = matchMenuAction(text);
  if (action) {
    return handleMenuAction(ctx, action);
  }
  return next();
});

async function handleMenuAction(ctx, key) {
  userManager.getOrCreate(ctx.from.id, getName(ctx));
  const lang = getLang(ctx);
  const userId = ctx.from.id;

  if (key === 'menu.language') {
    return ctx.reply(t(lang, 'lang.choose'), {
      parse_mode: 'HTML',
      ...languageInlineKeyboard('setlang_'),
    });
  }

  if (key === 'menu.instruction') {
    return ctx.reply(t(lang, 'instruction.text'), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.url(t(lang, 'instruction.channel'), CHANNEL_URL)]]),
    });
  }

  if (key === 'menu.create_table') {
    if (gameManager.isInGame(userId)) return ctx.reply(t(lang, 'ct.in_game'));
    createTableState.delete(userId);
    return ctx.reply(t(lang, 'ct.step1'), tableCreateBetKeyboard(lang));
  }

  if (key === 'menu.public_tables') {
    if (gameManager.isInGame(userId)) return ctx.reply(t(lang, 'err.in_game'));
    return showPublicTables(ctx);
  }

  if (key === 'menu.balance') {
    const user = userManager.get(userId);
    return ctx.reply(
      t(lang, 'bal.title', {
        name: user.username,
        balance: user.balance,
        spent: user.totalSpent,
        games: user.games,
        wins: user.wins,
      }),
      { parse_mode: 'HTML' }
    );
  }

  if (key === 'menu.referrals') {
    const user = userManager.get(userId);
    const link = userManager.getReferralLink(getBotUsername(), userId);
    return ctx.reply(
      t(lang, 'ref.title', {
        count: user.referrals.length,
        earned: user.referralEarnings,
        link,
      }),
      { parse_mode: 'HTML' }
    );
  }

  if (key === 'menu.deposit') {
    const info = economyManager.getDepositInfo(userId);
    return ctx.reply(
      t(lang, 'dep.title', { balance: info.balance, address: info.address }),
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'dep.btn_paid'), 'dep_paid')]]),
      }
    );
  }

  if (key === 'menu.withdraw') {
    const user = userManager.get(userId);
    if (user.balance <= 0) return ctx.reply(t(lang, 'wd.no_funds'));
    withdrawState.set(userId, { step: 'address' });
    return ctx.reply(t(lang, 'wd.address_prompt', { balance: user.balance }), {
      parse_mode: 'HTML',
    });
  }

  if (key === 'menu.admin') {
    if (!isAdmin(userId)) return;
    adminState.delete(userId);
    return showAdminPanel(ctx);
  }
}

// --- Create table flow ---

bot.action('ctb_custom', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx);
  if (gameManager.isInGame(ctx.from.id)) return ctx.reply(t(lang, 'ct.in_game'));
  createTableState.set(ctx.from.id, { step: 'custom_bet' });
  try {
    await ctx.editMessageText(t(lang, 'ct.custom_bet_prompt'));
  } catch (_) {
    await ctx.reply(t(lang, 'ct.custom_bet_prompt'));
  }
});

bot.action(/^ctb_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx);
  const bet = parseInt(ctx.match[1], 10);
  try {
    await ctx.editMessageText(t(lang, 'ct.step2', { bet }), {
      parse_mode: 'HTML',
      ...tableCreatePlayersKeyboard(bet),
    });
  } catch (_) {}
});

bot.action(/^ctp_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx);
  const bet = parseInt(ctx.match[1], 10);
  const maxPlayers = parseInt(ctx.match[2], 10);
  try {
    await ctx.editMessageText(t(lang, 'ct.step3', { bet, max: maxPlayers }), {
      parse_mode: 'HTML',
      ...tableCreateTypeKeyboard(bet, maxPlayers, lang),
    });
  } catch (_) {}
});

bot.action(/^ctt_(\d+)_(\d+)_(pub|prv)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx);
  const bet = parseInt(ctx.match[1], 10);
  const maxPlayers = parseInt(ctx.match[2], 10);
  const isPrivate = ctx.match[3] === 'prv';
  const typeText = isPrivate ? t(lang, 'ct.type_private') : t(lang, 'ct.type_public');

  createTableState.set(ctx.from.id, {
    step: 'create_tickets',
    bet,
    maxPlayers,
    isPrivate,
  });

  try {
    await ctx.editMessageText(
      t(lang, 'ct.step4', { bet, max: maxPlayers, type: typeText }),
      { parse_mode: 'HTML' }
    );
  } catch (_) {
    await ctx.reply(t(lang, 'ct.tickets_prompt'));
  }
});

async function finalizeCreateTable(ctx, bet, maxPlayers, isPrivate, ticketCount) {
  const lang = getLang(ctx);
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
    return ctx.reply(tableJoinErrorText(lang, result.reason, result.needed), {
      parse_mode: 'HTML',
    });
  }

  if (isPrivate) {
    const link = `https://t.me/${getBotUsername()}?start=table_${result.inviteToken}`;
    return ctx.reply(
      t(lang, 'ct.created_private', { id: result.table.id, bet, max: maxPlayers, link }),
      { parse_mode: 'HTML' }
    );
  }

  return ctx.reply(
    t(lang, 'ct.created_public', { id: result.table.id, bet, max: maxPlayers }),
    { parse_mode: 'HTML' }
  );
}

// --- Public tables ---

bot.action(/^jpb_([A-Z0-9]+)$/, async (ctx) => {
  const lang = getLang(ctx);
  await ctx.answerCbQuery();
  const tableId = ctx.match[1];
  const table = gameManager.getTableById(tableId);
  if (!table || table.status !== 'waiting' || table.isPrivate) {
    return ctx.answerCbQuery(t(lang, 'pt.unavailable'), { show_alert: true });
  }

  createTableState.set(ctx.from.id, { step: 'join_public_tickets', tableId });

  try {
    await ctx.editMessageText(
      t(lang, 'pt.join_prompt', {
        id: table.id,
        bet: table.bet,
        players: table.players.length,
        max: table.maxPlayers,
      }),
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'pt.btn_back'), 'back_public')]]),
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
  const lang = getLang(ctx);
  const tableId = ctx.match[1];
  const result = await gameManager.startTableByCreator(ctx.from.id, tableId);
  if (result.ok) return;

  const map = {
    table_not_found: 'start.table_not_found',
    not_creator: 'start.not_creator',
    not_enough_players: 'start.not_enough',
    table_unavailable: 'start.unavailable',
  };
  return ctx.answerCbQuery(t(lang, map[result.reason] || 'start.fail'), { show_alert: true });
});

// --- Deposit action ---

bot.action('dep_paid', async (ctx) => {
  await ctx.answerCbQuery();
  const lang = getLang(ctx);
  const userId = ctx.from.id;
  const pending = economyManager.createPendingDeposit(userId);
  if (!pending.ok) return ctx.reply(t(lang, 'dep.fail'));
  depositState.set(userId, { step: 'amount', pendingId: pending.pendingId });
  return ctx.reply(t(lang, 'dep.amount_prompt'));
});

// --- Text handler for flows ---

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const lang = getLang(ctx);

  // Admin state
  const adState = adminState.get(userId);
  if (adState && isAdmin(userId)) {
    if (await handleAdminText(ctx, adState, text)) return;
  }

  // Create table state
  const ctState = createTableState.get(userId);
  if (ctState) {
    if (ctState.step === 'custom_bet') {
      const bet = parseInt(text, 10);
      if (!Number.isInteger(bet) || bet <= 0 || String(bet) !== text) {
        return ctx.reply(t(lang, 'ct.invalid_int'));
      }
      createTableState.delete(userId);
      return ctx.reply(t(lang, 'ct.step2', { bet }), {
        parse_mode: 'HTML',
        ...tableCreatePlayersKeyboard(bet),
      });
    }

    if (ctState.step === 'create_tickets') {
      const tickets = parseInt(text, 10);
      if (!Number.isInteger(tickets) || tickets <= 0 || String(tickets) !== text) {
        return ctx.reply(t(lang, 'ct.invalid_tickets'));
      }
      createTableState.delete(userId);
      return finalizeCreateTable(ctx, ctState.bet, ctState.maxPlayers, ctState.isPrivate, tickets);
    }

    if (ctState.step === 'join_public_tickets') {
      const tickets = parseInt(text, 10);
      if (!Number.isInteger(tickets) || tickets <= 0 || String(tickets) !== text) {
        return ctx.reply(t(lang, 'ct.invalid_tickets'));
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
        return ctx.reply(tableJoinErrorText(lang, result.reason, result.needed), {
          parse_mode: 'HTML',
        });
      }
      return;
    }

    if (ctState.step === 'join_private_tickets') {
      const tickets = parseInt(text, 10);
      if (!Number.isInteger(tickets) || tickets <= 0 || String(tickets) !== text) {
        return ctx.reply(t(lang, 'ct.invalid_tickets'));
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
        return ctx.reply(tableJoinErrorText(lang, result.reason, result.needed), {
          parse_mode: 'HTML',
        });
      }
      return;
    }
  }

  // Deposit
  const dep = depositState.get(userId);
  if (dep && dep.step === 'amount') {
    const amount = parseFloat(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      return ctx.reply(t(lang, 'dep.invalid_amount'));
    }
    const result = economyManager.confirmDeposit(userId, dep.pendingId, amount);
    if (!result.ok) {
      if (result.reason === 'already_processed') {
        depositState.delete(userId);
        return ctx.reply(t(lang, 'dep.already'));
      }
      if (result.reason === 'invalid_pending') {
        depositState.delete(userId);
        return ctx.reply(t(lang, 'dep.expired'));
      }
      return ctx.reply(t(lang, 'dep.fail_process'));
    }
    depositState.delete(userId);
    let replyText = t(lang, 'dep.success', { amount: result.amount, balance: result.balance });
    if (result.referralReward > 0) {
      replyText += t(lang, 'dep.referral_reward', { amount: result.referralReward });
    }
    return ctx.reply(replyText, { parse_mode: 'HTML' });
  }

  // Withdraw
  const state = withdrawState.get(userId);
  if (!state) return;

  if (state.step === 'address') {
    if (text.length < 5) return ctx.reply(t(lang, 'wd.address_short'));
    state.address = text;
    state.step = 'amount';
    const user = userManager.get(userId);
    return ctx.reply(t(lang, 'wd.amount_prompt', { address: text, max: user.balance }), {
      parse_mode: 'HTML',
    });
  }

  if (state.step === 'amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) return ctx.reply(t(lang, 'wd.invalid_amount'));
    const result = economyManager.requestWithdraw(userId, state.address, amount);
    withdrawState.delete(userId);
    if (result.ok) {
      return ctx.reply(
        t(lang, 'wd.success', {
          amount: result.request.amount,
          address: result.request.address,
          status: result.request.status,
        }),
        { parse_mode: 'HTML' }
      );
    }
    const map = {
      no_funds: 'wd.no_funds_alt',
      invalid_amount: 'wd.invalid_amount_alt',
      invalid_address: 'wd.invalid_address',
    };
    return ctx.reply(t(lang, map[result.reason] || 'wd.fail'));
  }
});

// --- Admin panel ---

function adminPanelKeyboard(lang) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'adm.btn_stats'), 'adm_stats')],
    [
      Markup.button.callback(t(lang, 'adm.btn_user'), 'adm_user'),
      Markup.button.callback(t(lang, 'adm.btn_list'), 'adm_list'),
    ],
    [
      Markup.button.callback(t(lang, 'adm.btn_add'), 'adm_add'),
      Markup.button.callback(t(lang, 'adm.btn_set'), 'adm_set'),
      Markup.button.callback(t(lang, 'adm.btn_sub'), 'adm_sub'),
    ],
    [
      Markup.button.callback(t(lang, 'adm.btn_ban'), 'adm_ban'),
      Markup.button.callback(t(lang, 'adm.btn_unban'), 'adm_unban'),
    ],
    [
      Markup.button.callback(t(lang, 'adm.btn_tables'), 'adm_tables'),
      Markup.button.callback(t(lang, 'adm.btn_withdraws'), 'adm_withdraws'),
    ],
    [
      Markup.button.callback(t(lang, 'adm.btn_msg'), 'adm_msg'),
      Markup.button.callback(t(lang, 'adm.btn_broadcast'), 'adm_broadcast'),
    ],
  ]);
}

function adminGuard(ctx) {
  if (!isAdmin(ctx.from.id)) {
    if (ctx.callbackQuery) {
      const lang = getLang(ctx);
      ctx.answerCbQuery(t(lang, 'adm.only'), { show_alert: true }).catch(() => {});
    }
    return false;
  }
  return true;
}

async function showAdminPanel(ctx) {
  const lang = getLang(ctx);
  return ctx.reply(t(lang, 'adm.title'), { parse_mode: 'HTML', ...adminPanelKeyboard(lang) });
}

bot.command('admin', (ctx) => {
  if (!adminGuard(ctx)) return;
  adminState.delete(ctx.from.id);
  return showAdminPanel(ctx);
});

bot.action('adm_stats', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const lang = getLang(ctx);
  const stats = userManager.getStats();
  const tables = gameManager.listPublicTables();
  const pendingWd = userManager.getPendingWithdraws().length;
  const text =
    `📊 <b>Statistics</b>\n\n` +
    `👥 Users: <b>${stats.users}</b>\n` +
    `🚫 Banned: <b>${stats.banned}</b>\n` +
    `🔗 With referrer: <b>${stats.withReferrer}</b>\n\n` +
    `🌐 Lang: 🇷🇺 ${stats.byLang.ru} · 🇺🇿 ${stats.byLang.uz} · 🇬🇧 ${stats.byLang.en}\n\n` +
    `💰 Total balance: <b>$${stats.totalBalance}</b>\n` +
    `📊 Total spent: <b>$${stats.totalSpent}</b>\n\n` +
    `🎮 Games played: <b>${stats.totalGames}</b>\n` +
    `🏆 Total wins: <b>${stats.totalWins}</b>\n\n` +
    `📋 Public tables waiting: <b>${tables.length}</b>\n` +
    `💸 Pending withdrawals: <b>${pendingWd}</b>`;
  return ctx.reply(text, { parse_mode: 'HTML', ...adminPanelKeyboard(lang) });
});

bot.action('adm_list', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const lang = getLang(ctx);
  const users = userManager.getAllUsers().slice(-20).reverse();
  if (!users.length) {
    return ctx.reply('📜 No users yet.', adminPanelKeyboard(lang));
  }
  let text = `📜 <b>Last ${users.length} users:</b>\n\n`;
  for (const u of users) {
    const ban = u.banned ? ' 🚫' : '';
    text += `<code>${u.id}</code> ${u.username}${ban} | ${u.language || 'ru'} | $${u.balance} | g:${u.games}\n`;
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...adminPanelKeyboard(lang) });
});

bot.action('adm_tables', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const lang = getLang(ctx);
  const tables = gameManager.listPublicTables();
  if (!tables.length) {
    return ctx.reply('🎮 No public tables waiting.', adminPanelKeyboard(lang));
  }
  let text = `🎮 <b>Public tables (${tables.length}):</b>\n\n`;
  for (const tbl of tables) {
    text += `#${tbl.id} | $${tbl.bet} | ${tbl.players}/${tbl.maxPlayers}\n`;
  }
  return ctx.reply(text, { parse_mode: 'HTML', ...adminPanelKeyboard(lang) });
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

bot.action('adm_sub', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'sub_balance_id' });
  return ctx.reply('➖ Enter target user ID to deduct balance from:');
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

bot.action('adm_msg', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'msg_id' });
  return ctx.reply('✉️ Enter user ID to message:');
});

bot.action('adm_broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  adminState.set(ctx.from.id, { step: 'broadcast_text' });
  return ctx.reply('📢 Send the broadcast message text (will be sent to all users):');
});

bot.action('adm_withdraws', async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const lang = getLang(ctx);
  const list = userManager.getPendingWithdraws();
  if (!list.length) {
    return ctx.reply('💸 No pending withdrawal requests.', adminPanelKeyboard(lang));
  }
  for (const item of list.slice(0, 20)) {
    const text =
      `💸 <b>Withdrawal #${item.request.id}</b>\n` +
      `👤 User: ${item.username} (<code>${item.userId}</code>)\n` +
      `💵 Amount: <b>$${item.request.amount}</b>\n` +
      `📬 Address: <code>${item.request.address}</code>\n` +
      `📅 ${item.request.createdAt}`;
    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Approve', `wd_ok_${item.userId}_${item.request.id}`),
          Markup.button.callback('❌ Reject', `wd_no_${item.userId}_${item.request.id}`),
        ],
      ]),
    });
  }
});

bot.action(/^wd_(ok|no)_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!adminGuard(ctx)) return;
  const action = ctx.match[1];
  const userId = parseInt(ctx.match[2], 10);
  const reqId = parseInt(ctx.match[3], 10);

  const targetLang = userManager.getLanguage(userId);
  const req = userManager.findWithdraw(userId, reqId);
  if (!req || req.status !== 'pending') {
    try {
      await ctx.editMessageText('⚠️ Already processed.');
    } catch (_) {}
    return;
  }

  if (action === 'ok') {
    userManager.approveWithdraw(userId, reqId);
    try {
      await ctx.editMessageText(`✅ Withdrawal #${reqId} for <code>${userId}</code> approved.`, {
        parse_mode: 'HTML',
      });
    } catch (_) {}
    try {
      await bot.telegram.sendMessage(
        userId,
        t(targetLang, 'wd.notify_user', {
          amount: req.amount,
          status: 'approved',
          note: t(targetLang, 'wd.approved_note'),
        }),
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
  } else {
    userManager.rejectWithdraw(userId, reqId);
    try {
      await ctx.editMessageText(`❌ Withdrawal #${reqId} for <code>${userId}</code> rejected (refunded).`, {
        parse_mode: 'HTML',
      });
    } catch (_) {}
    try {
      await bot.telegram.sendMessage(
        userId,
        t(targetLang, 'wd.notify_user', {
          amount: req.amount,
          status: 'rejected',
          note: t(targetLang, 'wd.rejected_note'),
        }),
        { parse_mode: 'HTML' }
      );
    } catch (_) {}
  }
});

function formatUserCard(user) {
  const ban = user.banned ? ' 🚫 banned' : '';
  return (
    `👤 <b>${user.username}</b>${ban}\n` +
    `🆔 <code>${user.id}</code>\n` +
    `🌐 Lang: <b>${user.language || 'ru'}</b>\n` +
    `💰 Balance: <b>$${user.balance}</b>\n` +
    `📊 Spent: <b>$${user.totalSpent}</b>\n` +
    `🎮 Games: <b>${user.games}</b> | 🏆 Wins: <b>${user.wins}</b>\n` +
    `👥 Referrals: <b>${user.referrals.length}</b> | Earned: <b>$${user.referralEarnings}</b>\n` +
    `🔗 Referred by: <b>${user.referredBy || '—'}</b>\n` +
    `📅 Joined: ${user.createdAt || '—'}`
  );
}

async function handleAdminText(ctx, state, text) {
  const adminId = ctx.from.id;
  const lang = getLang(ctx);

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
      await ctx.reply('❌ User not found.', adminPanelKeyboard(lang));
      return true;
    }
    await ctx.reply(formatUserCard(user), { parse_mode: 'HTML', ...adminPanelKeyboard(lang) });
    return true;
  }

  if (state.step === 'add_balance_id' || state.step === 'set_balance_id' || state.step === 'sub_balance_id') {
    const id = requireUserId(text);
    if (id === null) {
      await ctx.reply('❌ Invalid user ID. Try again.');
      return true;
    }
    if (!userManager.get(id)) {
      adminState.delete(adminId);
      await ctx.reply('❌ User not found.', adminPanelKeyboard(lang));
      return true;
    }
    const nextStep =
      state.step === 'add_balance_id'
        ? 'add_balance_amount'
        : state.step === 'set_balance_id'
        ? 'set_balance_amount'
        : 'sub_balance_amount';
    adminState.set(adminId, { step: nextStep, targetId: id });
    const prompt =
      state.step === 'add_balance_id'
        ? '➕ Enter amount to add (positive number):'
        : state.step === 'set_balance_id'
        ? '💵 Enter the new balance value (number ≥ 0):'
        : '➖ Enter amount to deduct (positive number):';
    await ctx.reply(prompt);
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
      `✅ Added <b>$${amount}</b> to <code>${state.targetId}</code>.\n💰 New balance: <b>$${user.balance}</b>`,
      { parse_mode: 'HTML', ...adminPanelKeyboard(lang) }
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
      { parse_mode: 'HTML', ...adminPanelKeyboard(lang) }
    );
    return true;
  }

  if (state.step === 'sub_balance_amount') {
    const amount = parseFloat(text);
    if (!Number.isFinite(amount) || amount <= 0) {
      await ctx.reply('❌ Invalid amount. Try again.');
      return true;
    }
    const ok = userManager.deductBalance(state.targetId, amount);
    const user = userManager.get(state.targetId);
    adminState.delete(adminId);
    if (!ok) {
      await ctx.reply(
        `❌ Insufficient user balance ($${user.balance}).`,
        adminPanelKeyboard(lang)
      );
      return true;
    }
    await ctx.reply(
      `✅ Deducted <b>$${amount}</b> from <code>${state.targetId}</code>.\n💰 New balance: <b>$${user.balance}</b>`,
      { parse_mode: 'HTML', ...adminPanelKeyboard(lang) }
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
      await ctx.reply('⛔ Cannot ban/unban an admin.', adminPanelKeyboard(lang));
      return true;
    }
    const ok = userManager.setBanned(id, state.step === 'ban_id');
    adminState.delete(adminId);
    if (!ok) {
      await ctx.reply('❌ User not found.', adminPanelKeyboard(lang));
      return true;
    }
    await ctx.reply(
      state.step === 'ban_id'
        ? `🚫 User <code>${id}</code> has been banned.`
        : `✅ User <code>${id}</code> has been unbanned.`,
      { parse_mode: 'HTML', ...adminPanelKeyboard(lang) }
    );
    return true;
  }

  if (state.step === 'msg_id') {
    const id = requireUserId(text);
    if (id === null) {
      await ctx.reply('❌ Invalid user ID. Try again.');
      return true;
    }
    if (!userManager.get(id)) {
      adminState.delete(adminId);
      await ctx.reply('❌ User not found.', adminPanelKeyboard(lang));
      return true;
    }
    adminState.set(adminId, { step: 'msg_text', targetId: id });
    await ctx.reply('✉️ Enter message text to send:');
    return true;
  }

  if (state.step === 'msg_text') {
    adminState.delete(adminId);
    try {
      await bot.telegram.sendMessage(state.targetId, `✉️ <b>Message from admin</b>\n\n${text}`, {
        parse_mode: 'HTML',
      });
      await ctx.reply(`✅ Message sent to <code>${state.targetId}</code>.`, {
        parse_mode: 'HTML',
        ...adminPanelKeyboard(lang),
      });
    } catch (_) {
      await ctx.reply('❌ Failed to send message.', adminPanelKeyboard(lang));
    }
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
      { parse_mode: 'HTML', ...adminPanelKeyboard(lang) }
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
