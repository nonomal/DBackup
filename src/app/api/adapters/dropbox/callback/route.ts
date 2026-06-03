import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDecryptedCredentialData, updateCredentialProfile } from "@/services/auth/credential-service";
import type { OAuthData } from "@/lib/core/credentials";
import { logger } from "@/lib/logging/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const log = logger.child({ route: "adapters/dropbox/callback" });

/**
 * GET /api/adapters/dropbox/callback
 * Handles the OAuth callback from Dropbox.
 * Exchanges auth code for tokens and stores the refresh token in the adapter config.
 * Redirects back to the destinations page with success/error status.
 */
export async function GET(req: NextRequest) {
    const origin = process.env.BETTER_AUTH_URL || req.nextUrl.origin;

    // Verify the user is authenticated before processing the OAuth callback
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        log.warn("Unauthenticated Dropbox OAuth callback attempt");
        return NextResponse.redirect(
            `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent("Authentication required. Please log in and try again.")}`
        );
    }

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state"); // adapter config ID
    const error = req.nextUrl.searchParams.get("error");
    const errorDescription = req.nextUrl.searchParams.get("error_description");

    // Handle user denial
    if (error) {
        log.warn("Dropbox OAuth denied by user", { error, errorDescription });
        return NextResponse.redirect(
            `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent(errorDescription || "Authorization was denied by the user.")}`
        );
    }

    if (!code || !state) {
        log.warn("Missing code or state in Dropbox OAuth callback");
        return NextResponse.redirect(
            `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent("Missing authorization code or state.")}`
        );
    }

    try {
        // Load the adapter config
        const adapterConfig = await prisma.adapterConfig.findUnique({
            where: { id: state },
        });

        if (!adapterConfig || adapterConfig.adapterId !== "dropbox") {
            return NextResponse.redirect(
                `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent("Adapter not found.")}`
            );
        }

        if (!adapterConfig.primaryCredentialId) {
            return NextResponse.redirect(
                `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent("Assign an OAuth credential profile (with the app key + secret) before authorizing.")}`
            );
        }

        const profile = (await getDecryptedCredentialData(
            adapterConfig.primaryCredentialId,
            "OAUTH"
        )) as OAuthData;

        const redirectUri = `${origin}/api/adapters/dropbox/callback`;

        // Exchange authorization code for tokens using direct API call
        // (DropboxAuth SDK has issues with token exchange in server environments)
        const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                code,
                grant_type: "authorization_code",
                client_id: profile.clientId,
                client_secret: profile.clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenRes.ok) {
            const errorBody = await tokenRes.text();
            log.error("Dropbox token exchange failed", { status: tokenRes.status, body: errorBody });
            return NextResponse.redirect(
                `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent(`Token exchange failed: ${tokenRes.status}`)}`
            );
        }

        const tokenData = await tokenRes.json();

        if (!tokenData.refresh_token) {
            log.warn("No refresh token received from Dropbox", { adapterId: state });
            return NextResponse.redirect(
                `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent("No refresh token received. Ensure the app has 'offline' access configured.")}`
            );
        }

        // Store the refresh token in the credential profile (not the adapter config).
        await updateCredentialProfile(adapterConfig.primaryCredentialId, {
            data: { clientId: profile.clientId, clientSecret: profile.clientSecret, refreshToken: tokenData.refresh_token } satisfies OAuthData,
        });

        log.info("Dropbox OAuth completed successfully", { adapterId: state });

        return NextResponse.redirect(
            `${origin}/dashboard/destinations?oauth=success&message=${encodeURIComponent("Dropbox authorized successfully!")}`
        );
    } catch (err) {
        log.error("Dropbox OAuth callback failed", {}, err instanceof Error ? err : undefined);
        const message = err instanceof Error ? err.message : "OAuth callback failed";
        return NextResponse.redirect(
            `${origin}/dashboard/destinations?oauth=error&message=${encodeURIComponent(message)}`
        );
    }
}
