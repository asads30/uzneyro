const { t } = require('./i18n');

const MIN_BET = 1;
const MAX_BET = 10000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 15;
const MIN_TICKETS = 1;
const MAX_TICKETS = 100;
const NUMBERS_PER_TICKET = 5;
const MAX_NUMBER = 30;
const COMMISSION = 0.10;
const DRAW_INTERVAL_MS = 2000;

class GameManager {
  constructor(userManager, bot) {
    this.userManager = userManager;
    this.bot = bot;

    this.tablesById = new Map();
    this.publicTableIds = new Set();
    this.inviteTokenToTableId = new Map();
    this.playerToTableId = new Map();
  }

  isInGame(userId) {
    return this.playerToTableId.has(userId);
  }

  getTableById(tableId) {
    return this.tablesById.get(String(tableId)) || null;
  }

  getTableByInviteToken(token) {
    const tableId = this.inviteTokenToTableId.get(String(token));
    if (!tableId) return null;
    return this.getTableById(tableId);
  }

  listPublicTables() {
    const list = [];
    for (const tableId of this.publicTableIds) {
      const table = this.getTableById(tableId);
      if (!table) continue;
      if (table.status !== 'waiting') continue;
      if (table.players.length >= table.maxPlayers) continue;
      list.push({
        id: table.id,
        bet: table.bet,
        players: table.players.length,
        maxPlayers: table.maxPlayers,
      });
    }
    list.sort((a, b) => a.bet - b.bet || a.players - b.players);
    return list;
  }

  canCreatorStart(userId, tableId) {
    const table = this.getTableById(tableId);
    if (!table) return false;
    if (table.status !== 'waiting') return false;
    if (table.creatorId !== userId) return false;
    return table.players.length >= MIN_PLAYERS;
  }

  async createTable(creatorId, creatorName, chatId, bet, maxPlayers, isPrivate, ticketCount) {
    if (this.isInGame(creatorId)) {
      return { ok: false, reason: 'in_game' };
    }

    if (!Number.isInteger(bet) || bet < MIN_BET || bet > MAX_BET) {
      return { ok: false, reason: 'invalid_bet' };
    }

    if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
      return { ok: false, reason: 'invalid_max_players' };
    }

    if (!Number.isInteger(ticketCount) || ticketCount < MIN_TICKETS || ticketCount > MAX_TICKETS) {
      return { ok: false, reason: 'invalid_tickets' };
    }

    const cost = bet * ticketCount;
    const user = this.userManager.getOrCreate(creatorId, creatorName);
    if (user.balance < cost) {
      return { ok: false, reason: 'no_funds', needed: cost };
    }

    const deducted = this.userManager.deduct(creatorId, cost);
    if (!deducted) {
      return { ok: false, reason: 'no_funds', needed: cost };
    }
    this.userManager.addGame(creatorId);

    const tableId = this.generateTableId();
    const inviteToken = isPrivate ? this.generateInviteToken() : null;
    const creatorTickets = this.generateTickets(ticketCount);

    const table = {
      id: tableId,
      creatorId,
      bet,
      maxPlayers,
      players: [],
      isPrivate,
      inviteToken,
      status: 'waiting',
      tickets: new Map(),
      drawnNumbers: [],
      drawnSet: new Set(),
      interval: null,
      drawing: false,
      starting: false,
      ending: false,
    };

    const player = {
      userId: creatorId,
      username: user.username,
      chatId,
      ticketCount,
      messageId: null,
    };

    table.players.push(player);
    table.tickets.set(creatorId, creatorTickets);

    this.tablesById.set(tableId, table);
    this.playerToTableId.set(creatorId, tableId);

    if (isPrivate) {
      this.inviteTokenToTableId.set(inviteToken, tableId);
    } else {
      this.publicTableIds.add(tableId);
    }

    const sent = await this.bot.telegram.sendMessage(
      chatId,
      this.waitingText(table, creatorId),
      {
        parse_mode: 'HTML',
        ...this.waitingMarkup(table, creatorId),
      }
    );
    player.messageId = sent.message_id;

    return {
      ok: true,
      table,
      inviteToken,
    };
  }

  async joinPublicTable(userId, username, chatId, tableId, ticketCount) {
    const table = this.getTableById(tableId);
    if (!table) return { ok: false, reason: 'table_not_found' };
    if (table.isPrivate) return { ok: false, reason: 'private_only' };
    return this.joinTable(userId, username, chatId, table, ticketCount, null);
  }

  async joinPrivateByToken(userId, username, chatId, token, ticketCount) {
    const table = this.getTableByInviteToken(token);
    if (!table) return { ok: false, reason: 'table_not_found' };
    return this.joinTable(userId, username, chatId, table, ticketCount, token);
  }

  async joinTable(userId, username, chatId, table, ticketCount, providedToken) {
    if (this.isInGame(userId)) {
      return { ok: false, reason: 'in_game' };
    }

    if (!Number.isInteger(ticketCount) || ticketCount < MIN_TICKETS || ticketCount > MAX_TICKETS) {
      return { ok: false, reason: 'invalid_tickets' };
    }

    if (table.status !== 'waiting') {
      return { ok: false, reason: 'table_unavailable' };
    }

    if (table.players.length >= table.maxPlayers) {
      return { ok: false, reason: 'table_full' };
    }

    if (table.players.some((p) => p.userId === userId)) {
      return { ok: false, reason: 'already_in_table' };
    }

    if (table.isPrivate && providedToken !== table.inviteToken) {
      return { ok: false, reason: 'private_only' };
    }

    const cost = table.bet * ticketCount;
    const user = this.userManager.getOrCreate(userId, username);
    if (user.balance < cost) {
      return { ok: false, reason: 'no_funds', needed: cost };
    }

    const deducted = this.userManager.deduct(userId, cost);
    if (!deducted) {
      return { ok: false, reason: 'no_funds', needed: cost };
    }
    this.userManager.addGame(userId);

    const player = {
      userId,
      username: user.username,
      chatId,
      ticketCount,
      messageId: null,
    };
    table.players.push(player);
    table.tickets.set(userId, this.generateTickets(ticketCount));
    this.playerToTableId.set(userId, table.id);

    const sent = await this.bot.telegram.sendMessage(
      chatId,
      this.waitingText(table, userId),
      {
        parse_mode: 'HTML',
        ...this.waitingMarkup(table, userId),
      }
    );
    player.messageId = sent.message_id;

    await this.broadcastWaiting(table);

    if (table.players.length === table.maxPlayers) {
      await this.startTable(table, 'auto');
    }

    return { ok: true, table };
  }

  async startTableByCreator(creatorId, tableId) {
    const table = this.getTableById(tableId);
    if (!table) return { ok: false, reason: 'table_not_found' };
    if (table.creatorId !== creatorId) return { ok: false, reason: 'not_creator' };
    if (table.players.length < MIN_PLAYERS) return { ok: false, reason: 'not_enough_players' };
    const started = await this.startTable(table, 'manual');
    if (!started) {
      return { ok: false, reason: 'table_unavailable' };
    }
    return { ok: true };
  }

  async startTable(table) {
    if (table.status !== 'waiting' || table.starting || table.ending) {
      return false;
    }

    table.starting = true;
    table.status = 'starting';

    await this.broadcastLocked(table);
    await this.sleep(1200);

    if (table.status !== 'starting') {
      table.starting = false;
      return false;
    }

    table.status = 'playing';
    table.starting = false;

    table.interval = setInterval(async () => {
      if (table.drawing || table.ending || table.status !== 'playing') {
        return;
      }
      table.drawing = true;
      try {
        await this.drawNumber(table);
      } finally {
        table.drawing = false;
      }
    }, DRAW_INTERVAL_MS);

    return true;
  }

  async drawNumber(table) {
    if (table.status !== 'playing') {
      return;
    }

    if (table.drawnNumbers.length >= MAX_NUMBER) {
      await this.endTable(table, null);
      return;
    }

    const number = this.generateUniqueNumber(table.drawnSet);
    table.drawnSet.add(number);
    table.drawnNumbers.push(number);

    const winner = this.checkWinner(table);
    if (winner) {
      await this.endTable(table, winner);
      return;
    }

    await this.broadcastGame(table);
  }

  generateUniqueNumber(drawnSet) {
    let next = Math.floor(Math.random() * MAX_NUMBER) + 1;
    while (drawnSet.has(next)) {
      next = Math.floor(Math.random() * MAX_NUMBER) + 1;
    }
    return next;
  }

  checkWinner(table) {
    for (const player of table.players) {
      const tickets = table.tickets.get(player.userId) || [];
      for (const ticket of tickets) {
        if (ticket.every((n) => table.drawnSet.has(n))) {
          return { player, ticket };
        }
      }
    }
    return null;
  }

  async endTable(table, winnerInfo) {
    if (table.ending) {
      return;
    }
    table.ending = true;
    table.status = 'finished';

    if (table.interval) {
      clearInterval(table.interval);
      table.interval = null;
    }

    const bank = table.players.reduce((acc, p) => acc + table.bet * p.ticketCount, 0);
    const commission = Math.round(bank * COMMISSION * 100) / 100;
    const prize = Math.round((bank - commission) * 100) / 100;

    if (winnerInfo) {
      this.userManager.addWin(winnerInfo.player.userId, prize);
    } else {
      for (const p of table.players) {
        const refund = table.bet * p.ticketCount;
        this.userManager.addBalance(p.userId, refund);
      }
    }

    for (const p of table.players) {
      if (!p.messageId) continue;
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.endText(table, p.userId, winnerInfo, bank, prize),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }

    this.cleanupTable(table);
  }

  cleanupTable(table) {
    if (table.interval) {
      clearInterval(table.interval);
      table.interval = null;
    }

    for (const p of table.players) {
      this.playerToTableId.delete(p.userId);
    }

    this.tablesById.delete(table.id);
    this.publicTableIds.delete(table.id);
    if (table.inviteToken) {
      this.inviteTokenToTableId.delete(table.inviteToken);
    }
  }

  generateTickets(count) {
    const tickets = [];
    for (let i = 0; i < count; i++) {
      tickets.push(this.generateOneTicket());
    }
    return tickets;
  }

  generateOneTicket() {
    const numbers = new Set();
    while (numbers.size < NUMBERS_PER_TICKET) {
      numbers.add(Math.floor(Math.random() * MAX_NUMBER) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b);
  }

  generateTableId() {
    let id = '';
    do {
      id = Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (this.tablesById.has(id));
    return id;
  }

  generateInviteToken() {
    let token = '';
    do {
      token = Math.random().toString(36).slice(2, 10).toUpperCase();
    } while (this.inviteTokenToTableId.has(token));
    return token;
  }

  waitingMarkup(table, forUserId) {
    if (table.creatorId !== forUserId) return {};
    if (table.status !== 'waiting') return {};
    if (table.players.length < MIN_PLAYERS) return {};

    const lang = this.userManager.getLanguage(forUserId);
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'start_btn'), callback_data: `start_table_${table.id}` }],
        ],
      },
    };
  }

  formatPlayers(table) {
    return table.players.map((p) => `- ${p.username}`).join('\n');
  }

  formatTicketsPlain(table, playerId, isMe, lang) {
    const player = table.players.find((p) => p.userId === playerId);
    const tickets = table.tickets.get(playerId) || [];
    const me = isMe ? t(lang, 'game.you') : '';
    let text = `👤 <b>${player.username}</b>${me}\n`;
    for (const ticket of tickets) {
      text += `🎟 ${ticket.join(' • ')}\n`;
    }
    return text;
  }

  formatTicketsLive(table, playerId, isMe, lang) {
    const player = table.players.find((p) => p.userId === playerId);
    const tickets = table.tickets.get(playerId) || [];
    const me = isMe ? t(lang, 'game.you') : '';
    let text = `👤 <b>${player.username}</b>${me}\n`;

    for (const ticket of tickets) {
      const rendered = ticket.map((n) => (table.drawnSet.has(n) ? `${n}✅` : `${n}❌`)).join(' ');
      const matches = ticket.filter((n) => table.drawnSet.has(n)).length;
      text += `🎟 ${rendered} → ${matches}/${NUMBERS_PER_TICKET}\n`;
    }

    return text;
  }

  waitingText(table, forUserId) {
    const lang = this.userManager.getLanguage(forUserId);
    const bank = table.players.reduce((acc, p) => acc + table.bet * p.ticketCount, 0);
    const privacy = table.isPrivate ? t(lang, 'game.privacy_prv') : t(lang, 'game.privacy_pub');
    let text =
      t(lang, 'game.waiting_title', { id: table.id, bet: table.bet }) + '\n' +
      `${privacy}\n` +
      `${t(lang, 'game.players_label')}: ${table.players.length}/${table.maxPlayers}\n` +
      `${t(lang, 'game.pot_label')}: <b>$${bank}</b>\n\n` +
      `${t(lang, 'game.players_list_label')}:\n${this.formatPlayers(table)}\n\n`;

    text += this.formatTicketsPlain(table, forUserId, true, lang) + '\n';
    for (const p of table.players) {
      if (p.userId === forUserId) continue;
      text += this.formatTicketsPlain(table, p.userId, false, lang) + '\n';
    }

    if (table.players.length < MIN_PLAYERS) {
      text += t(lang, 'game.need_more_players');
    } else {
      text += t(lang, 'game.waiting_start');
    }

    return text;
  }

  lockedText(table, forUserId) {
    const lang = this.userManager.getLanguage(forUserId);
    let text =
      t(lang, 'game.waiting_title', { id: table.id, bet: table.bet }) + '\n\n' +
      `${t(lang, 'game.players_list_label')}:\n${this.formatPlayers(table)}\n\n` +
      t(lang, 'game.locked_title') + '\n' +
      t(lang, 'game.starting') + '\n\n';

    text += this.formatTicketsPlain(table, forUserId, true, lang) + '\n';
    for (const p of table.players) {
      if (p.userId === forUserId) continue;
      text += this.formatTicketsPlain(table, p.userId, false, lang) + '\n';
    }

    return text;
  }

  gameText(table, forUserId) {
    const lang = this.userManager.getLanguage(forUserId);
    const bank = table.players.reduce((acc, p) => acc + table.bet * p.ticketCount, 0);
    const drawn = table.drawnNumbers.join(', ');

    let text =
      t(lang, 'game.waiting_title', { id: table.id, bet: table.bet }) + '\n' +
      `${t(lang, 'game.pot_label')}: <b>$${bank}</b>\n\n` +
      `${t(lang, 'game.drawn_label')}: <b>${drawn || '—'}</b>\n\n`;

    text += this.formatTicketsLive(table, forUserId, true, lang) + '\n';
    for (const p of table.players) {
      if (p.userId === forUserId) continue;
      text += this.formatTicketsLive(table, p.userId, false, lang) + '\n';
    }

    return text;
  }

  endText(table, forUserId, winnerInfo, bank, prize) {
    const lang = this.userManager.getLanguage(forUserId);
    const drawn = table.drawnNumbers.join(', ');
    let text = `🎮 <b>${t(lang, 'game.results_title')} #${table.id}</b>\n\n`;

    if (winnerInfo) {
      text += `${t(lang, 'game.winner_label')}: <b>${winnerInfo.player.username}</b>\n`;
      text += `${t(lang, 'game.winning_ticket')}: ${winnerInfo.ticket.join(' • ')}\n`;
      text += `${t(lang, 'game.pot_label')}: $${bank}\n`;
      text += `${t(lang, 'game.commission')}: $${Math.round(bank * COMMISSION * 100) / 100}\n`;
      text += `${t(lang, 'game.payout')}: <b>$${prize}</b>\n\n`;
      if (winnerInfo.player.userId === forUserId) {
        text += t(lang, 'game.you_won') + '\n\n';
      }
    } else {
      text += t(lang, 'game.no_winner') + '\n\n';
    }

    text += t(lang, 'game.all_numbers', { count: table.drawnNumbers.length, drawn }) + '\n\n';
    text += t(lang, 'game.again_hint');
    return text;
  }

  async broadcastWaiting(table) {
    for (const p of table.players) {
      if (!p.messageId) continue;
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.waitingText(table, p.userId),
          {
            parse_mode: 'HTML',
            ...this.waitingMarkup(table, p.userId),
          }
        );
      } catch (_) {}
    }
  }

  async broadcastLocked(table) {
    for (const p of table.players) {
      if (!p.messageId) continue;
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.lockedText(table, p.userId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }
  }

  async broadcastGame(table) {
    for (const p of table.players) {
      if (!p.messageId) continue;
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.gameText(table, p.userId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  shutdown() {
    for (const table of this.tablesById.values()) {
      if (table.interval) {
        clearInterval(table.interval);
      }
    }
    this.tablesById.clear();
    this.publicTableIds.clear();
    this.inviteTokenToTableId.clear();
    this.playerToTableId.clear();
  }
}

module.exports = GameManager;
