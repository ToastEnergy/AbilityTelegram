import TelegramBot, { InlineQueryResultArticle } from "node-telegram-bot-api";
import postgres from "postgres";

if (!process.env.DATABASE_URL || !process.env.TOKEN) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
const bot = new TelegramBot(process.env.TOKEN, { polling: true });

bot.onText(/^\/add(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
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

    const sent = await bot.sendMessage(msg.chat.id, `Added 1 <b>${match![1]}</b> point to @${msg.reply_to_message.from.username}\nThey now have <b>${points[0].points}</b> points\n\nAdded by: @${msg.from!.username}`, {
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
            username: msg.from!.username
        }
    ]

    await sql`INSERT INTO messages (message_id, chat_id, users) VALUES (${sent.message_id}, ${sent.chat.id}, ${JSON.stringify(users)})`;
});


type Ability = { id: number, name: string };

bot.onText(/^\/leaderboard(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {

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

    for (const point of points) {
        const info = await bot.getChatMember(msg.chat.id, point.user_id);
        if (info.user)
            leaderboard += `@${info.user.username}: ${point.points}\n`;
        else leaderboard += `<b>${point.user_id}</b>: ${point.points}\n`;
    }

    await bot.sendMessage(msg.chat.id, `<b>${match![1]}</b> <u>leaderboard:</u>\n\n${leaderboard}`, {
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML',
        disable_notification: true
    });
});

bot.onText(/^\/create(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
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
});

bot.onText(/^\/remove(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
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
});

bot.onText(/\/list/, async (msg) => {
    const abilities = await sql`SELECT name FROM abilities WHERE group_id = ${msg.chat.id}`;
    if (abilities.length == 0)
        await bot.sendMessage(msg.chat.id, 'No abilities found', { reply_to_message_id: msg.message_id });
    else {
        const list = abilities.map(ability => `<b>${ability.name}</b>`).join('\n');
        await bot.sendMessage(msg.chat.id, list, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' });
    }
});

bot.on('callback_query', async (callbackQuery) => {
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
                text: "🚨 You never addeded this point",
                show_alert: true
            });
            return;
        }

        const points = await sql`UPDATE points SET points = points.points - 1 WHERE user_id=${userId} AND ability_id = ${abilityId} AND group_id = ${callbackQuery.message!.chat.id} RETURNING points`;
        users = users.filter(x => x.id != callbackQuery.from.id);

        await sql`UPDATE messages SET users = ${JSON.stringify(users)} WHERE message_id = ${callbackQuery.message!.message_id} AND chat_id = ${callbackQuery.message!.chat.id}`;

        let messageContent = callbackQuery.message!.text!.split('\n')[0];
        messageContent += `\nThey now have <b>${points[0].points}</b> points`;

        if (users.length > 0)
            messageContent += `\n<b>Added by:</b> ${users.map(x => `@${x.username}`).join(', ')}`;

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

        const points = await sql`UPDATE points SET points = points.points + 1 WHERE user_id=${userId} AND ability_id = ${abilityId} AND group_id = ${callbackQuery.message!.chat.id} RETURNING points`;

        users.push({
            id: callbackQuery.from.id,
            username: callbackQuery.from.username
        });

        await sql`UPDATE messages SET users = ${JSON.stringify(users)} WHERE message_id = ${callbackQuery.message!.message_id} AND chat_id = ${callbackQuery.message!.chat.id}`;

        let messageContent = callbackQuery.message!.text!.split('\n')[0];
        messageContent += `\nThey now have <b>${points[0].points}</b> points\n\n<b>Added by:</b> ${users.map(x => `@${x.username}`).join(', ')}`;

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

        for (const point of points) {
            try {
                const info = await bot.getChatMember(callbackQuery.message!.chat.id, point.user_id);
                leaderboard += `@${info.user.username}: ${point.points}\n`;
            } catch {
                leaderboard += `<b>${point.user_id}</b>: ${point.points}\n`;
            }
        }

        await bot.editMessageText(`<b>${abilities[0].name}</b> <u>leaderboard:</u>\n\n${leaderboard}`, {
            chat_id: callbackQuery.message!.chat.id,
            message_id: callbackQuery.message!.message_id,
            parse_mode: 'HTML',
        });

        await bot.answerCallbackQuery(callbackQuery.id);
    }
});