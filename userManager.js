const crypto = require('crypto');
const { DEFAULT_LANG, normalizeLang } = require('./i18n');

// Users who receive the $10 starter bonus on registration.
const STARTER_BONUS_USER_IDS = new Set([8760094634]);
const STARTER_BONUS_AMOUNT = 100;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateDepositAddress() {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

class UserManager {
  constructor() {
    this.users = new Map();
    this.processedReferralEvents = new Set();
  }

  getOrCreate(userId, rawName, referrerId) {
    const name = escapeHtml(rawName || 'Anonymous');

    if (!this.users.has(userId)) {
      const startingBalance = STARTER_BONUS_USER_IDS.has(userId) ? STARTER_BONUS_AMOUNT : 0;

      const user = {
        id: userId,
        username: name,
        language: DEFAULT_LANG,
        balance: startingBalance,
        referralCode: String(userId),
        totalSpent: 0,
        games: 0,
        wins: 0,
        banned: false,
        createdAt: new Date().toISOString(),
        // Referral
        referredBy: null,
        referrals: [],
        referralEarnings: 0,
        // Crypto
        depositAddress: generateDepositAddress(),
        withdrawRequests: [],
      };

      // Process referral
      if (referrerId && referrerId !== userId && this.users.has(referrerId)) {
        user.referredBy = referrerId;
        const referrer = this.users.get(referrerId);
        referrer.referrals.push(userId);
      }

      this.users.set(userId, user);
    }

    const user = this.users.get(userId);
    user.username = name;
    return user;
  }

  get(userId) {
    return this.users.get(userId) || null;
  }

  deduct(userId, amount) {
    const user = this.users.get(userId);
    if (!user || user.balance < amount) return false;
    user.balance = Math.round((user.balance - amount) * 100) / 100;
    user.totalSpent = Math.round((user.totalSpent + amount) * 100) / 100;
    return true;
  }

  addBalance(userId, amount) {
    const user = this.users.get(userId);
    if (!user) return;
    user.balance = Math.round((user.balance + amount) * 100) / 100;
  }

  addGame(userId) {
    const user = this.users.get(userId);
    if (user) user.games++;
  }

  addWin(userId, prize) {
    const user = this.users.get(userId);
    if (!user) return;
    user.wins++;
    user.balance = Math.round((user.balance + prize) * 100) / 100;
  }

  /**
   * Add deposit and pay fixed referral reward once per deposit event.
   */
  applyDeposit(userId, amount, eventId) {
    const user = this.users.get(userId);
    if (!user || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }

    const normalizedEventId = String(eventId || '');
    if (!normalizedEventId) {
      return { ok: false, reason: 'invalid_event' };
    }

    this.addBalance(userId, amount);

    let referralReward = 0;
    if (user.referredBy && !this.processedReferralEvents.has(normalizedEventId)) {
      const referrer = this.users.get(user.referredBy);
      if (referrer) {
        referralReward = 0.05;
        referrer.balance = Math.round((referrer.balance + referralReward) * 100) / 100;
        referrer.referralEarnings = Math.round((referrer.referralEarnings + referralReward) * 100) / 100;
        this.processedReferralEvents.add(normalizedEventId);
      }
    }

    return {
      ok: true,
      balance: user.balance,
      referralReward,
      referredBy: user.referredBy,
    };
  }

  setBalance(userId, amount) {
    const user = this.users.get(userId);
    if (!user || !Number.isFinite(amount) || amount < 0) return false;
    user.balance = Math.round(amount * 100) / 100;
    return true;
  }

  setBanned(userId, banned) {
    const user = this.users.get(userId);
    if (!user) return false;
    user.banned = !!banned;
    return true;
  }

  isBanned(userId) {
    const user = this.users.get(userId);
    return !!(user && user.banned);
  }

  getLanguage(userId) {
    const user = this.users.get(userId);
    return normalizeLang(user && user.language);
  }

  setLanguage(userId, lang) {
    const user = this.users.get(userId);
    if (!user) return false;
    user.language = normalizeLang(lang);
    return true;
  }

  deductBalance(userId, amount) {
    const user = this.users.get(userId);
    if (!user || !Number.isFinite(amount) || amount <= 0) return false;
    if (user.balance < amount) return false;
    user.balance = Math.round((user.balance - amount) * 100) / 100;
    return true;
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  getStats() {
    const users = this.getAllUsers();
    let totalBalance = 0;
    let totalSpent = 0;
    let totalGames = 0;
    let totalWins = 0;
    let banned = 0;
    let withReferrer = 0;
    const byLang = { ru: 0, uz: 0, en: 0 };
    for (const u of users) {
      totalBalance += u.balance;
      totalSpent += u.totalSpent;
      totalGames += u.games;
      totalWins += u.wins;
      if (u.banned) banned++;
      if (u.referredBy) withReferrer++;
      const lang = normalizeLang(u.language);
      byLang[lang] = (byLang[lang] || 0) + 1;
    }
    return {
      users: users.length,
      banned,
      withReferrer,
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalSpent: Math.round(totalSpent * 100) / 100,
      totalGames,
      totalWins,
      byLang,
    };
  }

  getPendingWithdraws() {
    const result = [];
    for (const u of this.getAllUsers()) {
      for (const r of u.withdrawRequests) {
        if (r.status === 'pending') {
          result.push({ userId: u.id, username: u.username, request: r });
        }
      }
    }
    return result;
  }

  findWithdraw(userId, requestId) {
    const user = this.users.get(userId);
    if (!user) return null;
    return user.withdrawRequests.find((r) => r.id === requestId) || null;
  }

  approveWithdraw(userId, requestId) {
    const req = this.findWithdraw(userId, requestId);
    if (!req || req.status !== 'pending') return false;
    req.status = 'approved';
    req.processedAt = new Date().toISOString();
    return true;
  }

  rejectWithdraw(userId, requestId) {
    const user = this.users.get(userId);
    if (!user) return false;
    const req = user.withdrawRequests.find((r) => r.id === requestId);
    if (!req || req.status !== 'pending') return false;
    req.status = 'rejected';
    req.processedAt = new Date().toISOString();
    user.balance = Math.round((user.balance + req.amount) * 100) / 100;
    return true;
  }

  getReferralLink(botUsername, userId) {
    return `https://t.me/${botUsername}?start=ref_${userId}`;
  }
}

module.exports = UserManager;
