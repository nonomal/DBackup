import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stepRetention } from '@/lib/runner/steps/05-retention';
import { RunnerContext, DestinationContext } from '@/lib/runner/types';
import { RetentionService } from '@/services/backup/retention-service';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
    default: {
        execution: { update: vi.fn() },
        systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    }
}));
vi.mock('@/lib/logging/logger', () => ({
    logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('@/services/backup/retention-service');
vi.mock('@/services/dashboard-service', () => ({
    refreshStorageStatsCache: vi.fn().mockResolvedValue(undefined),
}));

describe('Step 05 - Per-Destination Retention', () => {
    let ctx: RunnerContext;
    let mockList: ReturnType<typeof vi.fn>;
    let mockDelete: ReturnType<typeof vi.fn>;
    let mockRead: ReturnType<typeof vi.fn>;

    function makeBackupFiles(count: number) {
        return Array.from({ length: count }, (_, i) => ({
            name: `Test_Job_2026-01-0${i + 1}.sql`,
            path: `/Test Job/Test_Job_2026-01-0${i + 1}.sql`,
            size: 1000,
            lastModified: new Date(2026, 0, i + 1),
        }));
    }

    function createDestination(overrides: Partial<DestinationContext> = {}): DestinationContext {
        return {
            configId: 'dest-1',
            configName: 'Test Dest',
            adapter: {
                type: 'storage',
                upload: vi.fn(),
                download: vi.fn(),
                list: mockList,
                delete: mockDelete,
                read: mockRead,
            } as any,
            config: { path: '/backups' },
            retention: { mode: 'NONE' },
            priority: 0,
            adapterId: 'local-filesystem',
            uploadResult: { success: true, path: '/Test Job/backup.sql' },
            ...overrides,
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mockList = vi.fn().mockResolvedValue([]);
        mockDelete = vi.fn().mockResolvedValue(true);
        mockRead = vi.fn().mockRejectedValue(new Error('no meta'));

        ctx = {
            jobId: 'job-1',
            status: 'Success',
            startedAt: new Date(),
            logs: [],
            log: vi.fn(),
            updateProgress: vi.fn(),
            execution: { id: 'exec-1' } as any,
            destinations: [],
            job: {
                id: 'job-1',
                name: 'Test Job',
                source: { id: 's1', name: 'DB' },
                destinations: [],
                notifications: [],
            } as any,
        } as unknown as RunnerContext;
    });

    it('should skip retention for destinations with no policy', async () => {
        ctx.destinations = [createDestination({ retention: { mode: 'NONE' } })];

        await stepRetention(ctx);

        expect(mockList).not.toHaveBeenCalled();
        expect(mockDelete).not.toHaveBeenCalled();
    });

    it('should skip retention for failed uploads', async () => {
        ctx.destinations = [
            createDestination({
                retention: { mode: 'SIMPLE', simple: { keepCount: 3 } },
                uploadResult: { success: false, error: 'failed' },
            }),
        ];

        await stepRetention(ctx);

        expect(mockList).not.toHaveBeenCalled();
    });

    it('should apply SIMPLE retention per destination', async () => {
        const files = makeBackupFiles(5);
        mockList.mockResolvedValue([
            ...files,
            ...files.map(f => ({
                ...f,
                name: f.name + '.meta.json',
                path: f.path + '.meta.json',
            })),
        ]);

        vi.mocked(RetentionService.calculateRetention).mockReturnValue({
            keep: files.slice(0, 3),
            delete: files.slice(3),
        });

        ctx.destinations = [
            createDestination({
                retention: { mode: 'SIMPLE', simple: { keepCount: 3 } },
            }),
        ];

        await stepRetention(ctx);

        expect(RetentionService.calculateRetention).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ name: expect.any(String) })]),
            expect.objectContaining({ mode: 'SIMPLE' }),
            expect.any(String)
        );
        // 2 files to delete × 2 (backup + meta each)
        expect(mockDelete).toHaveBeenCalledTimes(4);
    });

    it('should apply independent retention per destination', async () => {
        const files = makeBackupFiles(5);
        const listFn1 = vi.fn().mockResolvedValue(files);
        const listFn2 = vi.fn().mockResolvedValue(files);
        const deleteFn1 = vi.fn().mockResolvedValue(true);
        const deleteFn2 = vi.fn().mockResolvedValue(true);

        // First dest: SIMPLE keep 3
        vi.mocked(RetentionService.calculateRetention)
            .mockReturnValueOnce({ keep: files.slice(0, 3), delete: files.slice(3) })
            // Second dest: SIMPLE keep 1
            .mockReturnValueOnce({ keep: files.slice(0, 1), delete: files.slice(1) });

        ctx.destinations = [
            createDestination({
                configId: 'd1',
                configName: 'Local',
                retention: { mode: 'SIMPLE', simple: { keepCount: 3 } },
                adapter: { list: listFn1, delete: deleteFn1, read: mockRead } as any,
            }),
            createDestination({
                configId: 'd2',
                configName: 'S3',
                priority: 1,
                retention: { mode: 'SIMPLE', simple: { keepCount: 1 } },
                adapter: { list: listFn2, delete: deleteFn2, read: mockRead } as any,
            }),
        ];

        await stepRetention(ctx);

        // Both destinations had retention applied
        expect(RetentionService.calculateRetention).toHaveBeenCalledTimes(2);
        // Local: 2 files deleted × 2 = 4 calls
        expect(deleteFn1).toHaveBeenCalledTimes(4);
        // S3: 4 files deleted × 2 = 8 calls
        expect(deleteFn2).toHaveBeenCalledTimes(8);
    });

    it('should continue retention for other destinations if one fails', async () => {
        const files = makeBackupFiles(3);
        const listFailing = vi.fn().mockRejectedValue(new Error('Network error'));
        const listOk = vi.fn().mockResolvedValue(files);
        const deleteFn = vi.fn().mockResolvedValue(true);

        vi.mocked(RetentionService.calculateRetention).mockReturnValue({
            keep: files.slice(0, 1),
            delete: files.slice(1),
        });

        ctx.destinations = [
            createDestination({
                configId: 'd1',
                configName: 'Failing',
                retention: { mode: 'SIMPLE', simple: { keepCount: 1 } },
                adapter: { list: listFailing, delete: vi.fn(), read: mockRead } as any,
            }),
            createDestination({
                configId: 'd2',
                configName: 'Working',
                priority: 1,
                retention: { mode: 'SIMPLE', simple: { keepCount: 1 } },
                adapter: { list: listOk, delete: deleteFn, read: mockRead } as any,
            }),
        ];

        // Should not throw
        await expect(stepRetention(ctx)).resolves.not.toThrow();

        // Second destination should still be processed
        expect(listOk).toHaveBeenCalled();
        expect(deleteFn).toHaveBeenCalled();
    });
});
