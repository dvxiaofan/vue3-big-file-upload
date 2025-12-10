import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUpload } from '../useUpload';
import request from '../../utils/request';

// Mock request
vi.mock('../../utils/request', () => ({
    default: {
        post: vi.fn()
    }
}));

// Mock hash to be fast
vi.mock('../../utils/hash', () => ({
    calculateHash: vi.fn().mockResolvedValue('mock-hash')
}));

describe('useUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize with idle state', () => {
        const { status } = useUpload();
        expect(status.value.step).toBe('idle');
    });

    it('should handle file selection', () => {
        const { handleFileChange, file } = useUpload();
        const mockFile = new File(['test'], 'test.txt');
        
        // Mock event
        const event = {
            target: {
                files: [mockFile]
            }
        } as unknown as Event;
        
        handleFileChange(event);
        expect(file.value?.name).toBe(mockFile.name);
        expect(file.value?.size).toBe(mockFile.size);
    });
});
