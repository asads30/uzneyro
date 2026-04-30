# Telegram Lottery Bot (MVP)

A multiplayer Telegram lottery bot with public and private tables, referrals and a basic economy.

Stack:
- Node.js
- telegraf
- in-memory storage (Map)

## Install

```bash
npm install
```

## Configure

1. Create a bot via @BotFather.
2. Create a `.env` file in the project root:

```env
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
CHANNEL_URL=https://t.me/your_channel
```

`CHANNEL_URL` is the link shown in the «📖 Instruction» section.

## Run

```bash
npm start
```

## Structure

| File | Purpose |
|---|---|
| bot.js | Entry point, commands and callback flows |
| gameManager.js | Tables, joining, auto/manual start, game loop |
| userManager.js | Profiles, balance, bonuses, referrals |
| economyManager.js | MVP deposit and withdrawal |

## Main menu

```text
🎮 Create table    📋 Public tables
💰 Balance         🎁 Bonus
👥 Referrals       📥 Deposit
📤 Withdraw        📖 Instruction
```

## Creating a table

The flow is:
1. Bet: $1, $5, $10, or any custom whole-dollar amount (entered manually).
2. Number of players: 2..6.
3. Type: public or private.
4. Number of tickets for yourself: any positive integer (entered manually).

Notes:
- A user can only be at one table at a time.
- A full table cannot be joined.
- Table parameters cannot be changed after creation.
- A private table can only be joined via a link of the form:
  `https://t.me/<bot_username>?start=table_<TOKEN>`
- Public tables are listed in «📋 Public tables».

## Starting a game

Both modes are supported:
- Auto-start when the table fills up (`players.length === maxPlayers`).
- Manual start with the «🚀 Start game» button (creator only, minimum 2 players).

Before starting, all players and tickets are shown, then tickets are locked.

## Game logic

- Each player has one or more tickets (positive integer).
- Each ticket: 5 unique numbers from 1..30.
- A new unique number is drawn every 2 seconds.
- The view is updated live for all players.
- The first player whose ticket fully matches the drawn numbers wins.

Payout:
- Pot = sum of all bets at the table.
- Commission = 5%.
- Prize = pot − commission.

If the deck is exhausted with no winner, all bets are refunded.

## Starter bonus

The $10 starter bonus is granted only to the following Telegram user IDs:

- 386567097
- 386567098

Other users start with a $0 balance and need to make a deposit (or claim the daily bonus) to play.

## Referrals

- Start parameter support: `/start ref_<userId>`.
- Each user has a `referralCode` (equal to their `userId`) and a `referredBy` field.
- The referrer earns a fixed $0.05 for every successful deposit by their referral.
- Referral rewards are not duplicated for the same deposit event.

The «👥 Referrals» screen shows:
- Number of invited users.
- Total earnings.
- Personal referral link.

## Deposit (MVP)

1. Tap «📥 Deposit».
2. The bot shows a deposit address.
3. Tap «✅ I have paid».
4. Enter the amount.
5. Balance is credited immediately (simulation).

## Limitations (MVP)

- Data is kept in process memory (no database).
- All data is reset on restart.
