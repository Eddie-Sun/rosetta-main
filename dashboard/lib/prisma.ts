import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

type GlobalForPrisma = {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const globalForPrisma = globalThis as unknown as GlobalForPrisma;

function getEnvLocalValue(key: string): string | null {
  try {
    const envPath = path.join(process.cwd(), ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    const line = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#") && l.startsWith(`${key}=`));
    if (!line) return null;

    const valueRaw = line.slice(key.length + 1).trim();
    const m = valueRaw.match(/^(['"])(.*)\1$/);
    return (m ? m[2] : valueRaw).trim() || null;
  } catch {
    return null;
  }
}

function getDbUrl(): string {
  if (process.env.NODE_ENV !== "production") {
    const fromFile = getEnvLocalValue("DATABASE_URL");
    if (fromFile) process.env["DATABASE_URL"] = fromFile;
  }

  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error("Missing DATABASE_URL");
  }
  return url;
}

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: getDbUrl(),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;


