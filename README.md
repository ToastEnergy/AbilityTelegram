# Ability Telegram Bot 🎯

A Telegram bot that helps you track abilities and points for users in your group.

## Features

- Track multiple abilities per group
- Award and remove points to/from users
- View leaderboards for each ability
- Admin-only ability management
- Inline button support for quick point adjustments

## Commands

- `/start` - Get a welcome message
- `/help` - Show all available commands
- `/info` - Get your user ID and chat ID
- `/create [ability]` - Create a new ability (admins only)
- `/remove [ability]` - Remove an ability (admins only)
- `/list` - List all abilities with pagination
- `/add [ability]` - Add a point to the replied user (reply to their message)
- `/leaderboard [ability]` - Show leaderboard for an ability

## Setup

### Environment Variables

Create a `.env` file with the following variables:

```
DATABASE_URL=postgresql://user:password@host:port/database
TOKEN=your_telegram_bot_token
```

### Using Docker

```bash
docker-compose up -d
```

### Running Migrations

```bash
npm run migrate up
```

### Starting the Bot

```bash
npm start
```

## Usage

1. Add the bot to your Telegram group
2. Admins can create abilities using `/create [ability name]`
3. Reply to a user's message and use `/add [ability name]` to award points
4. Use `/leaderboard [ability name]` to view rankings
5. Click the ➕/➖ buttons on point messages to adjust points

## License

This project is provided as-is without any specific license.