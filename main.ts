import TelegramBot from "node-telegram-bot-api";
import postgres from "postgres";

if (!process.env.DATABASE_URL || !process.env.TOKEN) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
const bot = new TelegramBot(process.env.TOKEN, { polling: true });

bot.onText(/\/add (.+)/, async (msg, match) => {
    const args = match![1].split(' ').filter(x => x.length > 0);
    console.log(msg.reply_to_message?.from);
    // let user_id: number;
    // let ability: string;


    // if (msg.reply_to_message) {
    //     user_id = msg.reply_to_message.from!.id;
    //     ability = args[0];
    // } else {

    //     ability = args[1];
    // }

    // if (user_id === msg.from!.id) {
    //     await bot.sendMessage(msg.chat.id, 'You cannot add yourself', { reply_to_message_id: msg.message_id });
    //     return;
    // }

});

bot.onText(/\/create (.+)/, async (msg, match) => {
    if (msg.chat.type != 'group') {
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

bot.onText(/\/list/, async (msg) => {
    const abilities = await sql`SELECT name FROM abilities WHERE group_id = ${msg.chat.id}`;
    if (abilities.length == 0)
        await bot.sendMessage(msg.chat.id, 'No abilities found', { reply_to_message_id: msg.message_id });
    else {
        const list = abilities.map(ability => `<b>${ability.name}</b>`).join('\n');
        await bot.sendMessage(msg.chat.id, list, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' });
    }
});