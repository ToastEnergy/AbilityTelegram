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
  pgm.createTable(
    "abilities",
    {
      id: "id",
      group_id: { type: "text" },
      name: { type: "varchar(255)", notNull: true, unique: true },
    },
    {
      ifNotExists: true,
    }
  );

  pgm.createTable(
    "points",
    {
      user_id: { type: "text", notNull: true },
      ability_id: {
        type: "integer",
        references: "abilities(id)",
        onDelete: "CASCADE",
      },
      group_id: { type: "text" },
      points: { type: "integer", default: 0, notNull: true },
    },
    {
      ifNotExists: true,
      primaryKey: ["user_id", "ability_id", "group_id"],
    }
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("points");
  pgm.dropTable("abilities");
};
