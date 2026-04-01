const ROOM_CONFIGS = {
  1:  { bet: 1,  minPlayers: 2, maxPlayers: 5, label: '🟢 $1' },
  5:  { bet: 5,  minPlayers: 2, maxPlayers: 5, label: '🔵 $5' },
  10: { bet: 10, minPlayers: 2, maxPlayers: 5, label: '🔴 $10' },
};

const MAX_TICKETS = 10;
const NUMBERS_PER_TICKET = 5;
const MAX_NUMBER = 30;
const COMMISSION = 0.05; // 5%
const DRAW_INTERVAL_MS = 2000;

class GameManager {
  constructor(userManager, bot) {
    this.userManager = userManager;
    this.bot = bot;
    this.rooms = new Map();
    this.playerRooms = new Map(); // userId → roomId
    this.roomCounter = 0;
  }

  isInGame(userId) {
    return this.playerRooms.has(userId);
  }

  getCost(bet, ticketCount) {
    return bet * ticketCount;
  }

  // --- Room lifecycle ---

  findOpenRoom(bet) {
    for (const room of this.rooms.values()) {
      if (room.bet === bet && !room.locked && room.players.length < room.maxPlayers) {
        return room;
      }
    }
    return null;
  }

  createRoom(bet) {
    const cfg = ROOM_CONFIGS[bet];
    if (!cfg) return null;

    const room = {
      id: ++this.roomCounter,
      bet: cfg.bet,
      minPlayers: cfg.minPlayers,
      maxPlayers: cfg.maxPlayers,
      label: cfg.label,
      players: [],
      tickets: new Map(),     // userId → [[n,n,n,n,n], ...]
      drawnNumbers: [],
      interval: null,
      active: false,
      locked: false,
      drawing: false,
      fillTimer: null,        // timer to start game when minPlayers reached
    };

    this.rooms.set(room.id, room);
    return room;
  }

  cleanup(room) {
    if (room.interval) clearInterval(room.interval);
    if (room.fillTimer) clearTimeout(room.fillTimer);
    room.interval = null;
    room.fillTimer = null;
    for (const p of room.players) {
      this.playerRooms.delete(p.userId);
    }
    this.rooms.delete(room.id);
  }

  // --- Join flow ---

  async joinRoom(userId, username, chatId, bet, ticketCount) {
    if (this.isInGame(userId)) {
      return { ok: false, reason: 'in_game' };
    }

    if (!ROOM_CONFIGS[bet]) {
      return { ok: false, reason: 'invalid_bet' };
    }

    if (!Number.isInteger(ticketCount) || ticketCount < 1 || ticketCount > MAX_TICKETS) {
      return { ok: false, reason: 'invalid_tickets' };
    }

    const cost = this.getCost(bet, ticketCount);
    const user = this.userManager.getOrCreate(userId, username);
    if (user.balance < cost) {
      return { ok: false, reason: 'no_funds', needed: cost };
    }

    // Deduct balance
    this.userManager.deduct(userId, cost);
    this.userManager.addGame(userId);
    // Pay referral reward
    this.userManager.payReferralReward(userId, cost);

    const room = this.findOpenRoom(bet) || this.createRoom(bet);
    const tickets = this.generateTickets(ticketCount);

    room.tickets.set(userId, tickets);
    const player = { userId, username, chatId, ticketCount, messageId: null };
    room.players.push(player);
    this.playerRooms.set(userId, room.id);

    // Send waiting message to new player
    const msg = await this.bot.telegram.sendMessage(
      chatId,
      this.waitingText(room, userId),
      { parse_mode: 'HTML' }
    );
    player.messageId = msg.message_id;

    // Update waiting messages for others
    await this.editWaitingForOthers(room, userId);

    // Check if room is full → start immediately
    if (room.players.length >= room.maxPlayers && !room.active) {
      if (room.fillTimer) { clearTimeout(room.fillTimer); room.fillTimer = null; }
      await this.startGame(room);
    }
    // If minimum players reached, start countdown
    else if (room.players.length >= room.minPlayers && !room.active && !room.fillTimer) {
      room.fillTimer = setTimeout(async () => {
        room.fillTimer = null;
        if (!room.active && room.players.length >= room.minPlayers) {
          await this.startGame(room);
        }
      }, 15000); // 15 seconds for more players to join
    }

    return { ok: true };
  }

  // --- Ticket generation ---

  generateTickets(count) {
    const tickets = [];
    for (let i = 0; i < count; i++) {
      tickets.push(this.generateOneTicket());
    }
    return tickets;
  }

  generateOneTicket() {
    const nums = new Set();
    while (nums.size < NUMBERS_PER_TICKET) {
      nums.add(Math.floor(Math.random() * MAX_NUMBER) + 1);
    }
    return [...nums].sort((a, b) => a - b);
  }

  // --- Game loop ---

  async startGame(room) {
    room.locked = true;
    room.active = true;

    // Show locked tickets
    for (const p of room.players) {
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.lockedText(room, p.userId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }

    // Pause before drawing
    await new Promise((r) => setTimeout(r, 3000));

    room.interval = setInterval(async () => {
      if (room.drawing) return;
      room.drawing = true;
      try {
        await this.drawNumber(room);
      } finally {
        room.drawing = false;
      }
    }, DRAW_INTERVAL_MS);
  }

  async drawNumber(room) {
    const available = [];
    for (let i = 1; i <= MAX_NUMBER; i++) {
      if (!room.drawnNumbers.includes(i)) available.push(i);
    }

    if (!available.length) {
      await this.endGame(room, null);
      return;
    }

    const num = available[Math.floor(Math.random() * available.length)];
    room.drawnNumbers.push(num);

    const winner = this.checkWinner(room);
    if (winner) {
      await this.endGame(room, winner);
    } else {
      await this.broadcastState(room);
    }
  }

  checkWinner(room) {
    for (const p of room.players) {
      const tickets = room.tickets.get(p.userId);
      for (const ticket of tickets) {
        if (ticket.every((n) => room.drawnNumbers.includes(n))) {
          return p;
        }
      }
    }
    return null;
  }

  async endGame(room, winner) {
    clearInterval(room.interval);
    room.interval = null;

    const totalTickets = room.players.reduce((s, p) => s + p.ticketCount, 0);
    const bank = room.bet * totalTickets;
    const commission = Math.round(bank * COMMISSION * 100) / 100;
    const prize = Math.round((bank - commission) * 100) / 100;

    if (winner) {
      this.userManager.addWin(winner.userId, prize);
    }

    for (const p of room.players) {
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.endText(room, winner, bank, prize, p.userId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }

    this.cleanup(room);
  }

  // --- Message builders ---

  /** Format tickets in waiting/locked phase (plain numbers) */
  formatPlayerTicketsPlain(room, playerId, isMe) {
    const tickets = room.tickets.get(playerId);
    const player = room.players.find((p) => p.userId === playerId);
    const tag = isMe ? ' (ты)' : '';
    let text = `👤 <b>${player.username}</b>${tag}\n`;

    for (const ticket of tickets) {
      text += `🎟 ${ticket.join(' • ')}\n`;
    }

    return text;
  }

  /** Format tickets during game with per-number ✅/❌ */
  formatPlayerTicketsLive(room, playerId, isMe) {
    const tickets = room.tickets.get(playerId);
    const player = room.players.find((p) => p.userId === playerId);
    const tag = isMe ? ' (ты)' : '';
    let text = `👤 <b>${player.username}</b>${tag}:\n`;

    for (const ticket of tickets) {
      const numsStr = ticket
        .map((n) => (room.drawnNumbers.includes(n) ? `${n}✅` : `${n}❌`))
        .join(' ');
      const matched = ticket.filter((n) => room.drawnNumbers.includes(n)).length;
      const icon = matched === NUMBERS_PER_TICKET ? '🏆' : matched > 0 ? '🔶' : '⬜';
      text += `🎟 ${numsStr} → ${icon} ${matched}/${NUMBERS_PER_TICKET}\n`;
    }

    return text;
  }

  waitingText(room, forUserId) {
    const totalTickets = room.players.reduce((s, p) => s + p.ticketCount, 0);
    const bank = room.bet * totalTickets;

    let text =
      `🎮 <b>Комната ${room.label}</b> (ожидание)\n` +
      `👥 Игроки: ${room.players.length}/${room.maxPlayers}\n` +
      `💰 Банк: <b>$${bank}</b>\n\n`;

    text += this.formatPlayerTicketsPlain(room, forUserId, true) + '\n';

    for (const p of room.players) {
      if (p.userId === forUserId) continue;
      text += this.formatPlayerTicketsPlain(room, p.userId, false) + '\n';
    }

    text += `⏳ Ожидание игроков...`;
    if (room.fillTimer) {
      text += `\n⏱ Игра начнётся скоро, ждём ещё игроков...`;
    }
    return text;
  }

  lockedText(room, forUserId) {
    const totalTickets = room.players.reduce((s, p) => s + p.ticketCount, 0);
    const bank = room.bet * totalTickets;

    let text =
      `🎮 <b>Комната ${room.label}</b>\n` +
      `👥 ${room.players.length} игроков | 💰 Банк: <b>$${bank}</b>\n\n`;

    text += this.formatPlayerTicketsPlain(room, forUserId, true) + '\n';

    for (const p of room.players) {
      if (p.userId === forUserId) continue;
      text += this.formatPlayerTicketsPlain(room, p.userId, false) + '\n';
    }

    text += `🔒 <b>Билеты зафиксированы. Игра начинается!</b>`;
    return text;
  }

  gameText(room, forUserId) {
    const drawn = room.drawnNumbers.join(', ');
    const totalTickets = room.players.reduce((s, p) => s + p.ticketCount, 0);
    const bank = room.bet * totalTickets;

    let text =
      `🎮 <b>Комната ${room.label}</b> | 💰 Банк: $${bank}\n\n` +
      `🔢 Выпало: <b>${drawn || '—'}</b>\n\n`;

    text += this.formatPlayerTicketsLive(room, forUserId, true) + '\n';

    for (const p of room.players) {
      if (p.userId === forUserId) continue;
      text += this.formatPlayerTicketsLive(room, p.userId, false) + '\n';
    }

    return text;
  }

  endText(room, winner, bank, prize, forUserId) {
    const drawn = room.drawnNumbers.join(', ');
    let text = `🎮 <b>Комната ${room.label}</b> — ИТОГИ\n\n`;

    if (winner) {
      const winTickets = room.tickets.get(winner.userId);
      const winTicket = winTickets.find((t) =>
        t.every((n) => room.drawnNumbers.includes(n))
      );
      const winTicketStr = winTicket ? winTicket.join(' • ') : '';

      text += `🏆 <b>Победитель: ${winner.username}</b>\n`;
      text += `🎟 Билет: [${winTicketStr}]\n`;
      text += `💰 Банк: $${bank} | Комиссия: 5%\n`;
      text += `💵 Выигрыш: <b>$${prize}</b>\n\n`;

      if (winner.userId === forUserId) {
        text += `🎉 <b>Поздравляем, ты выиграл!</b>\n\n`;
      }
    } else {
      text += `😔 Ничья — победитель не определён. Ставки возвращены.\n\n`;
      // Refund all players on draw
      for (const p of room.players) {
        const refund = room.bet * p.ticketCount;
        this.userManager.addBalance(p.userId, refund);
      }
    }

    text += `🔢 Все числа (${room.drawnNumbers.length}): ${drawn}\n\n`;
    text += `Нажми <b>🎮 Играть</b> для новой игры`;
    return text;
  }

  // --- Broadcast helpers ---

  async editWaitingForOthers(room, excludeUserId) {
    for (const p of room.players) {
      if (p.userId === excludeUserId || !p.messageId) continue;
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.waitingText(room, p.userId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }
  }

  async broadcastState(room) {
    for (const p of room.players) {
      try {
        await this.bot.telegram.editMessageText(
          p.chatId,
          p.messageId,
          null,
          this.gameText(room, p.userId),
          { parse_mode: 'HTML' }
        );
      } catch (_) {}
    }
  }

  // --- Shutdown ---

  shutdown() {
    for (const room of this.rooms.values()) {
      if (room.interval) clearInterval(room.interval);
      if (room.fillTimer) clearTimeout(room.fillTimer);
    }
    this.rooms.clear();
    this.playerRooms.clear();
  }
}

module.exports = GameManager;
