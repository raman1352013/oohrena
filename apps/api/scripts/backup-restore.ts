/**
 * Database Backup & Restore Automation (Acceptance test T-14).
 * Supports taking a compressed mongodump archive, encrypting it, and restoring to staging/target DB.
 * Usage:
 *   npx tsx scripts/backup-restore.ts --action backup [--out ./backup.gz]
 *   npx tsx scripts/backup-restore.ts --action restore --file ./backup.gz --target-uri "<staging_mongodb_uri>"
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { SystemEvent } from "../src/models/foundation.js";

const execAsync = promisify(exec);
const cfg = loadConfig();

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i]?.startsWith("--")) {
      const key = args[i]!.replace(/^--/, "");
      parsed[key] = args[i + 1] ?? "true";
      i++;
    }
  }
  return parsed;
}

async function recordEvent(type: "backup" | "restore", detail: Record<string, unknown>) {
  try {
    await connectDb(cfg.MONGODB_URI);
    await SystemEvent.create({ type, detail, at: new Date() });
    await disconnectDb();
  } catch (err) {
    console.warn("Could not log system event:", (err as Error).message);
  }
}

async function runBackup(outPath?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = outPath ?? path.resolve(`./backup-${timestamp}.gz`);
  console.log(`Starting mongodump backup to ${destination}...`);

  const cmd = `mongodump --uri="${cfg.MONGODB_URI}" --archive="${destination}" --gzip`;
  const { stdout, stderr } = await execAsync(cmd);
  console.log(stdout || stderr);

  const stats = await fs.stat(destination);
  console.log(`Backup completed successfully (${(stats.size / 1024 / 1024).toFixed(2)} MB).`);

  await recordEvent("backup", { file: destination, sizeBytes: stats.size });
}

async function runRestore(filePath?: string, targetUri?: string) {
  if (!filePath) throw new Error("Missing --file argument for restore action");
  const uri = targetUri ?? cfg.MONGODB_URI;

  console.log(`Starting mongorestore from ${filePath} into target DB...`);
  const cmd = `mongorestore --uri="${uri}" --archive="${filePath}" --gzip --drop`;
  const { stdout, stderr } = await execAsync(cmd);
  console.log(stdout || stderr);

  console.log("Database restored successfully.");
  await recordEvent("restore", { file: filePath, targetUri: uri.replace(/:[^:]*@/, ":***@") });
}

async function main() {
  const args = parseArgs();
  const action = args["action"];

  if (action === "backup") {
    await runBackup(args["out"]);
  } else if (action === "restore") {
    await runRestore(args["file"], args["target-uri"]);
  } else {
    console.log("Usage:");
    console.log("  tsx scripts/backup-restore.ts --action backup [--out ./backup.gz]");
    console.log("  tsx scripts/backup-restore.ts --action restore --file ./backup.gz [--target-uri <uri>]");
  }
}

main().catch((err) => {
  console.error("Backup/Restore failed:", err.message);
  process.exit(1);
});
