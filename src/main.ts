import TelegramBot from "node-telegram-bot-api";
import postgres from "postgres";

if (!process.env.DATABASE_URL || !process.env.TOKEN) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
const bot = new TelegramBot(process.env.TOKEN, { polling: true });

bot.onText(/\/add (.+)/, async (msg, match) => {
    if (!msg.reply_to_message?.from) {
        await bot.sendMessage(msg.chat.id, 'Please reply to a message', { reply_to_message_id: msg.message_id });
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

    await bot.sendMessage(msg.chat.id, `Added 1 <b>${match![1]}</b> point to @${msg.reply_to_message.from.username}\nThey now have <b>${points[0].points}</b> points`, {
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML'
    });
});

bot.onText(/\/leaderboard (.+)/, async (msg, match) => {

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

bot.onText(/\/create (.+)/, async (msg, match) => {
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

    if (match) {
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
    } else
        bot.sendMessage(msg.chat.id, 'Please specify an ability');
});

bot.onText(/\/remove (.+)/, async (msg, match) => {
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

    if (match) {
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
    } else
        bot.sendMessage(msg.chat.id, 'Please specify an ability');
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