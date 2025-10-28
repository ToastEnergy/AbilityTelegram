import TelegramBot, { InlineQueryResultArticle } from "node-telegram-bot-api";
import postgres from "postgres";

if (!process.env.DATABASE_URL || !process.env.TOKEN) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
const bot = new TelegramBot(process.env.TOKEN, { polling: true });

console.log('🤖 Ability Telegram Bot starting...');

bot.onText(/\/start/, async (msg) => {
    const welcomeMessage = `Welcome to Ability Telegram Bot! 🎯

This bot helps you track abilities and points for users in your group.

Use /help to see all available commands.`;
    
    await bot.sendMessage(msg.chat.id, welcomeMessage, { reply_to_message_id: msg.message_id });
});

bot.onText(/\/help/, async (msg) => {
    const helpMessage = `<b>Available Commands:</b>

<b>/info</b> - Get your user ID and chat ID
<b>/create [ability]</b> - Create a new ability (admins only)
<b>/remove [ability]</b> - Remove an ability (admins only)
<b>/list</b> - List all abilities
<b>/add [ability]</b> - Add a point to the replied user
<b>/leaderboard [ability]</b> - Show leaderboard for an ability

<i>Note: To add points, reply to a user's message and use /add [ability]</i>`;
    
    await bot.sendMessage(msg.chat.id, helpMessage, { 
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML' 
    });
});

bot.onText(/\/info/, async (msg) => {
    await bot.sendMessage(msg.chat.id, `User ID: <code>${msg.from!.id}</code>\nChat ID: <code>${msg.chat.id}</code>`, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' });
});

bot.onText(/^\/add(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
    try {
        if (!msg.reply_to_message?.from) {
            await bot.sendMessage(msg.chat.id, 'Please reply to a message', { reply_to_message_id: msg.message_id });
            return;
        }

        if (!match || !match[1]) {
            await bot.sendMessage(msg.chat.id, 'Please specify an ability', { reply_to_message_id: msg.message_id });
            return;
        }

        if (msg.reply_to_message?.from.id == msg.from!.id) {
            await bot.sendMessage(msg.chat.id, 'You cannot add points to yourself', { reply_to_message_id: msg.message_id });
            return;
        }

        const abilities = await sql`SELECT id, name FROM abilities WHERE group_id = ${msg.chat.id} AND name = ${match![1]}`;
        if (abilities.length == 0) {
            await bot.sendMessage(msg.chat.id, `Ability <b>${match![1]}</b> does not exist`, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' });
            return;
        }

        const points = await sql`INSERT INTO points (user_id, ability_id, group_id, points) VALUES (${msg.reply_to_message.from!.id}, ${abilities[0].id}, ${msg.chat.id}, 1) ON CONFLICT (user_id, ability_id, group_id) DO UPDATE SET points = points.points + 1 RETURNING points.points`;

        const recipientName = msg.reply_to_message.from.username 
            ? `@${msg.reply_to_message.from.username}` 
            : (msg.reply_to_message.from.first_name || `User ${msg.reply_to_message.from.id}`);
        
        const adderName = msg.from!.username 
            ? `@${msg.from!.username}` 
            : (msg.from!.first_name || `User ${msg.from!.id}`);

        const sent = await bot.sendMessage(msg.chat.id, `Added 1 <b>${match![1]}</b> point to ${recipientName}\nThey now have <b>${points[0].points}</b> points\n\nAdded by: ${adderName}`, {
            reply_to_message_id: msg.message_id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '➕',
                            callback_data: `add_point-${abilities[0].id}-${msg.reply_to_message.from!.id}`
                        },
                        {
                            text: '➖',
                            callback_data: `remove_point-${abilities[0].id}-${msg.reply_to_message.from!.id}`
                        }
                    ]
                ]
            }
        });
        const users = [
            {
                id: msg.from!.id,
                username: msg.from!.username,
                first_name: msg.from!.first_name
            }
        ]

        await sql`INSERT INTO messages (message_id, chat_id, users) VALUES (${sent.message_id}, ${sent.chat.id}, ${JSON.stringify(users)})`;
    } catch (error) {
        console.error('Error in /add command:', error);
        await bot.sendMessage(msg.chat.id, 'An error occurred while adding the point. Please try again.', { reply_to_message_id: msg.message_id });
    }
});


type Ability = { id: number, name: string };

bot.onText(/^\/leaderboard(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
    try {
        if (!match || !match[1]) {
            const abilities = await sql`SELECT id, name FROM abilities WHERE group_id = ${msg.chat.id}` as Ability[];

            const chunks: Ability[][] = [];
            for (let i = 0; i < abilities.length; i += 3)
                chunks.push(abilities.slice(i, i + 3));

            await bot.sendMessage(msg.chat.id, 'Please specify an ability', {
                reply_to_message_id: msg.message_id,
                reply_markup: {
                    inline_keyboard: chunks.map(chunk => chunk.map(ability => ({
                        text: ability.name,
                        callback_data: `leaderboard-${ability.id}`
                    })))
                }
            });
            return;
        }

        const abilities = await sql`SELECT id, name FROM abilities WHERE group_id = ${msg.chat.id} AND name = ${match![1]}`;
        if (abilities.length == 0) {
            await bot.sendMessage(msg.chat.id, `Ability <b>${match![1]}</b> does not exist`, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' });
            return;
        }

        const points = await sql`SELECT user_id, points FROM points WHERE ability_id = ${abilities[0].id} AND group_id = ${msg.chat.id} ORDER BY points DESC`;

        let leaderboard = '';

        if (points.length === 0) {
            leaderboard = '<i>No points yet for this ability</i>';
        } else {
            for (const point of points) {
                try {
                    const info = await bot.getChatMember(msg.chat.id, point.user_id);
                    if (info.user) {
                        const userName = info.user.username 
                            ? `@${info.user.username}` 
                            : (info.user.first_name || `User ${info.user.id}`);
                        leaderboard += `${userName}: ${point.points}\n`;
                    } else {
                        leaderboard += `<b>${point.user_id}</b>: ${point.points}\n`;
                    }
                } catch {
                    leaderboard += `<b>${point.user_id}</b>: ${point.points}\n`;
                }
            }
        }

        await bot.sendMessage(msg.chat.id, `<b>${match![1]}</b> <u>leaderboard:</u>\n\n${leaderboard}`, {
            reply_to_message_id: msg.message_id,
            parse_mode: 'HTML',
            disable_notification: true
        });
    } catch (error) {
        console.error('Error in /leaderboard command:', error);
        await bot.sendMessage(msg.chat.id, 'An error occurred while fetching the leaderboard. Please try again.', { reply_to_message_id: msg.message_id });
    }
});

bot.onText(/^\/create(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
    try {
        if (["group", "supergroup"].indexOf(msg.chat.type) === -1) {
            bot.sendMessage(msg.chat.id, 'You are not in a group!');
            return
        }

        const admins = await bot.getChatAdministrators(msg.chat.id);
        const isAdmin = admins.some(admin => admin.user.id == msg.from!.id);

        if (!isAdmin) {
            bot.sendMessage(msg.chat.id, 'Only admins can use this command!');
            return
        }

        if (!match || !match[1]) {
            await bot.sendMessage(msg.chat.id, 'Please specify an ability', { reply_to_message_id: msg.message_id });
            return;
        }

        const ability = match[1].trim();
        
        // Validate ability name
        if (ability.length === 0) {
            await bot.sendMessage(msg.chat.id, 'Ability name cannot be empty', { reply_to_message_id: msg.message_id });
            return;
        }
        
        if (ability.length > 100) {
            await bot.sendMessage(msg.chat.id, 'Ability name is too long (max 100 characters)', { reply_to_message_id: msg.message_id });
            return;
        }
        
        try {
            await sql`INSERT INTO abilities (group_id, name) VALUES (${msg.chat.id}, ${ability})`;
        } catch (e) {
            if (e.code === '23505')
                await bot.sendMessage(msg.chat.id, `Ability ${ability} already exists`, { reply_to_message_id: msg.message_id });
            else
                await bot.sendMessage(msg.chat.id, 'Something went wrong', { reply_to_message_id: msg.message_id });
            return;
        }
        await bot.sendMessage(msg.chat.id, `Added ability <b>${ability}</b>`, {
            reply_to_message_id: msg.message_id,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Error in /create command:', error);
        await bot.sendMessage(msg.chat.id, 'An error occurred while creating the ability. Please try again.', { reply_to_message_id: msg.message_id });
    }
});

bot.onText(/^\/remove(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
    try {
        if (["group", "supergroup"].indexOf(msg.chat.type) === -1) {
            bot.sendMessage(msg.chat.id, 'You are not in a group!');
            return
        }

        const admins = await bot.getChatAdministrators(msg.chat.id);
        const isAdmin = admins.some(admin => admin.user.id == msg.from!.id);

        if (!isAdmin) {
            bot.sendMessage(msg.chat.id, 'Only admins can use this command!');
            return
        }

        if (!match || !match[1]) {
            await bot.sendMessage(msg.chat.id, 'Please specify an ability', { reply_to_message_id: msg.message_id });
            return;
        }

        const ability = match[1];
        const check = await sql`SELECT id FROM abilities WHERE group_id = ${msg.chat.id} AND name = ${ability}`;
        if (check.length == 0) {
            await bot.sendMessage(msg.chat.id, `Ability <b>${ability}</b> does not exist`, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' });
            return;
        }

        await sql`DELETE FROM abilities WHERE group_id = ${msg.chat.id} AND id=${check[0].id}`;

        await bot.sendMessage(msg.chat.id, `Deleted ability <b>${ability}</b>`, {
            reply_to_message_id: msg.message_id,
            parse_mode: 'HTML'
        });
    } catch (error) {
        console.error('Error in /remove command:', error);
        await bot.sendMessage(msg.chat.id, 'An error occurred while removing the ability. Please try again.', { reply_to_message_id: msg.message_id });
    }
});

bot.onText(/\/list/, async (msg) => {
    try {
        const offset = 5;
        const count = await sql`SELECT COUNT(*) FROM abilities WHERE group_id = ${msg.chat.id}`;
        const abilities = await sql`SELECT name FROM abilities WHERE group_id = ${msg.chat.id} ORDER BY name ASC LIMIT ${offset}`;
        if (abilities.length == 0) {
            await bot.sendMessage(msg.chat.id, 'No abilities found', { reply_to_message_id: msg.message_id });
            return;
        }

        const list = abilities.map((ability, i) => `${i + 1}. <b>${ability.name}</b>`).join('\n') + `\n\n<i>Page: 1 / ${Math.ceil(count[0].count / offset)}</i>`;

        await bot.sendMessage(msg.chat.id, list, {
            reply_to_message_id: msg.message_id,
            parse_mode: 'HTML',
            reply_markup: count[0].count > offset ? {
                inline_keyboard: [
                    [
                        {
                            text: '◀️',
                            callback_data: `list-${Math.ceil(count[0].count / offset)}-${msg.from!.id}`
                        },
                        {
                            text: '▶️',
                            callback_data: `list-2-${msg.from!.id}`
                        }
                    ]
                ]
            } : undefined
        });
    } catch (error) {
        console.error('Error in /list command:', error);
        await bot.sendMessage(msg.chat.id, 'An error occurred while listing abilities. Please try again.', { reply_to_message_id: msg.message_id });
    }
});

bot.on('callback_query', async (callbackQuery) => {
    try {
        if (callbackQuery.data?.startsWith('remove_point')) {
        const abilityId = callbackQuery.data.split('-')[1];
        const userId = callbackQuery.data.split('-')[2];

        if (callbackQuery.from.id.toString() == userId) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 You cannot remove points from yourself",
                show_alert: true
            });
            return;
        }

        const messages = await sql`SELECT users FROM messages WHERE message_id = ${callbackQuery.message!.message_id} AND chat_id = ${callbackQuery.message!.chat.id}`;

        if (messages.length == 0) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 The original message got deleted",
                show_alert: true
            });
            return;
        }

        let users = JSON.parse(messages[0].users);
        if (!users.map(x => x.id).includes(callbackQuery.from.id)) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 You never added this point",
                show_alert: true
            });
            return;
        }

        // Check current points to prevent going negative
        const currentPoints = await sql`SELECT points FROM points WHERE user_id=${userId} AND ability_id = ${abilityId} AND group_id = ${callbackQuery.message!.chat.id}`;
        if (currentPoints.length === 0 || currentPoints[0].points < 1) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 Cannot remove points - user has 0 points",
                show_alert: true
            });
            return;
        }

        const points = await sql`UPDATE points SET points = points - 1 WHERE user_id=${userId} AND ability_id = ${abilityId} AND group_id = ${callbackQuery.message!.chat.id} RETURNING points`;
        users = users.filter(x => x.id != callbackQuery.from.id);

        await sql`UPDATE messages SET users = ${JSON.stringify(users)} WHERE message_id = ${callbackQuery.message!.message_id} AND chat_id = ${callbackQuery.message!.chat.id}`;

        let messageContent = callbackQuery.message!.text!.split('\n')[0];
        messageContent += `\nThey now have <b>${points[0].points}</b> points`;

        if (users.length > 0) {
            const userNames = users.map(u => u.username ? `@${u.username}` : (u.first_name || `User ${u.id}`)).join(', ');
            messageContent += `\n<b>Added by:</b> ${userNames}`;
        }

        await bot.editMessageText(messageContent, {
            message_id: callbackQuery.message!.message_id,
            chat_id: callbackQuery.message!.chat.id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '➕',
                            callback_data: `add_point-${abilityId}-${userId}`
                        },
                        {
                            text: '➖',
                            callback_data: `remove_point-${abilityId}-${userId}`
                        }
                    ]
                ]
            }
        });

        bot.answerCallbackQuery(callbackQuery.id, {
            text: "👍 Removed point",
        });
    } else if (callbackQuery.data?.startsWith('add_point')) {
        const abilityId = callbackQuery.data.split('-')[1];
        const userId = callbackQuery.data.split('-')[2];

        if (callbackQuery.from.id.toString() == userId) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 You cannot add points to yourself",
                show_alert: true
            });
            return;
        }

        const messages = await sql`SELECT users FROM messages WHERE message_id = ${callbackQuery.message!.message_id} AND chat_id = ${callbackQuery.message!.chat.id}`;

        if (messages.length == 0) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 The original message got deleted",
                show_alert: true
            });
            return;
        }

        let users = JSON.parse(messages[0].users);
        if (users.map(x => x.id).includes(callbackQuery.from.id)) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 You've already added this point",
                show_alert: true
            });
            return;
        }

        const points = await sql`UPDATE points SET points = points + 1 WHERE user_id=${userId} AND ability_id = ${abilityId} AND group_id = ${callbackQuery.message!.chat.id} RETURNING points`;

        users.push({
            id: callbackQuery.from.id,
            username: callbackQuery.from.username,
            first_name: callbackQuery.from.first_name
        });

        await sql`UPDATE messages SET users = ${JSON.stringify(users)} WHERE message_id = ${callbackQuery.message!.message_id} AND chat_id = ${callbackQuery.message!.chat.id}`;

        let messageContent = callbackQuery.message!.text!.split('\n')[0];
        const userNames = users.map(u => u.username ? `@${u.username}` : (u.first_name || `User ${u.id}`)).join(', ');
        messageContent += `\nThey now have <b>${points[0].points}</b> points\n\n<b>Added by:</b> ${userNames}`;

        await bot.editMessageText(messageContent, {
            message_id: callbackQuery.message!.message_id,
            chat_id: callbackQuery.message!.chat.id,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '➕',
                            callback_data: `add_point-${abilityId}-${userId}`
                        },
                        {
                            text: '➖',
                            callback_data: `remove_point-${abilityId}-${userId}`
                        }
                    ]
                ]
            }
        });

        bot.answerCallbackQuery(callbackQuery.id, {
            text: "👍 Added point",
        });
    } else if (callbackQuery.data?.startsWith('leaderboard')) {
        const abilityId = callbackQuery.data.split('-')[1];
        const abilities = await sql`SELECT id, name from abilities WHERE group_id = ${callbackQuery.message!.chat.id} AND id = ${abilityId}`;
        if (abilities.length == 0) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 Ability not found",
                show_alert: true
            });
            return;
        }

        const points = await sql`SELECT user_id, points FROM points WHERE ability_id = ${abilities[0].id} AND group_id = ${callbackQuery.message!.chat.id} ORDER BY points DESC`;

        let leaderboard = '';

        if (points.length === 0) {
            leaderboard = '<i>No points yet for this ability</i>';
        } else {
            for (const point of points) {
                try {
                    const info = await bot.getChatMember(callbackQuery.message!.chat.id, point.user_id);
                    const userName = info.user.username 
                        ? `@${info.user.username}` 
                        : (info.user.first_name || `User ${info.user.id}`);
                    leaderboard += `${userName}: ${point.points}\n`;
                } catch {
                    leaderboard += `<b>${point.user_id}</b>: ${point.points}\n`;
                }
            }
        }

        await bot.editMessageText(`<b>${abilities[0].name}</b> <u>leaderboard:</u>\n\n${leaderboard}`, {
            chat_id: callbackQuery.message!.chat.id,
            message_id: callbackQuery.message!.message_id,
            parse_mode: 'HTML',
        });

        await bot.answerCallbackQuery(callbackQuery.id);
    } else if (callbackQuery.data?.startsWith('list')) {

        if (callbackQuery.data.split('-')[2] !== callbackQuery.from.id.toString()) {
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 You did not start this list",
                show_alert: true
            });
            return;
        }

        const offset = 5;
        const page = parseInt(callbackQuery.data.split('-')[1]);
        const count = await sql`SELECT COUNT(*) FROM abilities WHERE group_id = ${callbackQuery.message!.chat.id}`;
        const abilities = await sql`SELECT name FROM abilities WHERE group_id = ${callbackQuery.message!.chat.id} ORDER BY name ASC LIMIT ${offset} OFFSET ${(page - 1) * offset}`;
        if (abilities.length == 0) {
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: "🚨 No abilities found",
                show_alert: true
            });
            return;
        }

        const list = abilities.map((ability, i) => `${i + 1 + ((page - 1) * offset)}. <b>${ability.name}</b>`).join('\n') + `\n\n<i>Page: ${page} / ${Math.ceil(count[0].count / offset)}</i>`;

        await bot.editMessageText(list, {
            chat_id: callbackQuery.message!.chat.id,
            message_id: callbackQuery.message!.message_id,
            parse_mode: 'HTML',
            reply_markup: count[0].count > offset ? {
                inline_keyboard: [
                    [
                        {
                            text: '◀️',
                            callback_data: (page - 1) <= 0 ? `list-${Math.ceil(count[0].count / offset)}-${callbackQuery.from.id}` : `list-${page - 1}-${callbackQuery.from.id}`
                        },
                        {
                            text: '▶️',
                            callback_data: (page + 1) <= Math.ceil(count[0].count / offset) ? `list-${page + 1}-${callbackQuery.from.id}` : `list-1-${callbackQuery.from.id}`
                        }
                    ]
                ]
            } : undefined
        });
        await bot.answerCallbackQuery(callbackQuery.id);
    }
    } catch (error) {
        console.error('Error in callback query handler:', error);
        bot.answerCallbackQuery(callbackQuery.id, {
            text: "🚨 An error occurred. Please try again.",
            show_alert: true
        });
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Bot ready notification
bot.on('polling', () => {
    console.log('✅ Bot is running and polling for updates');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await bot.stopPolling();
    await sql.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await bot.stopPolling();
    await sql.end();
    process.exit(0);
});