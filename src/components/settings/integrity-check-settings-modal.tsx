"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { saveIntegritySettings } from "@/app/actions/settings/integrity-settings";

export interface IntegritySettings {
    skipPassed: boolean;
    maxAgeDays: number;
    maxFileSizeMb: number;
}

interface IntegrityCheckSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialSettings: IntegritySettings;
    onSaved: (settings: IntegritySettings) => void;
}

export function IntegrityCheckSettingsModal({ open, onOpenChange, initialSettings, onSaved }: IntegrityCheckSettingsModalProps) {
    const [skipPassed, setSkipPassed] = useState(initialSettings.skipPassed);
    const [maxAgeDays, setMaxAgeDays] = useState(String(initialSettings.maxAgeDays));
    const [maxFileSizeMb, setMaxFileSizeMb] = useState(String(initialSettings.maxFileSizeMb));
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const result = await saveIntegritySettings({
                skipPassed,
                maxAgeDays: parseInt(maxAgeDays) || 0,
                maxFileSizeMb: parseInt(maxFileSizeMb) || 0,
            });
            if (result.success) {
                toast.success("Integrity check settings saved");
                onSaved({
                    skipPassed,
                    maxAgeDays: parseInt(maxAgeDays) || 0,
                    maxFileSizeMb: parseInt(maxFileSizeMb) || 0,
                });
                onOpenChange(false);
            } else {
                toast.error(result.error || "Failed to save settings");
            }
        } catch {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Integrity Check Settings</DialogTitle>
                    <DialogDescription>
                        Configure which backups are included in scheduled integrity checks.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-2">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="skip-passed" className="font-medium">Skip already verified backups</Label>
                            <p className="text-xs text-muted-foreground">
                                Only check backups that have never been verified or previously failed.
                                Backups with a passing result are skipped.
                            </p>
                        </div>
                        <Switch
                            id="skip-passed"
                            checked={skipPassed}
                            onCheckedChange={setSkipPassed}
                            className="shrink-0 mt-0.5"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="max-age" className="font-medium">Max backup age (days)</Label>
                        <div className="flex items-center gap-3">
                            <Input
                                id="max-age"
                                type="number"
                                min={0}
                                max={3650}
                                className="w-28"
                                value={maxAgeDays}
                                onChange={(e) => setMaxAgeDays(e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">0 = no limit</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Only verify backups newer than this many days. Older backups are counted as skipped.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="max-size" className="font-medium">Max file size (MB)</Label>
                        <div className="flex items-center gap-3">
                            <Input
                                id="max-size"
                                type="number"
                                min={0}
                                max={1000000}
                                className="w-28"
                                value={maxFileSizeMb}
                                onChange={(e) => setMaxFileSizeMb(e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">0 = no limit</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Skip files larger than this threshold. Mainly relevant for remote adapters
                            (SFTP, SMB, FTP, WebDAV, Dropbox) that must download the full file to verify.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
