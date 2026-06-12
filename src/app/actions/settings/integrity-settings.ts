"use server"

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { logger } from "@/lib/logging/logger";
import { wrapError } from "@/lib/logging/errors";

const log = logger.child({ action: "integrity-settings" });

const schema = z.object({
    skipPassed: z.boolean(),
    maxAgeDays: z.coerce.number().min(0).max(3650),
    maxFileSizeMb: z.coerce.number().min(0).max(1_000_000),
    scanMode: z.enum(["jobs", "destinations"]).default("jobs"),
});

export async function saveIntegritySettings(data: z.infer<typeof schema>) {
    await checkPermission(PERMISSIONS.SETTINGS.WRITE);

    const result = schema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        const { skipPassed, maxAgeDays, maxFileSizeMb, scanMode } = result.data;

        await prisma.systemSetting.upsert({
            where: { key: "integrity.skipPassed" },
            update: { value: String(skipPassed) },
            create: { key: "integrity.skipPassed", value: String(skipPassed) },
        });

        await prisma.systemSetting.upsert({
            where: { key: "integrity.maxAgeDays" },
            update: { value: String(maxAgeDays) },
            create: { key: "integrity.maxAgeDays", value: String(maxAgeDays) },
        });

        await prisma.systemSetting.upsert({
            where: { key: "integrity.maxFileSizeMb" },
            update: { value: String(maxFileSizeMb) },
            create: { key: "integrity.maxFileSizeMb", value: String(maxFileSizeMb) },
        });

        await prisma.systemSetting.upsert({
            where: { key: "integrity.scanMode" },
            update: { value: scanMode },
            create: { key: "integrity.scanMode", value: scanMode },
        });

        revalidatePath("/dashboard/settings");
        return { success: true };
    } catch (e: unknown) {
        log.error("Failed to save integrity settings", {}, wrapError(e));
        return { success: false, error: "Failed to save settings" };
    }
}
