class EconomyManager {
  constructor(userManager) {
    this.userManager = userManager;
  }

  getDepositInfo(userId) {
    const user = this.userManager.get(userId);
    if (!user) return null;
    return {
      address: user.depositAddress,
      balance: user.balance,
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
