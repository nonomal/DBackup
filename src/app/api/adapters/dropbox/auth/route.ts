import { NextRequest, NextResponse } from "next/server";
import { DropboxAuth } from "dropbox";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { getAuthContext, checkPermissionWithContext } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDecryptedCredentialData } from "@/services/auth/credential-service";
import type { OAuthData } from "@/lib/core/credentials";
import { logger } from "@/lib/logging/logger";

const log = logger.child({ route: "adapters/dropbox/auth" });

/**
 * POST /api/adapters/dropbox/auth
 * Generates the Dropbox OAuth authorization URL.
 * Body: { adapterId: string } - The saved adapter config ID to authorize.
 */
export async function POST(req: NextRequest) {
    const ctx = await getAuthContext(await headers());
    if (!ctx) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        checkPermissionWithContext(ctx, PERMISSIONS.DESTINATIONS.WRITE);

        const { adapterId } = await req.json();
        if (!adapterId) {
            return NextResponse.json({ error: "Missing adapterId" }, { status: 400 });
        }

        // Load the adapter config to get clientId and clientSecret
        const adapterConfig = await prisma.adapterConfig.findUnique({
            where: { id: adapterId },
        });

        if (!adapterConfig || adapterConfig.adapterId !== "dropbox") {
            return NextResponse.json({ error: "Adapter not found or not a Dropbox adapter" }, { status: 404 });
        }

        if (!adapterConfig.primaryCredentialId) {
            return NextResponse.json({ error: "Assign an OAuth credential profile (with the app key + secret) before authorizing." }, { status: 400 });
        }
        const profile = (await getDecryptedCredentialData(
            adapterConfig.primaryCredentialId,
            "OAUTH"
        )) as OAuthData;

        if (!profile.clientId || !profile.clientSecret) {
            return NextResponse.json({ error: "App Key and App Secret are required" }, { status: 400 });
        }

        // Build callback URL from the request origin
        const origin = process.env.BETTER_AUTH_URL || req.nextUrl.origin;
        const redirectUri = `${origin}/api/adapters/dropbox/callback`;

        const dbxAuth = new DropboxAuth({
            clientId: profile.clientId,
            clientSecret: profile.clientSecret,
            fetch: fetch,
        });

        const authUrl = await dbxAuth.getAuthenticationUrl(
            redirectUri,
            adapterId, // state parameter for callback
            "code",
            "offline", // Request offline access to get refresh_token
            undefined, // scopes - use app-configured scopes
            "none",
            false
        );

        log.info("Generated Dropbox OAuth URL", { adapterId });

        return NextResponse.json({ success: true, data: { authUrl: String(authUrl) } });
    } catch (error) {
        log.error("Failed to generate Dropbox OAuth URL", {}, error instanceof Error ? error : undefined);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to generate auth URL" },
            { status: 500 }
        );
    }
}
