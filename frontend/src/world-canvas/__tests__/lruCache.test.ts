import { describe, it, expect } from 'vitest';
import { createLruCache } from '../lruCache';

describe('createLruCache', () => {
  it('should return undefined for a missing key', () => {
    const cache = createLruCache<number>(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should store and retrieve values by key', () => {
    const cache = createLruCache<number>(2);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it('should evict the least recently used entry when the cap is exceeded', () => {
    const cache = createLruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it('should refresh recency on get so a recently read entry survives eviction', () => {
    const cache = createLruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' becomes most recently used
    cache.set('c', 3); // evicts 'b', not 'a'
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('should refresh recency on set of an existing key without growing', () => {
    const cache = createLruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // update + refresh
    cache.set('c', 3); // evicts 'b'
    expect(cache.get('a')).toBe(10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size()).toBe(2);
  });

  it('clearPrefix should remove only entries whose key starts with the prefix', () => {
    const cache = createLruCache<number>(10);
    cache.set('w1:0:0', 1);
    cache.set('w1:1:0', 2);
    cache.set('w2:0:0', 3);
    cache.clearPrefix('w1:');
    expect(cache.get('w1:0:0')).toBeUndefined();
    expect(cache.get('w1:1:0')).toBeUndefined();
    expect(cache.get('w2:0:0')).toBe(3);
    expect(cache.size()).toBe(1);
  });
});
