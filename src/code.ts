import type {
  AliasSelection,
  CollectionInfo,
  Outcome,
  PluginMessage,
  Preview,
  RemoveSelection,
  UiMessage,
} from './messages.ts';
import { byLeaf, groupsOf, match } from './pairing.ts';

const MAX_ALIAS_DEPTH = 16;

figma.showUI(__html__, {
  width: 340,
  height: 580,
  title: 'Bulk Alias',
  themeColors: true,
});

function send(message: PluginMessage): void {
  figma.ui.postMessage(message);
}

function isAlias(value: VariableValue | undefined): value is VariableAlias {
  return typeof value === 'object' && value !== null && 'type' in value
    ? value.type === 'VARIABLE_ALIAS'
    : false;
}

async function collectionById(id: string): Promise<VariableCollection> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(id);
  if (!collection) throw new Error('That collection no longer exists.');
  return collection;
}

async function variablesOf(collection: VariableCollection): Promise<Variable[]> {
  const loaded = await Promise.all(
    collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)),
  );
  return loaded.filter((variable): variable is Variable => variable !== null);
}

async function readCollections(): Promise<CollectionInfo[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      defaultModeId: collection.defaultModeId,
      modes: collection.modes.map((mode) => ({ id: mode.modeId, name: mode.name })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function readGroups(collectionId: string): Promise<string[]> {
  const collection = await collectionById(collectionId);
  return groupsOf(await variablesOf(collection));
}

interface Sides {
  source: Map<string, Variable>;
  target: Map<string, Variable>;
}

async function readSides(selection: AliasSelection): Promise<Sides> {
  const [sourceCollection, targetCollection] = await Promise.all([
    collectionById(selection.sourceCollectionId),
    collectionById(selection.targetCollectionId),
  ]);
  const [sourceVariables, targetVariables] = await Promise.all([
    variablesOf(sourceCollection),
    variablesOf(targetCollection),
  ]);
  return {
    source: byLeaf(sourceVariables, selection.sourceGroup),
    target: byLeaf(targetVariables, selection.targetGroup),
  };
}

async function buildPreview(selection: AliasSelection): Promise<Preview> {
  const { source, target } = await readSides(selection);
  return match(source, target);
}

/* Writing goes through the same match() the preview uses, so the two can never disagree. */
async function createAliases(selection: AliasSelection): Promise<Outcome> {
  const targetCollection = await collectionById(selection.targetCollectionId);
  if (!targetCollection.modes.some((mode) => mode.modeId === selection.modeId)) {
    throw new Error('That mode does not belong to the target collection.');
  }

  const { source, target } = await readSides(selection);
  const preview = match(source, target);
  const outcome: Outcome = {
    applied: 0,
    skipped: preview.missingInTarget.length + preview.typeMismatch.length,
    failed: 0,
  };

  for (const pair of preview.matched) {
    const sourceVariable = source.get(pair.leaf);
    const targetVariable = target.get(pair.leaf);
    if (!sourceVariable || !targetVariable) {
      outcome.skipped += 1;
      continue;
    }

    try {
      targetVariable.setValueForMode(
        selection.modeId,
        figma.variables.createVariableAlias(sourceVariable),
      );
      outcome.applied += 1;
    } catch (error) {
      console.error(`Could not alias "${targetVariable.name}"`, error);
      outcome.failed += 1;
    }
  }

  return outcome;
}

/*
 * An alias is unlinked by writing back a concrete value. The value has to be read in the source
 * collection's own default mode, because mode ids are not shared across collections.
 */
async function resolveConcreteValue(
  variable: Variable,
  modeId: string,
  depth = 0,
): Promise<VariableValue | undefined> {
  const value = variable.valuesByMode[modeId];
  if (!isAlias(value)) return value;
  if (depth >= MAX_ALIAS_DEPTH) return undefined;

  const next = await figma.variables.getVariableByIdAsync(value.id);
  if (!next) return undefined;

  const nextCollection = await figma.variables.getVariableCollectionByIdAsync(
    next.variableCollectionId,
  );
  if (!nextCollection) return undefined;

  return resolveConcreteValue(next, nextCollection.defaultModeId, depth + 1);
}

async function removeAliases(selection: RemoveSelection): Promise<Outcome> {
  const targetCollection = await collectionById(selection.targetCollectionId);
  if (!targetCollection.modes.some((mode) => mode.modeId === selection.modeId)) {
    throw new Error('That mode does not belong to the target collection.');
  }

  const target = byLeaf(await variablesOf(targetCollection), selection.targetGroup);
  const outcome: Outcome = { applied: 0, skipped: 0, failed: 0 };

  for (const variable of target.values()) {
    const current = variable.valuesByMode[selection.modeId];
    if (!isAlias(current)) {
      outcome.skipped += 1;
      continue;
    }

    try {
      const concrete = await resolveConcreteValue(variable, selection.modeId);
      if (concrete === undefined) {
        outcome.failed += 1;
        continue;
      }
      variable.setValueForMode(selection.modeId, concrete);
      outcome.applied += 1;
    } catch (error) {
      console.error(`Could not unlink "${variable.name}"`, error);
      outcome.failed += 1;
    }
  }

  return outcome;
}

async function handleMessage(message: UiMessage): Promise<void> {
  switch (message.type) {
    case 'load-groups':
      send({ type: 'groups', side: message.side, groups: await readGroups(message.collectionId) });
      return;
    case 'preview':
      send({ type: 'preview', preview: await buildPreview(message.selection) });
      return;
    case 'create': {
      const outcome = await createAliases(message.selection);
      send({ type: 'done', outcome, verb: 'linked' });
      figma.notify(summarize(outcome, 'linked'), { error: outcome.failed > 0 });
      return;
    }
    case 'remove': {
      const outcome = await removeAliases(message.selection);
      send({ type: 'done', outcome, verb: 'unlinked' });
      figma.notify(summarize(outcome, 'unlinked'), { error: outcome.failed > 0 });
      return;
    }
  }
}

function summarize(outcome: Outcome, verb: 'linked' | 'unlinked'): string {
  const parts = [`${outcome.applied} ${verb}`];
  if (outcome.skipped > 0) parts.push(`${outcome.skipped} skipped`);
  if (outcome.failed > 0) parts.push(`${outcome.failed} failed`);
  return parts.join(', ');
}

figma.ui.onmessage = (message: UiMessage) => {
  void handleMessage(message).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    send({ type: 'error', message: detail });
    figma.notify(detail, { error: true });
  });
};

async function start(): Promise<void> {
  send({ type: 'collections', collections: await readCollections() });
}

void start();
