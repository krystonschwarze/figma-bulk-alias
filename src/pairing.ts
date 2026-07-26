import type { MatchedPair, Preview } from './messages.ts';

/* Structural subset of Variable, so the matching logic stays testable without the Figma API. */
export interface Pairable {
  readonly id: string;
  readonly name: string;
  readonly resolvedType: string;
}

export function groupOf(variableName: string): string {
  const index = variableName.lastIndexOf('/');
  return index === -1 ? '' : variableName.slice(0, index);
}

export function leafOf(variableName: string): string {
  const index = variableName.lastIndexOf('/');
  return index === -1 ? variableName : variableName.slice(index + 1);
}

export function byLeaf<T extends Pairable>(variables: readonly T[], group: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const variable of variables) {
    if (groupOf(variable.name) === group) result.set(leafOf(variable.name), variable);
  }
  return result;
}

/**
 * Pairs two groups on the leaf name. Never on collection order: two groups can hold the same
 * variables in a different order, and index based pairing silently produced wrong aliases.
 */
export function match(
  source: ReadonlyMap<string, Pairable>,
  target: ReadonlyMap<string, Pairable>,
): Preview {
  const matched: MatchedPair[] = [];
  const missingInTarget: string[] = [];
  const typeMismatch: string[] = [];

  for (const [leaf, sourceVariable] of source) {
    const targetVariable = target.get(leaf);
    if (!targetVariable) {
      missingInTarget.push(leaf);
      continue;
    }
    if (targetVariable.id === sourceVariable.id) continue;
    if (targetVariable.resolvedType !== sourceVariable.resolvedType) {
      typeMismatch.push(leaf);
      continue;
    }
    matched.push({ leaf, sourceName: sourceVariable.name, targetName: targetVariable.name });
  }

  const missingInSource = [...target.keys()].filter((leaf) => !source.has(leaf));
  const alpha = (a: string, b: string): number => a.localeCompare(b);

  return {
    matched: matched.sort((a, b) => alpha(a.leaf, b.leaf)),
    missingInTarget: missingInTarget.sort(alpha),
    missingInSource: missingInSource.sort(alpha),
    typeMismatch: typeMismatch.sort(alpha),
  };
}

export function groupsOf(variables: readonly Pairable[]): string[] {
  const groups = new Set(variables.map((variable) => groupOf(variable.name)));
  groups.delete('');
  return [...groups].sort((a, b) => a.localeCompare(b));
}
