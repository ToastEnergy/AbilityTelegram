import postgres from "postgres";

if (!process.env.DATABASE_URL) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

await sql`
CREATE TABLE IF NOT EXISTS abilities (
    id SERIAL PRIMARY KEY,
    group_id TEXT,
    name VARCHAR(255) UNIQUE NOT NULL
);
`

await sql`
CREATE TABLE IF NOT EXISTS points (
    user_id TEXT NOT NULL,
    ability_id INTEGER REFERENCES abilities(id) ON DELETE CASCADE,
    group_id TEXT,
    points INTEGER DEFAULT 0 NOT NULL,
    PRIMARY KEY (user_id, ability_id, group_id)
);
`
await sql`
    CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT,
        chat_id TEXT,
        users JSONB,
        PRIMARY KEY (message_id, chat_id)
    );
`;