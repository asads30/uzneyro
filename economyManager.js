class EconomyManager {
  constructor(userManager) {
    this.userManager = userManager;
    this.pendingDeposits = new Map(); // pendingId -> { userId, status }
    this.depositCounter = 0;
  }

  getDepositInfo(userId) {
    const user = this.userManager.get(userId);
    if (!user) return null;
    return {
      address: user.depositAddress,
      balance: user.balance,
    };
  }

  createPendingDeposit(userId) {
    const user = this.userManager.get(userId);
    if (!user) return { ok: false, reason: 'no_user' };

    const pendingId = `dep_${++this.depositCounter}`;
    this.pendingDeposits.set(pendingId, {
      userId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    return { ok: true, pendingId };
  }

  confirmDeposit(userId, pendingId, amount) {
    const pending = this.pendingDeposits.get(pendingId);
    if (!pending || pending.userId !== userId) {
      return { ok: false, reason: 'invalid_pending' };
    }

    if (pending.status !== 'pending') {
      return { ok: false, reason: 'already_processed' };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }

    const result = this.userManager.applyDeposit(userId, amount, pendingId);
    if (!result.ok) {
      return result;
    }

    pending.status = 'confirmed';
    pending.amount = Math.round(amount * 100) / 100;
    pending.confirmedAt = new Date().toISOString();

    return {
      ok: true,
      amount: pending.amount,
      balance: result.balance,
      referralReward: result.referralReward,
    };
  }

  requestWithdraw(userId, address, amount) {
    const user = this.userManager.get(userId);
    if (!user) return { ok: false, reason: 'no_user' };

    if (!address || typeof address !== 'string' || address.length < 5) {
      return { ok: false, reason: 'invalid_address' };
    }

    if (!amount || amount <= 0) {
      return { ok: false, reason: 'invalid_amount' };
    }

    if (user.balance < amount) {
      return { ok: false, reason: 'no_funds' };
    }

    user.balance = Math.round((user.balance - amount) * 100) / 100;

    const request = {
      id: user.withdrawRequests.length + 1,
      amount,
      address,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    user.withdrawRequests.push(request);
    return { ok: true, request };
  }

  getWithdrawHistory(userId) {
    const user = this.userManager.get(userId);
    if (!user) return [];
    return user.withdrawRequests;
  }
}

module.exports = EconomyManager;
