require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const UserManager = require('./userManager');
const GameManager = require('./gameManager');
const EconomyManager = require('./economyManager');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан. Создайте .env файл (см. .env.example)');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const userManager = new UserManager();
const gameManager = new GameManager(userManager, bot);
const economyManager = new EconomyManager(userManager);

// State for flows
// depositState: userId -> { step: 'amount', pendingId }
const depositState = new Map();
// withdrawState: userId -> { step: 'address'|'amount', address? }
const withdrawState = new Map();

// --- Клавиатура главного меню ---

const mainKeyboard = Markup.keyboard([
  ['🎮 Создать стол', '📋 Публичные столы'],
  ['💰 Баланс', '🎁 Бонус'],
  ['👥 Рефералы', '📥 Пополнить'],
  ['📤 Вывести'],
]).resize();

// --- Helpers ---

function getName(ctx) {
  return ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
}

function getBotUsername() {
  return bot.botInfo ? bot.botInfo.username : 'bot';
}

function tableCreateBetKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('$1', 'ctb_1'), Markup.button.callback('$3', 'ctb_3')],
    [Markup.button.callback('$5', 'ctb_5'), Markup.button.callback('$10', 'ctb_10')],
    [Markup.button.callback('$15', 'ctb_15'), Markup.button.callback('$20', 'ctb_20')],
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
    [Markup.button.callback('🌐 Публичный', `ctt_${bet}_${maxPlayers}_pub`)],
    [Markup.button.callback('🔒 Приватный', `ctt_${bet}_${maxPlayers}_prv`)],
  ]);
}

function tableTicketsKeyboard(prefix) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('1', `${prefix}_1`),
      Markup.button.callback('2', `${prefix}_2`),
      Markup.button.callback('3', `${prefix}_3`),
    ],
  ]);
}

function tableJoinErrorText(reason, needed) {
  const map = {
    in_game: '⚠️ Ты уже в другом столе.',
    table_not_found: '❌ Стол не найден.',
    table_unavailable: '❌ Стол уже недоступен.',
    table_full: '❌ Стол уже заполнен.',
    private_only: '❌ Это приватный стол. Войти можно только по ссылке.',
    invalid_tickets: '❌ Количество билетов должно быть от 1 до 3.',
    already_in_table: '⚠️ Ты уже в этом столе.',
  };

  if (reason === 'no_funds') {
    return `❌ Недостаточно средств. Нужно минимум <b>$${needed}</b>.`;
  }

  return map[reason] || '❌ Не удалось войти в стол.';
}

async function showPublicTables(ctx) {
  const tables = gameManager.listPublicTables();
  if (!tables.length) {
    return ctx.reply('📋 Сейчас нет доступных публичных столов. Создай новый стол.');
  }

  const buttons = tables.map((t) => [
    Markup.button.callback(
      `#${t.id} | $${t.bet} | ${t.players}/${t.maxPlayers} игроков`,
      `jpb_${t.id}`
    ),
  ]);

  return ctx.reply('📋 <b>Публичные столы:</b>', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons),
  });
}

async function promptJoinPrivateByToken(ctx, token) {
  const table = gameManager.getTableByInviteToken(token);
  if (!table) {
    return ctx.reply('❌ Приватный стол по этой ссылке не найден или уже завершён.');
  }

  if (table.status !== 'waiting') {
    return ctx.reply('❌ Этот стол уже недоступен для входа.');
  }

  return ctx.reply(
    `🔒 <b>Приватный стол #${table.id}</b>\n` +
      `💵 Ставка: <b>$${table.bet}</b>\n` +
      `👥 Игроки: <b>${table.players.length}/${table.maxPlayers}</b>\n\n` +
      'Выбери количество билетов (1–3):',
    {
      parse_mode: 'HTML',
      ...tableTicketsKeyboard(`jtk_${token}`),
    }
  );
}

// --- /start with referral support ---

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const payload = ctx.startPayload || '';

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
    `👋 Добро пожаловать в <b>Lottery Bot</b>!\n` +
    `💰 Баланс: <b>$${user.balance}</b>\n\n` +
    `Выбери действие в меню ниже:`;

  if (referrerId && user.referredBy === referrerId) {
    const referrer = userManager.get(referrerId);
    if (referrer) {
      text += `\n\n✅ Ты зарегистрирован по реферальной ссылке <b>${referrer.username}</b>`;
    }
  }

  await ctx.reply(text, { parse_mode: 'HTML', ...mainKeyboard });

  if (inviteToken) {
    if (gameManager.isInGame(userId)) {
      await ctx.reply('⚠️ Ты уже в другом столе и не можешь войти по ссылке сейчас.');
      return;
    }
    await promptJoinPrivateByToken(ctx, inviteToken);
  }
});

// --- 🎮 Создать стол ---

bot.hears('🎮 Создать стол', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));

  if (gameManager.isInGame(ctx.from.id)) {
    return ctx.reply('⚠️ Ты уже находишься в столе. Дождись завершения игры.');
  }

  return ctx.reply('🎮 Создание стола\n\n1) Выбери ставку:', tableCreateBetKeyboard());
});

bot.action(/^ctb_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const bet = parseInt(ctx.match[1], 10);

  try {
    await ctx.editMessageText(
      `🎮 Создание стола\n\nСтавка: <b>$${bet}</b>\n\n2) Выбери количество игроков (2–6):`,
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
      `🎮 Создание стола\n\nСтавка: <b>$${bet}</b>\nИгроков: <b>${maxPlayers}</b>\n\n3) Выбери тип стола:`,
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
  const typeText = mode === 'prv' ? '🔒 Приватный' : '🌐 Публичный';

  try {
    await ctx.editMessageText(
      `🎮 Создание стола\n\nСтавка: <b>$${bet}</b>\nИгроков: <b>${maxPlayers}</b>\nТип: <b>${typeText}</b>\n\n4) Выбери количество билетов для себя (1–3):`,
      {
        parse_mode: 'HTML',
        ...tableTicketsKeyboard(`ctk_${bet}_${maxPlayers}_${mode}`),
      }
    );
  } catch (_) {}
});

bot.action(/^ctk_(\d+)_(\d+)_(pub|prv)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const bet = parseInt(ctx.match[1], 10);
  const maxPlayers = parseInt(ctx.match[2], 10);
  const mode = ctx.match[3];
  const ticketCount = parseInt(ctx.match[4], 10);
  const isPrivate = mode === 'prv';

  try {
    await ctx.deleteMessage();
  } catch (_) {}

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
    const errorText = tableJoinErrorText(result.reason, result.needed);
    return ctx.reply(errorText, { parse_mode: 'HTML' });
  }

  if (isPrivate) {
    const link = `https://t.me/${getBotUsername()}?start=table_${result.inviteToken}`;
    return ctx.reply(
      `✅ Приватный стол создан: <b>#${result.table.id}</b>\n` +
        `💵 Ставка: <b>$${bet}</b>\n` +
        `👥 Макс. игроков: <b>${maxPlayers}</b>\n\n` +
        `🔗 Ссылка для приглашения:\n<code>${link}</code>`,
      { parse_mode: 'HTML' }
    );
  }

  return ctx.reply(
    `✅ Публичный стол создан: <b>#${result.table.id}</b>\n` +
      `💵 Ставка: <b>$${bet}</b>\n` +
      `👥 Макс. игроков: <b>${maxPlayers}</b>\n\n` +
      'Он появился в списке «📋 Публичные столы».',
    { parse_mode: 'HTML' }
  );
});

// --- 📋 Публичные столы ---

bot.hears('📋 Публичные столы', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));
  if (gameManager.isInGame(ctx.from.id)) {
    return ctx.reply('⚠️ Ты уже находишься в столе.');
  }
  return showPublicTables(ctx);
});

bot.action(/^jpb_([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tableId = ctx.match[1];
  const table = gameManager.getTableById(tableId);
  if (!table || table.status !== 'waiting' || table.isPrivate) {
    return ctx.answerCbQuery('❌ Стол недоступен', { show_alert: true });
  }

  try {
    await ctx.editMessageText(
      `🎮 Стол #${table.id}\n` +
        `💵 Ставка: <b>$${table.bet}</b>\n` +
        `👥 Игроки: <b>${table.players.length}/${table.maxPlayers}</b>\n\n` +
        'Выбери количество билетов (1–3):',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('1', `jpt_${table.id}_1`),
            Markup.button.callback('2', `jpt_${table.id}_2`),
            Markup.button.callback('3', `jpt_${table.id}_3`),
          ],
          [Markup.button.callback('« Назад к списку', 'back_public')],
        ]),
      }
    );
  } catch (_) {}
});

bot.action('back_public', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.deleteMessage();
  } catch (_) {}
  return showPublicTables(ctx);
});

bot.action(/^jpt_([A-Z0-9]+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tableId = ctx.match[1];
  const ticketCount = parseInt(ctx.match[2], 10);

  try {
    await ctx.deleteMessage();
  } catch (_) {}

  const result = await gameManager.joinPublicTable(
    ctx.from.id,
    getName(ctx),
    ctx.chat.id,
    tableId,
    ticketCount
  );

  if (!result.ok) {
    return ctx.reply(tableJoinErrorText(result.reason, result.needed), {
      parse_mode: 'HTML',
    });
  }
});

bot.action(/^jtk_([A-Z0-9]+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const token = ctx.match[1];
  const ticketCount = parseInt(ctx.match[2], 10);

  try {
    await ctx.deleteMessage();
  } catch (_) {}

  const result = await gameManager.joinPrivateByToken(
    ctx.from.id,
    getName(ctx),
    ctx.chat.id,
    token,
    ticketCount
  );

  if (!result.ok) {
    return ctx.reply(tableJoinErrorText(result.reason, result.needed), {
      parse_mode: 'HTML',
    });
  }
});

bot.action(/^start_table_([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const tableId = ctx.match[1];
  const result = await gameManager.startTableByCreator(ctx.from.id, tableId);

  if (result.ok) {
    return;
  }

  const map = {
    table_not_found: '❌ Стол не найден.',
    not_creator: '❌ Только создатель стола может запустить игру.',
    not_enough_players: '❌ Нужно минимум 2 игрока для старта.',
    table_unavailable: '❌ Игра уже запущена или стол недоступен.',
  };

  return ctx.answerCbQuery(map[result.reason] || '❌ Не удалось запустить игру', {
    show_alert: true,
  });
});

// --- 💰 Баланс ---

bot.hears('💰 Баланс', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));
  ctx.reply(
    `💰 <b>Баланс</b>\n\n` +
      `🏷 Имя: ${user.username}\n` +
      `💵 Баланс: <b>$${user.balance}</b>\n` +
      `📊 Потрачено: <b>$${user.totalSpent}</b>\n` +
      `🎮 Игр сыграно: <b>${user.games}</b>\n` +
      `🏆 Побед: <b>${user.wins}</b>`,
    { parse_mode: 'HTML' }
  );
});

// --- 🎁 Бонус ---

bot.hears('🎁 Бонус', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));
  const result = userManager.claimBonus(ctx.from.id);

  if (result.success) {
    ctx.reply(
      `🎁 Бонус получен! <b>+$1</b>\n💰 Баланс: <b>$${result.balance}</b>`,
      { parse_mode: 'HTML' }
    );
  } else {
    ctx.reply('⏳ Ты уже забирал бонус сегодня. Приходи завтра!');
  }
});

// --- 👥 Рефералы ---

bot.hears('👥 Рефералы', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));
  const link = userManager.getReferralLink(getBotUsername(), ctx.from.id);

  ctx.reply(
    `👥 <b>Реферальная программа</b>\n\n` +
      `Приглашай друзей и получай <b>$0.05</b> за каждый успешный депозит реферала.\n\n` +
      `👤 Рефералов: <b>${user.referrals.length}</b>\n` +
      `💵 Заработано: <b>$${user.referralEarnings}</b>\n\n` +
      `🔗 Твоя ссылка:\n<code>${link}</code>`,
    { parse_mode: 'HTML' }
  );
});

// --- 📥 Пополнить ---

bot.hears('📥 Пополнить', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));
  const info = economyManager.getDepositInfo(ctx.from.id);

  ctx.reply(
    `📥 <b>Пополнение</b>\n\n` +
      `💰 Текущий баланс: <b>$${info.balance}</b>\n\n` +
      `Отправь средства на адрес:\n` +
      `<code>${info.address}</code>\n\n` +
      `После оплаты нажми кнопку ниже и введи сумму депозита.`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Я оплатил', 'dep_paid')],
      ]),
    }
  );
});

bot.action('dep_paid', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  const pending = economyManager.createPendingDeposit(userId);
  if (!pending.ok) {
    return ctx.reply('❌ Не удалось создать запрос на пополнение.');
  }

  depositState.set(userId, {
    step: 'amount',
    pendingId: pending.pendingId,
  });

  return ctx.reply('💵 Введи сумму пополнения (например: 5 или 12.5):');
});

// --- 📤 Вывести ---

bot.hears('📤 Вывести', (ctx) => {
  const user = userManager.getOrCreate(ctx.from.id, getName(ctx));

  if (user.balance <= 0) {
    return ctx.reply('❌ У тебя нет средств для вывода.');
  }

  withdrawState.set(ctx.from.id, { step: 'address' });
  ctx.reply(
    `📤 <b>Вывод средств</b>\n\n` +
      `💰 Баланс: <b>$${user.balance}</b>\n\n` +
      `Введи адрес кошелька для вывода:`,
    { parse_mode: 'HTML' }
  );
});

// --- Text handler for withdraw flow ---

bot.on('text', (ctx) => {
  const userId = ctx.from.id;

  const dep = depositState.get(userId);
  if (dep && dep.step === 'amount') {
    const amount = parseFloat(ctx.message.text.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      return ctx.reply('❌ Введи корректную сумму пополнения (число больше 0).');
    }

    const result = economyManager.confirmDeposit(userId, dep.pendingId, amount);
    if (!result.ok) {
      if (result.reason === 'already_processed') {
        depositState.delete(userId);
        return ctx.reply('⚠️ Этот депозит уже обработан.');
      }
      if (result.reason === 'invalid_pending') {
        depositState.delete(userId);
        return ctx.reply('❌ Сессия пополнения устарела. Нажми «📥 Пополнить» снова.');
      }
      return ctx.reply('❌ Не удалось обработать депозит. Проверь сумму и попробуй снова.');
    }

    depositState.delete(userId);
    let text =
      `✅ <b>Пополнение зачислено</b>\n\n` +
      `💵 Сумма: <b>$${result.amount}</b>\n` +
      `💰 Новый баланс: <b>$${result.balance}</b>`;

    if (result.referralReward > 0) {
      text += `\n\n👥 Рефереру начислено: <b>$${result.referralReward}</b>`;
    }

    return ctx.reply(text, { parse_mode: 'HTML' });
  }

  const state = withdrawState.get(userId);
  if (!state) return; // Not in withdraw flow

  const text = ctx.message.text.trim();

  if (state.step === 'address') {
    // Validate address minimally
    if (text.length < 5) {
      return ctx.reply('❌ Адрес слишком короткий. Введи корректный адрес кошелька:');
    }
    state.address = text;
    state.step = 'amount';
    const user = userManager.get(userId);
    ctx.reply(
      `📤 Адрес: <code>${text}</code>\n\n` +
        `Введи сумму для вывода (макс. <b>$${user.balance}</b>):`,
      { parse_mode: 'HTML' }
    );
  } else if (state.step === 'amount') {
    const amount = parseFloat(text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Введи корректную сумму (число больше 0):');
    }

    const result = economyManager.requestWithdraw(userId, state.address, amount);
    withdrawState.delete(userId);

    if (result.ok) {
      ctx.reply(
        `✅ <b>Заявка на вывод создана</b>\n\n` +
          `💵 Сумма: <b>$${result.request.amount}</b>\n` +
          `📬 Адрес: <code>${result.request.address}</code>\n` +
          `📋 Статус: <b>${result.request.status}</b>\n\n` +
          `⏳ Средства будут отправлены в ближайшее время.`,
        { parse_mode: 'HTML' }
      );
    } else {
      const msgs = {
        no_funds: '❌ Недостаточно средств на балансе.',
        invalid_amount: '❌ Некорректная сумма.',
        invalid_address: '❌ Некорректный адрес.',
      };
      ctx.reply(msgs[result.reason] || '❌ Ошибка при создании заявки.');
    }
  }
});

// --- Graceful shutdown ---

const shutdown = (signal) => {
  console.log(`\n${signal}. Завершение...`);
  gameManager.shutdown();
  bot.stop(signal);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// --- Запуск ---

bot.launch().then(() => {
  console.log('🤖 Lottery Bot запущен!');
  console.log(`   Username: @${getBotUsername()}`);
});
