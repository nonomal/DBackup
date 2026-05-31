import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { jobService } from "@/services/jobs/job-service";
import { getAuthContext, checkPermissionWithContext } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { logger } from "@/lib/logging/logger";
import { wrapError, getErrorMessage } from "@/lib/logging/errors";

const log = logger.child({ route: "jobs/[id]/clone" });

export async function POST(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const ctx = await getAuthContext(await headers());
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    checkPermissionWithContext(ctx, PERMISSIONS.JOBS.WRITE);

    const params = await props.params;
    let body: { name?: string } = {};
    try { body = await req.json(); } catch { /* no body is fine */ }

    try {
        const clonedJob = await jobService.cloneJob(params.id, body.name?.trim() || undefined);
        return NextResponse.json(clonedJob, { status: 201 });
    } catch (error: unknown) {
        log.error("Clone job error", { jobId: params.id }, wrapError(error));
        const message = getErrorMessage(error) || "Failed to clone job";
        const status = message.includes("not found") ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
