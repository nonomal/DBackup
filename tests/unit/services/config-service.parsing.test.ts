import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '../../../src/services/config/config-service';
import { PassThrough } from 'stream';
import * as fs from 'fs';

// -- MOCKS --

// 1. Mock FS
vi.mock('fs', async () => {
    const createReadStream = vi.fn();
    const promises = {
        stat: vi.fn(),
        readFile: vi.fn(),
    };
    return {
        createReadStream,
        promises,
        default: { createReadStream, promises }
    }
});

// 2. Mock Zlib
vi.mock('zlib', () => {
    const createGunzip = vi.fn().mockImplementation(() => {
        const pt = new PassThrough();
        return pt;
    });
    return {
        createGunzip,
        default: { createGunzip }
    };
});

// 3. Mock Crypto Stream
vi.mock('@/lib/crypto/stream', () => ({
    createDecryptionStream: vi.fn().mockImplementation(() => {
        const pt = new PassThrough();
        return pt;
    })
}));

// 4. Mock Encryption Service
vi.mock('@/services/backup/encryption-service', () => ({
    getProfileMasterKey: vi.fn().mockResolvedValue(Buffer.from('mock-key')),
}));

// 5. Mock Prisma
vi.mock('@/lib/prisma', () => ({ default: {} }));

// Imports for assertions
import { createReadStream } from 'fs';
import { createDecryptionStream } from '@/lib/crypto/stream';
import { createGunzip } from 'zlib';

describe('ConfigService Parsing (Offline Restore)', () => {
    let service: ConfigService;

    beforeEach(() => {
        service = new ConfigService();
        vi.clearAllMocks();
    });

    const mockFileContent = JSON.stringify({
        metadata: { sourceType: 'SYSTEM', version: '1.0' },
        settings: []
    });

    const setupFsMock = (content: string, metaContent?: string) => {
        // Mock File Read Stream
        const stream = new PassThrough();
        stream.write(content);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        // Mock Stat & ReadFile for Metadata
        if (metaContent) {
            (fs.promises.stat as any).mockResolvedValue({ isFile: () => true });
            (fs.promises.readFile as any).mockResolvedValue(metaContent);
        } else {
            (fs.promises.stat as any).mockRejectedValue(new Error("No Ent"));
        }
    };

    it('should parse a plain JSON backup file', async () => {
        setupFsMock(mockFileContent);

        const result = await service.parseBackupFile('backup.json');

        expect(result).toBeDefined();
        expect(result.metadata.sourceType).toBe('SYSTEM');
        expect(createGunzip).not.toHaveBeenCalled();
        expect(createDecryptionStream).not.toHaveBeenCalled();
    });

    it('should detect compression by extension and attach Gunzip', async () => {
        setupFsMock(mockFileContent);

        const result = await service.parseBackupFile('backup.json.gz');

        expect(createGunzip).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    it('should handle Encrypted Backup with Standard Metadata', async () => {
        setupFsMock(mockFileContent, JSON.stringify({
            encryption: {
                enabled: true,
                profileId: 'p1',
                iv: '1234',
                authTag: '5678'
            },
            compression: 'GZIP'
        }));

        const result = await service.parseBackupFile('backup.json.gz.enc', 'backup.json.gz.enc.meta.json');

        expect(createDecryptionStream).toHaveBeenCalledWith(
            expect.anything(), // Key (Buffer)
            Buffer.from('1234', 'hex'),
            Buffer.from('5678', 'hex')
        );
        expect(createGunzip).toHaveBeenCalled(); // .gz is in name
        expect(result).toBeDefined();
    });

    it('should handle Encrypted Backup with Legacy/Config Metadata (Flat)', async () => {
        setupFsMock(mockFileContent, JSON.stringify({
            encryptionProfileId: 'p1',
            iv: 'aabb',
            authTag: 'ccdd'
        }));

        const result = await service.parseBackupFile('backup.enc', 'backup.enc.meta.json');

        expect(createDecryptionStream).toHaveBeenCalledWith(
            expect.anything(),
            Buffer.from('aabb', 'hex'),
            Buffer.from('ccdd', 'hex')
        );
        expect(result).toBeDefined();
    });

    it('should throw if Encrypted file is missing metadata (IV/AuthTag)', async () => {
         setupFsMock(mockFileContent); // No metadata sidecar

         // It sees .enc extension, tries to set up crypto, but fails due to missing params
         await expect(service.parseBackupFile('backup.enc'))
            .rejects
            .toThrow("Encrypted backup detected but metadata (IV/AuthTag/Profile) is missing");
    });

    it('should fall back to extension detection when metaFilePath stat fails (line 31)', async () => {
        // Arrange: metaFilePath provided but the file does not exist (stat rejects)
        const stream = new PassThrough();
        stream.write(mockFileContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        (fs.promises.stat as any).mockRejectedValue(new Error('ENOENT: no such file'));
        // readFile should not be called

        // Act: provide metaFilePath but the sidecar doesn't exist
        const result = await service.parseBackupFile('backup.json', 'backup.json.meta.json');

        // Assert: gracefully falls back; no encryption/compression detected
        expect(result).toBeDefined();
        expect(createDecryptionStream).not.toHaveBeenCalled();
        expect(createGunzip).not.toHaveBeenCalled();
    });

    it('should silently ignore corrupt meta file and proceed without encryption (line 53)', async () => {
        // Arrange: stat resolves but the meta file contains invalid JSON
        (fs.promises.stat as any).mockResolvedValue({});
        (fs.promises.readFile as any).mockResolvedValue('THIS IS NOT VALID JSON !!!');

        const stream = new PassThrough();
        stream.write(mockFileContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        // Act: should not throw despite bad meta
        const result = await service.parseBackupFile('backup.json', 'backup.json.meta.json');

        // Assert: falls through without applying encryption
        expect(result).toBeDefined();
        expect(createDecryptionStream).not.toHaveBeenCalled();
    });

    it('should throw when the encryption profile key cannot be resolved (line 80)', async () => {
        // Arrange: encrypted file whose profile lookup throws
        const { getProfileMasterKey } = await import('@/services/backup/encryption-service');
        (getProfileMasterKey as any).mockRejectedValue(new Error('Profile not found in DB'));

        setupFsMock(mockFileContent, JSON.stringify({
            encryption: { enabled: true, profileId: 'missing-profile', iv: 'aabbccdd', authTag: 'eeff0011' },
        }));

        // Act & Assert
        await expect(service.parseBackupFile('backup.enc', 'backup.enc.meta.json'))
            .rejects
            .toThrow('ENCRYPTION_KEY_REQUIRED:missing-profile');
    });

    it('should wrap pipeline errors in a descriptive message (lines 105-106)', async () => {
        // Arrange: stream that emits an error during pipeline execution
        const errStream = new PassThrough();
        (createReadStream as any).mockImplementation(() => {
            process.nextTick(() => errStream.destroy(new Error('Disk read error')));
            return errStream;
        });
        (fs.promises.stat as any).mockRejectedValue(new Error('ENOENT'));

        // Act & Assert
        await expect(service.parseBackupFile('backup.json'))
            .rejects
            .toThrow('Failed to process backup file');
    });

    it('standard meta with encryption.enabled=true but no iv/authTag/profileId throws (false branches 39-41)', async () => {
        // Arrange: meta has enabled=true but no iv, authTag, or profileId
        (fs.promises.stat as any).mockResolvedValue({});
        (fs.promises.readFile as any).mockResolvedValue(JSON.stringify({
            encryption: { enabled: true }, // no iv, authTag, profileId
        }));

        const stream = new PassThrough();
        stream.write('dummy');
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        // All three if (meta.encryption.iv/authTag/profileId) checks are false
        // Then isEncrypted=true but iv/authTag/profileId all undefined -> throws
        await expect(service.parseBackupFile('backup.enc', 'backup.enc.meta.json'))
            .rejects
            .toThrow('Encrypted backup detected but metadata');
    });

    it('meta with no encryption object falls through legacy path without setting encryption (false branches 43-48)', async () => {
        // Arrange: meta has no encryption field at all - all legacy false branches taken
        (fs.promises.stat as any).mockResolvedValue({});
        (fs.promises.readFile as any).mockResolvedValue(JSON.stringify({
            compression: 'NONE', // valid meta but no encryption
        }));

        const stream = new PassThrough();
        stream.write(mockFileContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        // meta.iv = undefined -> line 45 false branch
        // meta.authTag = undefined -> line 46 false branch
        // meta.encryption = undefined -> line 48 false branch
        const result = await service.parseBackupFile('backup.json', 'backup.json.meta.json');
        expect(result).toBeDefined();
        expect(createDecryptionStream).not.toHaveBeenCalled();
    });

    it('auto-detect .gz fallback fires when meta says no compression but filename ends with .gz (line 61)', async () => {
        // Arrange: meta says compression NONE, but filename is .gz -> line 61 auto-detect
        (fs.promises.stat as any).mockResolvedValue({});
        (fs.promises.readFile as any).mockResolvedValue(JSON.stringify({
            compression: 'NONE', // meta says no gzip
        }));

        const stream = new PassThrough();
        stream.write(mockFileContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        // !isCompressed (false from meta) && filePath.endsWith('.gz') (true) -> isCompressed = true
        const result = await service.parseBackupFile('backup.json.gz', 'backup.json.gz.meta.json');
        expect(result).toBeDefined();
        expect(createGunzip).toHaveBeenCalled(); // gunzip was attached due to line 61
    });

    it('legacy flat format with non-NONE encryption string sets isEncrypted=true (line 48 true branch)', async () => {
        // Reset getProfileMasterKey since a prior test may have overridden it with mockRejectedValue
        const { getProfileMasterKey } = await import('@/services/backup/encryption-service');
        (getProfileMasterKey as any).mockResolvedValue(Buffer.alloc(32));

        (fs.promises.stat as any).mockResolvedValue({});
        (fs.promises.readFile as any).mockResolvedValue(JSON.stringify({
            encryption: 'AES-256-GCM',     // non-object, non-'NONE' string -> line 48 true
            iv: 'aabbccddeeff00112233445566778899',
            authTag: '00112233445566778899aabbccddeeff',
            encryptionProfileId: 'p1',
        }));

        const stream = new PassThrough();
        stream.write(mockFileContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        // isEncrypted=true via line 48, iv/authTag/profileId all set -> decryption stream attached
        const result = await service.parseBackupFile('backup.enc', 'backup.enc.meta.json');
        expect(result).toBeDefined();
        expect(createDecryptionStream).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// tryDecryptFile – exported helper (lines 125-157)
// ---------------------------------------------------------------------------
import { tryDecryptFile } from '@/services/config/parse';

describe('tryDecryptFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when meta has no IV or authTag', async () => {
        const result = await tryDecryptFile('/tmp/file.enc', Buffer.alloc(32), {}, false);
        expect(result).toBeNull();
    });

    it('returns null when meta has IV but no authTag', async () => {
        const result = await tryDecryptFile('/tmp/file.enc', Buffer.alloc(32), { iv: 'aabb' }, false);
        expect(result).toBeNull();
    });

    it('returns decrypted JSON content when decryption succeeds', async () => {
        const jsonContent = JSON.stringify({ metadata: { sourceType: 'SYSTEM', version: '1.0' } });
        const stream = new PassThrough();
        stream.write(jsonContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        const result = await tryDecryptFile(
            '/tmp/file.enc',
            Buffer.alloc(32),
            { encryption: { iv: 'aabb', authTag: 'ccdd' } },
            false,
        );

        expect(result).toBe(jsonContent.trim());
    });

    it('uses flat meta format (iv / authTag at root)', async () => {
        const jsonContent = JSON.stringify({ test: true });
        const stream = new PassThrough();
        stream.write(jsonContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        const result = await tryDecryptFile(
            '/tmp/file.enc',
            Buffer.alloc(32),
            { iv: 'aabb', authTag: 'ccdd' },
            false,
        );

        expect(result).not.toBeNull();
    });

    it('attaches gunzip when isCompressed=true', async () => {
        const jsonContent = JSON.stringify({ test: true });
        const stream = new PassThrough();
        stream.write(jsonContent);
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        await tryDecryptFile(
            '/tmp/file.enc.gz',
            Buffer.alloc(32),
            { iv: 'aabb', authTag: 'ccdd' },
            true,
        );

        expect(createGunzip).toHaveBeenCalled();
    });

    it('returns null when content does not look like JSON', async () => {
        const stream = new PassThrough();
        stream.write('BINARY_DATA_NOT_JSON');
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        const result = await tryDecryptFile(
            '/tmp/file.enc',
            Buffer.alloc(32),
            { iv: 'aabb', authTag: 'ccdd' },
            false,
        );

        expect(result).toBeNull();
    });

    it('returns null when the decryption stream throws (catches error)', async () => {
        const { createDecryptionStream } = await import('@/lib/crypto/stream');
        (createDecryptionStream as any).mockImplementationOnce(() => {
            const pt = new PassThrough();
            process.nextTick(() => pt.destroy(new Error('Bad auth tag')));
            return pt;
        });

        const stream = new PassThrough();
        stream.write('data');
        stream.end();
        (createReadStream as any).mockReturnValue(stream);

        const result = await tryDecryptFile(
            '/tmp/file.enc',
            Buffer.alloc(32),
            { iv: 'aabb', authTag: 'ccdd' },
            false,
        );

        expect(result).toBeNull();
    });
});
