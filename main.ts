import TelegramBot from "node-telegram-bot-api";
import postgres from "postgres";

if (!process.env.DATABASE_URL || !process.env.TOKEN) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);
const bot = new TelegramBot(process.env.TOKEN, { polling: true });

bot.onText(/\/add (.+)/, async (msg, match) => {

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
        await sql`INSERT INTO abilities (group_id, name) VALUES (${msg.chat.id}, ${ability})`;
        bot.sendMessage(msg.chat.id, `Added ability ${ability}`);
    } else
        bot.sendMessage(msg.chat.id, 'Please specify an ability');
});