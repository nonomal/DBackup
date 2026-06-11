import prisma from "@/lib/prisma";
import { registry } from "@/lib/core/registry";
import { registerAdapters } from "@/lib/adapters";
import { StorageAdapter } from "@/lib/core/interfaces";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import { verificationService } from "@/services/storage/verification-service";
import { logger } from "@/lib/logging/logger";
import { wrapError } from "@/lib/logging/errors";
import { INTEGRITY_CHECK_STAGES } from "@/lib/core/logs";

const log = logger.child({ service: "IntegrityService" });

registerAdapters();

export interface IntegrityCheckResult {
  totalFiles: number;
  verified: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: Array<{
    file: string;
    destination: string;
    expected: string;
    actual: string;
  }>;
}

export interface IntegrityProgressCallbacks {
  onLog: (message: string, level?: "info" | "success" | "warning" | "error", details?: string) => void;
  onStage: (stage: string) => void;
  onFileProgress: (done: number, total: number, currentFile?: string) => void;
}

interface IntegrityFilters {
  skipPassed: boolean;
  maxAgeDays: number;
  maxFileSizeBytes: number;
}

interface WorkItem {
  storageConfigId: string;
  destinationName: string;
  remotePath: string;
  fileName: string;
}

export class IntegrityService {
  async runFullIntegrityCheck(callbacks?: IntegrityProgressCallbacks): Promise<IntegrityCheckResult> {
    log.info("Starting full backup integrity check");

    const result: IntegrityCheckResult = {
      totalFiles: 0,
      verified: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    const [skipPassedSetting, maxAgeSetting, maxSizeSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'integrity.skipPassed' } }),
      prisma.systemSetting.findUnique({ where: { key: 'integrity.maxAgeDays' } }),
      prisma.systemSetting.findUnique({ where: { key: 'integrity.maxFileSizeMb' } }),
    ]);

    const filters: IntegrityFilters = {
      skipPassed: skipPassedSetting?.value === 'true',
      maxAgeDays: parseInt(maxAgeSetting?.value ?? '0') || 0,
      maxFileSizeBytes: (parseInt(maxSizeSetting?.value ?? '0') || 0) * 1024 * 1024,
    };

    log.info("Integrity check filters", {
      skipPassed: filters.skipPassed,
      maxAgeDays: filters.maxAgeDays,
      maxFileSizeMb: filters.maxFileSizeBytes / 1024 / 1024,
    });

    callbacks?.onStage(INTEGRITY_CHECK_STAGES.INITIALIZING);

    const filterParts: string[] = [];
    if (filters.maxAgeDays > 0) filterParts.push(`max age ${filters.maxAgeDays} days`);
    if (filters.maxFileSizeBytes > 0) filterParts.push(`max size ${filters.maxFileSizeBytes / 1024 / 1024} MB`);
    if (filters.skipPassed) filterParts.push("skip already-passed files");
    callbacks?.onLog(
      filterParts.length > 0 ? `Filters: ${filterParts.join(", ")}` : "No filters configured - checking all files"
    );

    const storageConfigs = await prisma.adapterConfig.findMany({
      where: { type: "storage" },
    });

    callbacks?.onLog(`Found ${storageConfigs.length} storage destination${storageConfigs.length !== 1 ? "s" : ""}`);

    // Pass 1: Scan all destinations and collect work items
    callbacks?.onStage(INTEGRITY_CHECK_STAGES.SCANNING);

    const allWorkItems: WorkItem[] = [];
    for (const storageConfig of storageConfigs) {
      try {
        const items = await this.gatherFilesFromDestination(storageConfig, filters, callbacks);
        allWorkItems.push(...items);
      } catch (e: unknown) {
        log.error("Failed to scan storage destination", { destination: storageConfig.name }, wrapError(e));
        callbacks?.onLog(`Failed to scan ${storageConfig.name}`, "error");
      }
    }

    result.totalFiles = allWorkItems.length;
    callbacks?.onLog(
      `Total: ${allWorkItems.length} file${allWorkItems.length !== 1 ? "s" : ""} to verify`,
      "info"
    );

    if (allWorkItems.length === 0) {
      callbacks?.onLog("No files to verify - check filters or storage contents", "info");
      return result;
    }

    // Pass 2: Verify all collected files
    callbacks?.onStage(INTEGRITY_CHECK_STAGES.VERIFYING_CHECKSUMS);

    for (let i = 0; i < allWorkItems.length; i++) {
      const item = allWorkItems[i];
      callbacks?.onFileProgress(i, allWorkItems.length, item.fileName);

      try {
        const verifyResult = await verificationService.verifyFile(
          item.storageConfigId,
          item.remotePath,
          "scheduled",
          { skipIfPassed: filters.skipPassed }
        );

        if (verifyResult.status === "passed") {
          result.verified++;
          result.passed++;
          callbacks?.onLog(`${item.fileName}`, "success");
        } else if (verifyResult.status === "failed") {
          result.verified++;
          result.failed++;
          result.errors.push({
            file: item.fileName,
            destination: item.destinationName,
            expected: verifyResult.expectedChecksum ?? "",
            actual: verifyResult.actualChecksum ?? "",
          });
          callbacks?.onLog(
            `${item.fileName} - checksum mismatch`,
            "error",
            `Expected: ${verifyResult.expectedChecksum ?? "unknown"}\nActual:   ${verifyResult.actualChecksum ?? "unknown"}`
          );
        } else {
          result.skipped++;
          callbacks?.onLog(`${item.fileName} skipped (${verifyResult.status})`, "info");
        }
      } catch (e: unknown) {
        log.error("Failed to verify file", { file: item.fileName, destination: item.destinationName }, wrapError(e));
        callbacks?.onLog(`Failed to verify ${item.fileName}`, "error");
        result.skipped++;
      }

      callbacks?.onFileProgress(i + 1, allWorkItems.length, item.fileName);
    }

    log.info("Integrity check completed", {
      totalFiles: result.totalFiles,
      verified: result.verified,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
    });

    return result;
  }

  private async gatherFilesFromDestination(
    storageConfig: any,
    filters: IntegrityFilters,
    callbacks?: IntegrityProgressCallbacks
  ): Promise<WorkItem[]> {
    const workItems: WorkItem[] = [];
    const adapter = registry.get(storageConfig.adapterId) as StorageAdapter;
    if (!adapter) {
      log.warn("Storage adapter not found", { adapterId: storageConfig.adapterId });
      return [];
    }

    const config = await resolveAdapterConfig(storageConfig);

    let folders: string[] = [];
    try {
      const topLevel = await adapter.list(config, "");
      folders = topLevel
        .filter((f) => f.name && !f.name.endsWith(".meta.json"))
        .map((f) => f.name);
    } catch (e: unknown) {
      log.warn(
        "Could not list storage root, falling back to active jobs",
        { destination: storageConfig.name },
        wrapError(e)
      );
      const jobs = await prisma.job.findMany({
        where: { destinations: { some: { configId: storageConfig.id } } },
        select: { name: true },
      });
      folders = jobs.map((j) => j.name);
    }

    for (const folder of folders) {
      try {
        const files = await adapter.list(config, folder);
        const backupFiles = files.filter((f) => !f.name.endsWith(".meta.json"));

        for (const file of backupFiles) {
          if (filters.maxAgeDays > 0 && file.lastModified) {
            const ageDays = (Date.now() - new Date(file.lastModified).getTime()) / 86_400_000;
            if (ageDays > filters.maxAgeDays) continue;
          }

          if (filters.maxFileSizeBytes > 0 && file.size > filters.maxFileSizeBytes) continue;

          workItems.push({
            storageConfigId: storageConfig.id,
            destinationName: storageConfig.name,
            remotePath: `${folder}/${file.name}`,
            fileName: file.name,
          });
        }
      } catch (e: unknown) {
        log.warn(
          "Failed to list files for folder",
          { folder, destination: storageConfig.name },
          wrapError(e)
        );
      }
    }

    callbacks?.onLog(
      `${storageConfig.name}: found ${workItems.length} file${workItems.length !== 1 ? "s" : ""} to verify`
    );

    return workItems;
  }
}

export const integrityService = new IntegrityService();
