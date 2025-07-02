/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
    pgm.createTable('messages', {
        message_id: { type: 'text', notNull: true },
        chat_id: { type: 'text', notNull: true },
        users: { type: 'jsonb', notNull: true },
    }, {
        primaryKey: ['message_id', 'chat_id'],
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
    pgm.dropTable('messages', {
        ifExists: true,
        cascade: true,
    });
};
