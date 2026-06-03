"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface GoogleDriveOAuthButtonProps {
    /** The OAUTH credential profile id to authorize */
    credentialId?: string;
    /** Whether the profile already has a refresh token */
    authorized?: boolean;
}

/**
 * OAuth authorization button for Google Drive.
 * Authorizes the selected OAUTH credential profile - no saved destination needed.
 */
export function GoogleDriveOAuthButton({ credentialId, authorized }: GoogleDriveOAuthButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    if (!credentialId) {
        return (
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    Select or create an OAuth credential profile (with the client ID + secret) first, then authorize with Google.
                </AlertDescription>
            </Alert>
        );
    }

    if (authorized) {
        return (
            <Alert className="border-green-500/30 bg-green-500/5 items-center [&>svg]:translate-y-0">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="flex items-center justify-between">
                    <span className="text-green-600">Google Drive is authorized.</span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAuthorize()}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                        Re-authorize
                    </Button>
                </AlertDescription>
            </Alert>
        );
    }

    async function handleAuthorize() {
        setIsLoading(true);
        try {
            const res = await fetch("/api/adapters/google-drive/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credentialId }),
            });

            const data = await res.json();

            if (data.success && data.data?.authUrl) {
                // Redirect to Google consent screen
                window.location.href = data.data.authUrl;
            } else {
                toast.error(data.error || "Failed to start authorization");
            }
        } catch {
            toast.error("Failed to start Google authorization");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="space-y-3">
            <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-600">
                    Google Drive requires OAuth authorization. Click the button below to connect your Google account.
                </AlertDescription>
            </Alert>
            <Button
                type="button"
                variant="default"
                onClick={handleAuthorize}
                disabled={isLoading}
                className="w-full"
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Authorize with Google
            </Button>
        </div>
    );
}
