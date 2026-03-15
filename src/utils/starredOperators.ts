/**
 * Persistence for starred (favorited) operators.
 * Starred operators appear at the top of the operator selection dropdown.
 */

const STORAGE_KEY = 'zst-starred-operators';

export function getStarredOperators(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export function toggleStarredOperator(operatorId: string): Set<string> {
  const starred = getStarredOperators();
  if (starred.has(operatorId)) {
    starred.delete(operatorId);
  } else {
    starred.add(operatorId);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(starred)));
  return starred;
}
