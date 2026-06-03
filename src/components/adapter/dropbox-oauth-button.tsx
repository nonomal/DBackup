"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DropboxOAuthButtonProps {
    /** The OAUTH credential profile id to authorize */
    credentialId?: string;
    /** Whether the profile already has a refresh token */
    authorized?: boolean;
}

/**
 * OAuth authorization button for Dropbox.
 * Authorizes the selected OAUTH credential profile - no saved destination needed.
 */
export function DropboxOAuthButton({ credentialId, authorized }: DropboxOAuthButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    if (!credentialId) {
        return (
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    Select or create an OAuth credential profile (with the app key + secret) first, then authorize with Dropbox.
                </AlertDescription>
            </Alert>
        );
    }

    if (authorized) {
        return (
            <Alert className="border-green-500/30 bg-green-500/5 items-center [&>svg]:translate-y-0">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="flex items-center justify-between">
                    <span className="text-green-600">Dropbox is authorized.</span>
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
            const res = await fetch("/api/adapters/dropbox/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ credentialId }),
            });

            const data = await res.json();

            if (data.success && data.data?.authUrl) {
                // Redirect to Dropbox consent screen
                window.location.href = data.data.authUrl;
            } else {
                toast.error(data.error || "Failed to start authorization");
            }
        } catch {
            toast.error("Failed to start Dropbox authorization");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="space-y-3">
            <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-600">
                    Dropbox requires OAuth authorization. Click the button below to connect your Dropbox account.
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
                Authorize with Dropbox
            </Button>
        </div>
    );
}
