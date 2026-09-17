import { openDatabase } from "./db.js";
import { loadEnv } from "./env.js";
import { loadDotEnv } from "./load-dotenv.js";
import { applyMigrations } from "./migrate.js";
import { buildApp } from "./app.js";
import { seedDevelopmentData } from "./seed.js";

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const db = openDatabase(env.DATABASE_PATH);
  applyMigrations(db);
  if (env.SEED_ON_START && env.NODE_ENV !== "production") {
    seedDevelopmentData(db, env.TEAM_NAME);
  }
  const app = await buildApp(env, db);
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
