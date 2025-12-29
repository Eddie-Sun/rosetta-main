import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Missing DATABASE_URL. Set it in dashboard/.env.local (Neon direct URL recommended)."
    );
  }

  // Common placeholder patterns that should never be used at runtime.
  const looksPlaceholder =
    /postgres:\/\/user:pass@host\/dbname/i.test(url) ||
    /postgresql:\/\/USER:PASSWORD@HOST/i.test(url) ||
    /USER:PASSWORD@HOST/i.test(url);

  if (looksPlaceholder) {
    throw new Error(
      "DATABASE_URL looks like a placeholder. Replace it with your real Postgres connection string."
    );
  }

  return url;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const pgPool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: getDatabaseUrl(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pgPool;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pgPool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
