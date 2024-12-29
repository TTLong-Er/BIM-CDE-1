import {relations, sql} from "drizzle-orm";
import {varchar, pgTable, uuid, timestamp} from "drizzle-orm/pg-core";
import {projects} from "./projects";

/**
 *
 */
export const models = pgTable("models", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", {length: 255}).notNull(),
  status: varchar("status", {length: 255}).notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const modelRelations = relations(models, ({one}) => ({
  // one model belong one project
  project: one(projects, {
    fields: [models.projectId],
    references: [projects.id],
  }),
}));
