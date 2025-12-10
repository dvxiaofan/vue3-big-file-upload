import { describe, it, expect } from 'vitest';
import { calculateHash } from '../hash';

describe('calculateHash', () => {
    it('should return a hash string', async () => {
        const file = new File(['test content'], 'test.txt');
        const hash = await calculateHash(file);
        
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
    });

    it('should return consistent hash for same content', async () => {
        const file1 = new File(['hello world'], 'test1.txt');
        const file2 = new File(['hello world'], 'test2.txt'); // Different name, same content
        
        const hash1 = await calculateHash(file1);
        const hash2 = await calculateHash(file2);
        
        expect(hash1).toBe(hash2);
    });
});
