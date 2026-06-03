import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { getAuthContext, checkPermissionWithContext } from "@/lib/auth/access-control";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getDecryptedCredentialData } from "@/services/auth/credential-service";
import type { OAuthData } from "@/lib/core/credentials";
import { logger } from "@/lib/logging/logger";

const log = logger.child({ route: "adapters/google-drive/auth" });

const SCOPES = [
    "https://www.googleapis.com/auth/drive.file",    // Create/access own files
    "https://www.googleapis.com/auth/drive.readonly", // Browse existing folders
];

/**
 * POST /api/adapters/google-drive/auth
 * Generates the Google OAuth authorization URL.
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

        if (!adapterConfig || adapterConfig.adapterId !== "google-drive") {
            return NextResponse.json({ error: "Adapter not found or not a Google Drive adapter" }, { status: 404 });
        }

        // clientId + clientSecret both come from the OAUTH credential profile.
        if (!adapterConfig.primaryCredentialId) {
            return NextResponse.json({ error: "Assign an OAuth credential profile (with the client ID + secret) before authorizing." }, { status: 400 });
        }
        const profile = (await getDecryptedCredentialData(
            adapterConfig.primaryCredentialId,
            "OAUTH"
        )) as OAuthData;

        if (!profile.clientId || !profile.clientSecret) {
            return NextResponse.json({ error: "Client ID and Client Secret are required" }, { status: 400 });
        }

        // Build callback URL from the request origin
        const origin = process.env.BETTER_AUTH_URL || req.nextUrl.origin;
        const redirectUri = `${origin}/api/adapters/google-drive/callback`;

        const oauth2Client = new google.auth.OAuth2(
            profile.clientId,
            profile.clientSecret,
            redirectUri
        );

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: SCOPES,
            prompt: "consent", // Force consent to always get refresh_token
            state: adapterId, // Pass adapter config ID as state for callback
        });

        log.info("Generated Google OAuth URL", { adapterId });

        return NextResponse.json({ success: true, data: { authUrl } });
    } catch (error) {
        log.error("Failed to generate Google OAuth URL", {}, error instanceof Error ? error : undefined);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to generate auth URL" },
            { status: 500 }
        );
    }
}
