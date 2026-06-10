import prisma from "@/lib/prisma";
import { registry } from "@/lib/core/registry";
import { registerAdapters } from "@/lib/adapters";
import { StorageAdapter } from "@/lib/core/interfaces";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import { verificationService } from "@/services/storage/verification-service";
import { logger } from "@/lib/logging/logger";
import { wrapError } from "@/lib/logging/errors";

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

interface IntegrityFilters {
  skipPassed: boolean;
  maxAgeDays: number;
  maxFileSizeBytes: number;
}

export class IntegrityService {
  async runFullIntegrityCheck(): Promise<IntegrityCheckResult> {
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

    const storageConfigs = await prisma.adapterConfig.findMany({
      where: { type: "storage" },
    });

    for (const storageConfig of storageConfigs) {
      try {
        await this.checkDestination(storageConfig, result, filters);
      } catch (e: unknown) {
        log.error(
          "Failed to check storage destination",
          { destination: storageConfig.name },
          wrapError(e)
        );
      }
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

  private async checkDestination(
    storageConfig: any,
    result: IntegrityCheckResult,
    filters: IntegrityFilters
  ) {
    const adapter = registry.get(storageConfig.adapterId) as StorageAdapter;
    if (!adapter) {
      log.warn("Storage adapter not found", { adapterId: storageConfig.adapterId });
      return;
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
          result.totalFiles++;
          const remotePath = `${folder}/${file.name}`;

          // Age filter: skip files older than maxAgeDays
          if (filters.maxAgeDays > 0 && file.lastModified) {
            const ageDays = (Date.now() - new Date(file.lastModified).getTime()) / 86_400_000;
            if (ageDays > filters.maxAgeDays) {
              result.skipped++;
              continue;
            }
          }

          // Size filter: skip files larger than maxFileSizeBytes
          if (filters.maxFileSizeBytes > 0 && file.size > filters.maxFileSizeBytes) {
            result.skipped++;
            continue;
          }

          try {
            const verifyResult = await verificationService.verifyFile(
              storageConfig.id,
              remotePath,
              "scheduled",
              { skipIfPassed: filters.skipPassed }
            );

            if (verifyResult.status === "passed") {
              result.verified++;
              result.passed++;
            } else if (verifyResult.status === "failed") {
              result.verified++;
              result.failed++;
              result.errors.push({
                file: file.name,
                destination: storageConfig.name,
                expected: verifyResult.expectedChecksum ?? "",
                actual: verifyResult.actualChecksum ?? "",
              });
            } else {
              result.skipped++;
            }
          } catch (e: unknown) {
            log.error(
              "Failed to verify file",
              { file: file.name, destination: storageConfig.name },
              wrapError(e)
            );
            result.skipped++;
          }
        }
      } catch (e: unknown) {
        log.warn(
          "Failed to list files for folder",
          { folder, destination: storageConfig.name },
          wrapError(e)
        );
      }
    }
  }
}

export const integrityService = new IntegrityService();
