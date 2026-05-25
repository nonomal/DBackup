import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuthContext, checkPermissionWithContext } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { registry } from "@/lib/core/registry";
import { registerAdapters } from "@/lib/adapters";
import { resolveAdapterConfig } from "@/lib/adapters/config-resolver";
import prisma from "@/lib/prisma";

registerAdapters();

/**
 * GET /api/adapters/[id]/databases
 * Lists available databases for a saved database source adapter config.
 */
export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const ctx = await getAuthContext(await headers());
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    checkPermissionWithContext(ctx, PERMISSIONS.SOURCES.VIEW);

    const params = await props.params;

    const adapterConfig = await prisma.adapterConfig.findUnique({
        where: { id: params.id },
    });

    if (!adapterConfig || adapterConfig.type !== "database") {
        return NextResponse.json({ error: "Database source not found" }, { status: 404 });
    }

    const adapter = registry.get(adapterConfig.adapterId);
    if (!adapter || !adapter.getDatabases) {
        return NextResponse.json({ success: true, databases: [] });
    }

    try {
        const config = await resolveAdapterConfig(adapterConfig);
        const databases = await adapter.getDatabases(config);
        return NextResponse.json({ success: true, databases });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
