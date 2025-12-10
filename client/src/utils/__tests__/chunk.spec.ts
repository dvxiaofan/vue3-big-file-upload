import { describe, it, expect } from 'vitest';
import { createChunks } from '../chunk';

describe('createChunks', () => {
    it('should split file into correct chunks', () => {
        // Mock a file of 25 bytes
        const content = new Array(25).fill('a').join('');
        const file = new File([content], 'test.txt', { type: 'text/plain' });
        
        // Chunk size 10 bytes
        const chunks = createChunks(file, 10);
        
        expect(chunks.length).toBe(3);
        expect(chunks[0].size).toBe(10);
        expect(chunks[1].size).toBe(10);
        expect(chunks[2].size).toBe(5);
    });

    it('should handle file smaller than chunk size', () => {
        const content = 'abc';
        const file = new File([content], 'test.txt');
        const chunks = createChunks(file, 10);
        
        expect(chunks.length).toBe(1);
        expect(chunks[0].size).toBe(3);
    });

    it('should handle empty file', () => {
        const file = new File([], 'empty.txt');
        const chunks = createChunks(file, 10);
        
        expect(chunks.length).toBe(0);
    });
});
