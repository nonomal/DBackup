import { createReadStream } from "fs";
import crypto from "crypto";
import { CompressionType } from "@/lib/crypto/compression";
import { getProfileMasterKey, getEncryptionProfiles } from "@/services/backup/encryption-service";
import { BackupMetadata } from "@/lib/core/interfaces";

type LogFn = (msg: string, level?: 'info' | 'warning' | 'error' | 'success' | 'debug') => void;

/**
 * Resolves the master key for a given encrypted backup, attempting Smart Recovery
 * (trying every available profile) when the originally-referenced profile is missing.
 *
 * Returns the matching key. Throws if no profile can decrypt the file.
 */
export async function resolveDecryptionKey(
    encryptionMeta: NonNullable<BackupMetadata['encryption']>,
    tempFile: string,
    compressionMeta: CompressionType | undefined,
    log: LogFn,
): Promise<Buffer> {
    try {
        return await getProfileMasterKey(encryptionMeta.profileId);
    } catch (_keyError) {
        log(`Profile ${encryptionMeta.profileId} not found. Attempting Smart Recovery...`, 'warning');

        const allProfiles = await getEncryptionProfiles();
        log(`Smart Recovery: Found ${allProfiles.length} candidate profile(s).`, 'info');

        for (const profile of allProfiles) {
            log(`Smart Recovery: Testing profile '${profile.name}' (${profile.id})...`, 'info');
            try {
                const candidateKey = await getProfileMasterKey(profile.id);
                const isMatch = await checkKeyCandidate(candidateKey, encryptionMeta, tempFile, compressionMeta);
                if (isMatch) {
                    log(`Smart Recovery Successful: Matched key from profile '${profile.name}'.`, 'success');
                    return candidateKey;
                }
            } catch (e) {
                log(`Smart Recovery: Profile '${profile.name}' threw error: ${e instanceof Error ? e.message : String(e)}`, 'warning');
            }
        }

        throw new Error(`Profile ${encryptionMeta.profileId} missing, and no other profile could decrypt this file.`);
    }
}

/**
 * Heuristic check whether a candidate key successfully decrypts the first KB of the file.
 *
 * Strategy: Read the first 1 KB of the encrypted file, then call `crypto.Decipher.update()`
 * directly (NOT `final()`). This avoids AES-256-GCM auth-tag verification, which covers the
 * full ciphertext and always fails on a partial slice. The decrypted bytes are then checked
 * with content heuristics:
 *
 * - GZIP: valid decryption produces 0x1f 0x8b magic bytes.
 * - BROTLI / no compression: valid decryption produces >70% printable ASCII.
 */
function checkKeyCandidate(
    candidateKey: Buffer,
    encryptionMeta: NonNullable<BackupMetadata['encryption']>,
    tempFile: string,
    compressionMeta: CompressionType | undefined,
): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const iv = Buffer.from(encryptionMeta.iv, 'hex');
            const authTag = Buffer.from(encryptionMeta.authTag, 'hex');
            const chunks: Buffer[] = [];
            const input = createReadStream(tempFile, { start: 0, end: 1023 });

            input.on('error', () => resolve(false));
            input.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            input.on('end', () => {
                try {
                    const encrypted = Buffer.concat(chunks);
                    if (encrypted.length === 0) { resolve(false); return; }

                    // Use crypto.Decipher.update() directly.
                    // We intentionally skip final() so that auth-tag verification is never
                    // triggered on this partial 1 KB slice (the tag covers the full file).
                    const decipher = crypto.createDecipheriv('aes-256-gcm', candidateKey, iv);
                    decipher.setAuthTag(authTag);
                    const decrypted = decipher.update(encrypted);

                    resolve(isValidDecryptedContent(decrypted, compressionMeta));
                } catch (_e) {
                    resolve(false);
                }
            });
        } catch (_e) {
            resolve(false);
        }
    });
}

/**
 * Checks whether decrypted bytes look like valid backup content.
 *
 * Supported format detection (in order):
 * - GZIP magic (0x1f 0x8b): catches pipeline GZIP compression AND mongodump --gzip archives.
 *   Checked unconditionally so that formats that are inherently gzip (e.g. MongoDB single-DB
 *   archive) are matched even when no pipeline compression is configured (compressionMeta
 *   is undefined).  When compressionMeta IS 'GZIP' and the magic does not match we return
 *   false immediately (wrong key).
 * - PostgreSQL custom format (pg_dump -Fc): file starts with the 5-byte magic "PGDMP".
 *   Applies to all single-DB PostgreSQL backups regardless of the -Z compression level,
 *   because the compression is internal to the custom format and does not change the header.
 * - TAR: POSIX/GNU tar stores "ustar" at header offset 257.  Catches uncompressed .tar.enc
 *   multi-DB archives.
 * - BROTLI or plain SQL dumps: >70% of bytes must be printable ASCII.
 */
function isValidDecryptedContent(chunk: Buffer, compressionMeta: CompressionType | undefined): boolean {
    if (chunk.length < 2) return false;

    // GZIP magic - checked unconditionally so it matches both pipeline GZIP and any
    // format that is inherently gzip (e.g. mongodump --archive --gzip single-DB files).
    if (chunk[0] === 0x1f && chunk[1] === 0x8b) {
        return true;
    }
    // If we expected GZIP but magic is absent the key is wrong.
    if (compressionMeta === 'GZIP') {
        return false;
    }

    // PostgreSQL custom format (pg_dump -Fc): 5-byte ASCII header "PGDMP".
    // This covers ALL single-DB PostgreSQL backups regardless of the -Z compression
    // algorithm (NONE / GZIP / LZ4 / ZSTD / LEGACY) because the native compression is
    // stored inside the custom format - the outer file header is always "PGDMP".
    if (chunk.length >= 5 && chunk.subarray(0, 5).toString('ascii') === 'PGDMP') {
        return true;
    }

    // TAR magic: POSIX/GNU tar writes "ustar" at header offset 257.
    // This catches uncompressed .tar.enc backups (multi-db format).
    if (chunk.length >= 262 && chunk.subarray(257, 262).toString('ascii') === 'ustar') {
        return true;
    }

    // SQLite database file: starts with the fixed 15-byte ASCII string "SQLite format 3"
    // followed by a NUL byte.  The rest of the header is binary, so the >70% ASCII check
    // would fail for an otherwise-correct key.
    if (chunk.length >= 15 && chunk.subarray(0, 15).toString('ascii') === 'SQLite format 3') {
        return true;
    }

    // Redis RDB snapshot: starts with the 5-byte ASCII string "REDIS" followed by a
    // 4-digit version number (e.g. "REDIS0011").  Everything after that is binary BSON-like
    // data, so the >70% ASCII check would not be reliable.
    if (chunk.length >= 5 && chunk.subarray(0, 5).toString('ascii') === 'REDIS') {
        return true;
    }

    // For BROTLI or plain SQL dumps, check for printable ASCII ratio.
    const printable = chunk.filter(b => b >= 0x20 && b <= 0x7e).length;
    return printable / chunk.length > 0.7;
}
