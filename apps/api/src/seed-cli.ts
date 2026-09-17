import { openDatabase } from "./db.js";
import { loadEnv } from "./env.js";
import { loadDotEnv } from "./load-dotenv.js";
import { applyMigrations } from "./migrate.js";
import { seedDevelopmentData } from "./seed.js";

loadDotEnv();
const env = loadEnv();
const db = openDatabase(env.DATABASE_PATH);
applyMigrations(db);
seedDevelopmentData(db, env.TEAM_NAME);
db.close();
console.log("Seeded Tyloo FC development players.");
