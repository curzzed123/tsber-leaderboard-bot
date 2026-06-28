# TSBER Leaderboard & Challenge Ticket Bot

Advanced Discord bot with real-time dynamic leaderboard, Elo-style ranking challenges, and automated ticket flow management.

## Features

- **Real-Time Dynamic Leaderboard** — Single message edited in-place (no spam)
- **Smooth Moving Rank Logic** — Winner takes opponent's rank; everyone between shifts down
- **Interactive Challenge System** — Persistent [Create] and [Challenge] buttons
- **Automated Ticket Flow** — Private channels with dodge timers, inactivity detection, and auto-resolution
- **Rover API Integration** — Roblox username & avatar verification
- **Data-Driven Range Rules** — Tunable challenge range validation without code changes
- **Staff Commands** — `/forcewin`, `/setrank`, `/approve-loa`, `/freeze-timer`, `/close-ticket`

## Requirements

- Node.js 18+ (tested on Node 24)
- MongoDB (standalone or Atlas)
- Discord Bot Token with **Message Content** privileged intent enabled

## Setup

1. **Clone & Install**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   Fill in your `.env` with:
   - `DISCORD_TOKEN` — Your bot token
   - `GUILD_ID` — Dev guild ID (for instant slash command registration)
   - `MONGODB_URI` — MongoDB connection string
   - `LEADERBOARD_CHANNEL_ID` — Channel for the leaderboard message
   - `TICKETS_CHANNEL_ID` — Channel for the persistent [Create]/[Challenge] panel
   - `TICKETS_CATEGORY_ID` — Category for created ticket channels
   - `REFEREES_ROLE_ID` — Role to ping on new tickets
   - `STAFF_ROLE_IDS` — Comma-separated staff role IDs (for admin commands)

3. **Enable Privileged Intents**
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your bot → **Bot** tab
   - Enable **Message Content Intent** (required for inactivity tracking)

4. **Run**
   ```bash
   # Development (hot reload)
   npm run dev

   # Production
   npm run build
   npm start
   ```

## Challenge Range Rules

The range rules are data-driven and configurable in `src/config/rangeRules.ts`:

| Challenger Rank | Allowed Targets |
|----------------|-----------------|
| 1-10           | 1 position above |
| 11-12          | Ranks 9-10 (break into Top 10) |
| 13-60          | Up to 3 positions above |
| 61+            | Up to 3 positions above |

## Match Outcomes

### Challenger Wins
- Takes opponent's higher rank slot
- Everyone between shifts down by 1
- Loser drops 1 position, no cooldown/immunity
- Loser can't re-challenge winner for 3 days

### Challenger Loses
- Keeps original rank
- Gets 3-day cooldown (1 week if Top 10)
- Opponent gets 3-day immunity (1 week if Top 10)
- Can't re-challenge the same opponent for 3 days

## Timer System

| Timer | Duration | Action |
|-------|----------|--------|
| Dodge | 48 hours | Auto-win to challenger if opponent doesn't respond |
| Inactivity | 3 days | Auto-close as invalid if no messages |
| Cooldown | 3 days (1wk Top 10) | Block challenging |
| Immunity | 3 days (1wk Top 10) | Block being challenged |
| Lockout | 3 days | Block re-challenging same opponent |

Timers use **persistent absolute deadlines** with a 60-second sweep — they survive bot restarts and crashes.

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/forcewin [user]` | Force a win for a user in an active ticket | Staff |
| `/setrank [user] [rank]` | Set a player's rank position | Staff |
| `/approve-loa [user] [days] [reason]` | Approve a Leave of Absence | Staff |
| `/freeze-timer [freeze]` | Freeze/unfreeze ticket timers | Referee/Staff |
| `/close-ticket [outcome] [reason]` | Close ticket and report result | Referee/Staff |

## Architecture

```
src/
├── index.ts              # Entry point
├── bot.ts                # Client setup & intents
├── config/               # Env config & range rules
├── database/             # Mongoose models (Player, Ticket, GuildConfig)
├── events/               # Discord event handlers
├── commands/             # Slash command definitions
├── components/           # Button, modal, select menu handlers
├── services/             # Core business logic
└── utils/                # Embeds, formatting, logger, mutex
```

## License

MIT
