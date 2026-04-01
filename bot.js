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

// State for withdraw flow: userId → { step, address? }
const withdrawState = new Map();

// --- Клавиатура главного меню ---

const mainKeyboard = Markup.keyboard([
  ['🎮 Играть', '💰 Баланс'],
  ['🎁 Бонус', '👥 Рефералы'],
  ['📥 Пополнить', '📤 Вывести'],
]).resize();

// --- Helpers ---

function getName(ctx) {
  return ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
}

function getBotUsername() {
  return bot.botInfo ? bot.botInfo.username : 'bot';
}

// --- /start with referral support ---

bot.start((ctx) => {
  const userId = ctx.from.id;
  const payload = ctx.startPayload || '';

  let referrerId = null;
  if (payload.startsWith('ref_')) {
    const refId = parseInt(payload.slice(4), 10);
    if (!isNaN(refId) && refId !== userId) {
      referrerId = refId;
    }
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

  ctx.reply(text, { parse_mode: 'HTML', ...mainKeyboard });
});

// --- 🎮 Играть ---

bot.hears('🎮 Играть', (ctx) => {
  userManager.getOrCreate(ctx.from.id, getName(ctx));

  if (gameManager.isInGame(ctx.from.id)) {
    return ctx.reply('⚠️ Ты уже в игре! Дождись её окончания.');
  }

  ctx.reply(
    'Выбери комнату:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🟢 Комната $1  (2–5 игроков)', 'join_1')],
      [Markup.button.callback('🔵 Комната $5  (2–5 игроков)', 'join_5')],
      [Markup.button.callback('🔴 Комната $10 (2–5 игроков)', 'join_10')],
    ])
  );
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
      `Приглашай друзей и получай <b>2%</b> от ставок каждого реферала!\n\n` +
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
      `⏳ Баланс обновится после подтверждения транзакции.`,
    { parse_mode: 'HTML' }
  );
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

// --- Callback: выбор комнаты → inline-клавиатура билетов (1-10) ---

bot.action(/^join_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const bet = parseInt(ctx.match[1], 10);
  const userId = ctx.from.id;

  if (gameManager.isInGame(userId)) {
    return ctx.answerCbQuery('⚠️ Ты уже в игре!', { show_alert: true });
  }

  const user = userManager.getOrCreate(userId, getName(ctx));

  // Build number keyboard: 2 rows of 5
  const buttons = [];
  const row1 = [];
  const row2 = [];
  for (let i = 1; i <= 5; i++) {
    row1.push(Markup.button.callback(`${i}`, `tickets_${bet}_${i}`));
  }
  for (let i = 6; i <= 10; i++) {
    row2.push(Markup.button.callback(`${i}`, `tickets_${bet}_${i}`));
  }
  buttons.push(row1, row2);
  buttons.push([Markup.button.callback('« Назад', 'back_rooms')]);

  try {
    await ctx.editMessageText(
      `🎮 <b>Комната $${bet}</b>\n` +
        `Выбери количество билетов (1–10):\n\n` +
        `💰 Твой баланс: <b>$${user.balance}</b>\n` +
        `🎟 Стоимость: <b>$${bet}</b> × кол-во билетов`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons),
      }
    );
  } catch (_) {}
});

// --- Callback: назад к выбору комнаты ---

bot.action('back_rooms', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(
      'Выбери комнату:',
      Markup.inlineKeyboard([
        [Markup.button.callback('🟢 Комната $1  (2–5 игроков)', 'join_1')],
        [Markup.button.callback('🔵 Комната $5  (2–5 игроков)', 'join_5')],
        [Markup.button.callback('🔴 Комната $10 (2–5 игроков)', 'join_10')],
      ])
    );
  } catch (_) {}
});

// --- Callback: вход в комнату с выбранным кол-вом билетов ---

bot.action(/^tickets_(\d+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const bet = parseInt(ctx.match[1], 10);
  const ticketCount = parseInt(ctx.match[2], 10);
  const userId = ctx.from.id;
  const username = getName(ctx);
  const chatId = ctx.chat.id;

  // Remove ticket selection message
  try {
    await ctx.deleteMessage();
  } catch (_) {}

  const result = await gameManager.joinRoom(userId, username, chatId, bet, ticketCount);

  if (!result.ok) {
    const cost = bet * ticketCount;
    const messages = {
      in_game: '⚠️ Ты уже в игре! Дождись её окончания.',
      no_funds: `❌ Недостаточно средств! Нужно <b>$${cost}</b>. Забери 🎁 Бонус или 📥 Пополни баланс.`,
      invalid_bet: '❌ Неверная ставка.',
      invalid_tickets: '❌ Неверное количество билетов.',
    };
    ctx.reply(messages[result.reason] || '❌ Ошибка', { parse_mode: 'HTML' });
  }
});

// --- Text handler for withdraw flow ---

bot.on('text', (ctx) => {
  const userId = ctx.from.id;
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
