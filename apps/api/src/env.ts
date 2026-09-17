import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_PATH: z.string().min(1).default("./data/tyloo-live.sqlite"),
  APP_PIN: z.string().regex(/^\d{4,8}$/, "APP_PIN must be 4 to 8 digits"),
  SESSION_SECRET: z.string().min(16),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(90),
  PIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PIN_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  TEAM_NAME: z.string().min(1).default("Tyloo FC"),
  SEED_ON_START: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
