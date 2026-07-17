// Caché LRU genérica y acotada (IT-08, P07). Aprovecha que Map preserva el
// orden de inserción: get/set reinsertan la clave para marcarla como la más
// recientemente usada, y al superar el tope se desaloja la primera clave.
export interface LruCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  clearPrefix(prefix: string): void;
  size(): number;
}

export function createLruCache<V>(maxEntries: number): LruCache<V> {
  const store = new Map<string, V>();
  return {
    get(key: string): V | undefined {
      const value = store.get(key);
      if (value !== undefined) {
        store.delete(key);
        store.set(key, value);
      }
      return value;
    },
    set(key: string, value: V): void {
      store.delete(key);
      store.set(key, value);
      if (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
    clearPrefix(prefix: string): void {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },
    size(): number {
      return store.size;
    },
  };
}
