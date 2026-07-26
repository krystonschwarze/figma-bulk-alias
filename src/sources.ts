import type { SourceCollection, TargetCollection } from './messages.ts';
import type { Pairable } from './pairing.ts';

/*
 * Library variables arrive as descriptors with a key instead of an id, and they only become real
 * Variables once imported. Matching needs name and resolvedType only, so previewing a library source
 * costs no imports at all. `id` is synthesised from the key so the self alias guard still holds.
 */
export interface SourceVariable extends Pairable {
  readonly importKey: string | null;
}

export async function readTargets(): Promise<TargetCollection[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map((mode) => ({ id: mode.modeId, name: mode.name })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SourceList {
  sources: SourceCollection[];
  libraryError: string | null;
}

export async function readSources(): Promise<SourceList> {
  const local = (await figma.variables.getLocalVariableCollectionsAsync()).map((collection) => ({
    kind: 'local' as const,
    ref: collection.id,
    name: collection.name,
    libraryName: null,
  }));

  let library: SourceCollection[] = [];
  let libraryError: string | null = null;

  try {
    const available = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    library = available.map((collection) => ({
      kind: 'library' as const,
      ref: collection.key,
      name: collection.name,
      libraryName: collection.libraryName,
    }));
  } catch (error) {
    /* A file with no enabled libraries, or no network, must not take the local path down with it. */
    const detail = error instanceof Error ? error.message : 'Libraries could not be read.';
    /* figma.teamLibrary is gated behind a manifest permission, and the raw message buries that. */
    libraryError = detail.includes('permission not specified')
      ? 'manifest.json is missing "permissions": ["teamlibrary"], so libraries cannot be read.'
      : detail;
  }

  const byName = (a: SourceCollection, b: SourceCollection): number => a.name.localeCompare(b.name);
  return { sources: [...local.sort(byName), ...library.sort(byName)], libraryError };
}

async function localVariables(collectionId: string): Promise<SourceVariable[]> {
  const all = await figma.variables.getLocalVariablesAsync();
  return all
    .filter((variable) => variable.variableCollectionId === collectionId)
    .map((variable) => ({
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      importKey: null,
    }));
}

async function libraryVariables(collectionKey: string): Promise<SourceVariable[]> {
  const all = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(collectionKey);
  return all.map((variable) => ({
    id: `library:${variable.key}`,
    name: variable.name,
    resolvedType: variable.resolvedType,
    importKey: variable.key,
  }));
}

export async function readSourceVariables(source: SourceCollection): Promise<SourceVariable[]> {
  return source.kind === 'library' ? libraryVariables(source.ref) : localVariables(source.ref);
}

export async function targetCollection(id: string): Promise<VariableCollection> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(id);
  if (!collection) throw new Error('That collection no longer exists.');
  return collection;
}

export async function targetVariables(collectionId: string): Promise<Variable[]> {
  const all = await figma.variables.getLocalVariablesAsync();
  return all.filter((variable) => variable.variableCollectionId === collectionId);
}

/** Turns a matched source into a real Variable, importing it from the library on first use. */
export async function resolveSource(variable: SourceVariable): Promise<Variable> {
  if (variable.importKey === null) {
    const local = await figma.variables.getVariableByIdAsync(variable.id);
    if (!local) throw new Error(`"${variable.name}" no longer exists.`);
    return local;
  }
  return figma.variables.importVariableByKeyAsync(variable.importKey);
}

export function isAlias(value: VariableValue | undefined): value is VariableAlias {
  return typeof value === 'object' && value !== null && 'type' in value
    ? value.type === 'VARIABLE_ALIAS'
    : false;
}
