import postgres from "postgres";

if (!process.env.DATABASE_URL) {
    console.log('Please set the environment variables');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

await sql`
CREATE TABLE IF NOT EXISTS abilities (
    id SERIAL PRIMARY KEY,
    group_id INTEGER,
    name VARCHAR(255) UNIQUE NOT NULL
);
`

await sql`
CREATE TABLE IF NOT EXISTS points (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    ability_id INTEGER REFERENCES abilities(id) ON DELETE CASCADE,
    points INTEGER DEFAULT 0 NOT NULL
);
`