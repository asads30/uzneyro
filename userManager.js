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
  }

  getOrCreate(userId, rawName, referrerId) {
    const name = escapeHtml(rawName || 'Аноним');

    if (!this.users.has(userId)) {
      const user = {
        id: userId,
        username: name,
        balance: 10,
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

  /** Pay 2% referral reward when a referred user plays */
  payReferralReward(playerId, betAmount) {
    const player = this.users.get(playerId);
    if (!player || !player.referredBy) return;
    const referrer = this.users.get(player.referredBy);
    if (!referrer) return;
    const reward = Math.round(betAmount * 0.02 * 100) / 100;
    if (reward <= 0) return;
    referrer.balance = Math.round((referrer.balance + reward) * 100) / 100;
    referrer.referralEarnings = Math.round((referrer.referralEarnings + reward) * 100) / 100;
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
