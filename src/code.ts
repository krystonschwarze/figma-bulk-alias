import { pairKey } from './messages.ts';
import type {
  AliasedVariable,
  LinkPlan,
  LinkRequest,
  ModePlan,
  ModeUnlinkPlan,
  Operation,
  Outcome,
  PluginMessage,
  UiMessage,
  UnlinkPlan,
  UnlinkRequest,
} from './messages.ts';
import { byLeaf, groupOf, groupsOf, match, naturalCompare } from './pairing.ts';
import {
  isAlias,
  readSourceVariables,
  probeLibraries,
  readSources,
  readTargets,
  resolveSource,
  targetCollection,
  targetVariables,
} from './sources.ts';

const MAX_ALIAS_DEPTH = 16;

figma.showUI(__html__, {
  width: 380,
  height: 680,
  title: 'Bulk Alias',
  themeColors: true,
});

function send(message: PluginMessage): void {
  figma.ui.postMessage(message);
}

function requireMode(collection: VariableCollection, modeId: string): ModeName {
  const mode = collection.modes.find((entry) => entry.modeId === modeId);
  if (!mode) throw new Error('A chosen mode does not belong to the target collection.');
  return { id: mode.modeId, name: mode.name };
}

interface ModeName {
  id: string;
  name: string;
}

async function planLink(request: LinkRequest): Promise<LinkPlan> {
  const collection = await targetCollection(request.targetCollectionId);
  const [sourceVars, targetVars] = await Promise.all([
    readSourceVariables(request.source),
    targetVariables(collection.id),
  ]);

  const target = byLeaf(targetVars, request.targetGroup);
  const modes: ModePlan[] = [];

  for (const assignment of request.assignments) {
    const mode = requireMode(collection, assignment.modeId);
    const source = byLeaf(sourceVars, assignment.sourceGroup);
    const result = match(source, target, (leaf) => pairKey(mode.id, leaf));
    modes.push({
      modeId: mode.id,
      modeName: mode.name,
      sourceGroup: assignment.sourceGroup,
      matched: result.matched,
      missingInTarget: result.missingInTarget,
      missingInSource: result.missingInSource,
      typeMismatch: result.typeMismatch,
    });
  }

  return { modes };
}

/* Writing runs through the same plan the preview showed, filtered to the boxes left ticked. */
async function applyLink(request: LinkRequest, keys: readonly string[]): Promise<Outcome> {
  const wanted = new Set(keys);
  const plan = await planLink(request);
  const collection = await targetCollection(request.targetCollectionId);

  const [sourceVars, targetVars] = await Promise.all([
    readSourceVariables(request.source),
    targetVariables(collection.id),
  ]);
  const targetByLeaf = byLeaf(targetVars, request.targetGroup);
  const outcome: Outcome = { applied: 0, skipped: 0, failed: 0 };
  const imported = new Map<string, Variable>();

  for (const modePlan of plan.modes) {
    const sourceByLeaf = byLeaf(sourceVars, modePlan.sourceGroup);
    outcome.skipped += modePlan.missingInTarget.length + modePlan.typeMismatch.length;

    for (const pair of modePlan.matched) {
      if (!wanted.has(pair.key)) {
        outcome.skipped += 1;
        continue;
      }

      const sourceVariable = sourceByLeaf.get(pair.leaf);
      const targetVariable = targetByLeaf.get(pair.leaf);
      if (!sourceVariable || !targetVariable) {
        outcome.skipped += 1;
        continue;
      }

      try {
        let resolved = imported.get(sourceVariable.id);
        if (!resolved) {
          resolved = await resolveSource(sourceVariable);
          imported.set(sourceVariable.id, resolved);
        }
        targetVariable.setValueForMode(
          modePlan.modeId,
          figma.variables.createVariableAlias(resolved),
        );
        outcome.applied += 1;
      } catch (error) {
        console.error(`Could not alias "${pair.targetName}"`, error);
        outcome.failed += 1;
      }
    }
  }

  return outcome;
}

async function aliasTargetName(value: VariableAlias): Promise<string> {
  const variable = await figma.variables.getVariableByIdAsync(value.id);
  return variable ? variable.name : 'unknown variable';
}

async function planUnlink(request: UnlinkRequest): Promise<UnlinkPlan> {
  const collection = await targetCollection(request.targetCollectionId);
  const target = byLeaf(await targetVariables(collection.id), request.targetGroup);

  const modes: ModeUnlinkPlan[] = [];
  for (const modeId of request.modeIds) {
    const mode = requireMode(collection, modeId);
    const aliased: AliasedVariable[] = [];
    let plain = 0;

    for (const [leaf, variable] of target) {
      const value = variable.valuesByMode[mode.id];
      if (!isAlias(value)) {
        plain += 1;
        continue;
      }
      aliased.push({
        key: pairKey(mode.id, leaf),
        leaf,
        targetName: variable.name,
        pointsAt: await aliasTargetName(value),
      });
    }

    aliased.sort((a, b) => naturalCompare(a.leaf, b.leaf));
    modes.push({ modeId: mode.id, modeName: mode.name, aliased, plain });
  }

  return { modes };
}

/*
 * An alias is unlinked by writing back a concrete value. The value has to be read in the source
 * collection's own default mode, because mode ids are not shared across collections.
 */
async function concreteValue(
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

  return concreteValue(next, nextCollection.defaultModeId, depth + 1);
}

async function applyUnlink(request: UnlinkRequest, keys: readonly string[]): Promise<Outcome> {
  const wanted = new Set(keys);
  const collection = await targetCollection(request.targetCollectionId);
  const target = byLeaf(await targetVariables(collection.id), request.targetGroup);
  const outcome: Outcome = { applied: 0, skipped: 0, failed: 0 };

  for (const modeId of request.modeIds) {
    const mode = requireMode(collection, modeId);
    for (const [leaf, variable] of target) {
      if (!isAlias(variable.valuesByMode[mode.id])) continue;
      if (!wanted.has(pairKey(mode.id, leaf))) {
        outcome.skipped += 1;
        continue;
      }

      try {
        const value = await concreteValue(variable, mode.id);
        if (value === undefined) {
          outcome.failed += 1;
          continue;
        }
        variable.setValueForMode(mode.id, value);
        outcome.applied += 1;
      } catch (error) {
        console.error(`Could not unlink "${variable.name}"`, error);
        outcome.failed += 1;
      }
    }
  }

  return outcome;
}

function summarize(outcome: Outcome, operation: Operation): string {
  const verb = operation === 'link' ? 'linked' : 'unlinked';
  const parts = [`${outcome.applied} ${verb}`];
  if (outcome.skipped > 0) parts.push(`${outcome.skipped} skipped`);
  if (outcome.failed > 0) parts.push(`${outcome.failed} failed`);
  return parts.join(', ');
}

async function handleMessage(message: UiMessage): Promise<void> {
  switch (message.type) {
    case 'reload':
      await start();
      return;

    case 'load-source-groups': {
      const variables = await readSourceVariables(message.source);
      send({
        type: 'source-groups',
        groups: groupsOf(variables),
        variableCount: variables.length,
        rootCount: variables.filter((variable) => groupOf(variable.name) === '').length,
      });
      return;
    }

    case 'load-target-groups': {
      const variables = await targetVariables(message.collectionId);
      send({ type: 'target-groups', groups: groupsOf(variables) });
      return;
    }

    case 'probe-libraries':
      send({ type: 'library-probe', results: await probeLibraries() });
      return;

    case 'plan-link':
      send({ type: 'link-plan', plan: await planLink(message.request) });
      return;

    case 'plan-unlink':
      send({ type: 'unlink-plan', plan: await planUnlink(message.request) });
      return;

    case 'apply-link': {
      const outcome = await applyLink(message.request, message.keys);
      send({ type: 'done', outcome, operation: 'link' });
      figma.notify(summarize(outcome, 'link'), { error: outcome.failed > 0 });
      return;
    }

    case 'apply-unlink': {
      const outcome = await applyUnlink(message.request, message.keys);
      send({ type: 'done', outcome, operation: 'unlink' });
      figma.notify(summarize(outcome, 'unlink'), { error: outcome.failed > 0 });
      return;
    }
  }
}

figma.ui.onmessage = (message: UiMessage) => {
  void handleMessage(message).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    send({ type: 'error', message: detail });
    figma.notify(detail, { error: true });
  });
};

async function start(): Promise<void> {
  const [{ sources, libraryError }, targets] = await Promise.all([readSources(), readTargets()]);
  send({ type: 'sources', sources, targets, libraryError });
}

void start();
