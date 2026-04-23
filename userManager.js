const crypto = require('crypto');

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
    const name = escapeHtml(rawName || 'Аноним');

    if (!this.users.has(userId)) {
      const user = {
        id: userId,
        username: name,
        balance: 10,
        referralCode: String(userId),
        totalSpent: 0,
        games: 0,
        wins: 0,
        lastClaim: null,
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

  claimBonus(userId) {
    const user = this.users.get(userId);
    if (!user) return { success: false };

    const now = new Date();
    if (user.lastClaim) {
      const last = new Date(user.lastClaim);
      if (
        now.getFullYear() === last.getFullYear() &&
        now.getMonth() === last.getMonth() &&
        now.getDate() === last.getDate()
      ) {
        return { success: false, reason: 'already_claimed' };
      }
    }

    user.balance = Math.round((user.balance + 1) * 100) / 100;
    user.lastClaim = now.toISOString();
    return { success: true, balance: user.balance };
  }

  getReferralLink(botUsername, userId) {
    return `https://t.me/${botUsername}?start=ref_${userId}`;
  }
}

module.exports = UserManager;
