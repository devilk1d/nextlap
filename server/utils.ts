export function omit<T extends object, K extends keyof T>(source: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...source };
  for (const key of keys) delete copy[key];
  return copy;
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}
