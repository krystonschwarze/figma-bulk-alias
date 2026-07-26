import './styles.css';
import {
  byId,
  clear,
  fillSelect,
  onPluginMessage,
  postToPlugin,
  setVisible,
  showNotice,
} from '../../ui-kit/kit.ts';
import type {
  CollectionInfo,
  Outcome,
  PluginMessage,
  Preview,
  Side,
  UiMessage,
} from '../messages.ts';

const el = {
  matchCount: byId('matchCount'),
  sourceCollection: byId<HTMLSelectElement>('sourceCollection'),
  sourceGroup: byId<HTMLSelectElement>('sourceGroup'),
  targetCollection: byId<HTMLSelectElement>('targetCollection'),
  targetGroup: byId<HTMLSelectElement>('targetGroup'),
  mode: byId<HTMLSelectElement>('mode'),
  previewBody: byId('previewBody'),
  noticeGroup: byId('noticeGroup'),
  notice: byId('notice'),
  create: byId<HTMLButtonElement>('create'),
  remove: byId<HTMLButtonElement>('remove'),
};

let collections: CollectionInfo[] = [];
let preview: Preview | null = null;

function send(message: UiMessage): void {
  postToPlugin(message);
}

function collectionOption(collection: CollectionInfo): { value: string; label: string } {
  return { value: collection.id, label: collection.name };
}

function aliasSelection(): {
  sourceCollectionId: string;
  sourceGroup: string;
  targetCollectionId: string;
  targetGroup: string;
  modeId: string;
} | null {
  const sourceCollectionId = el.sourceCollection.value;
  const sourceGroup = el.sourceGroup.value;
  const targetCollectionId = el.targetCollection.value;
  const targetGroup = el.targetGroup.value;
  const modeId = el.mode.value;
  if (!sourceCollectionId || !sourceGroup || !targetCollectionId || !targetGroup || !modeId) {
    return null;
  }
  return { sourceCollectionId, sourceGroup, targetCollectionId, targetGroup, modeId };
}

function canRemove(): boolean {
  return Boolean(el.targetCollection.value && el.targetGroup.value && el.mode.value);
}

function syncButtons(): void {
  el.create.disabled = aliasSelection() === null || (preview?.matched.length ?? 0) === 0;
  el.remove.disabled = !canRemove();
}

function names(count: number): string {
  return count === 1 ? '1 name has' : `${count} names have`;
}

function renderWarning(text: string): HTMLElement {
  const line = document.createElement('p');
  line.className = 'fig-hint';
  line.textContent = text;
  return line;
}

function renderPreview(): void {
  clear(el.previewBody);
  el.matchCount.textContent = '';

  if (!preview) {
    el.previewBody.appendChild(renderWarning('Pick a source group and a target group.'));
    syncButtons();
    return;
  }

  const { matched, missingInTarget, missingInSource, typeMismatch } = preview;
  el.matchCount.textContent = matched.length > 0 ? `${matched.length} pairs` : '';

  if (matched.length === 0) {
    el.previewBody.appendChild(
      renderWarning('No variable names match between these two groups. Nothing would be linked.'),
    );
  } else {
    const list = document.createElement('div');
    list.className = 'pair-list';
    for (const pair of matched) {
      const row = document.createElement('div');
      row.className = 'pair';

      const leaf = document.createElement('span');
      leaf.className = 'pair__leaf';
      leaf.textContent = pair.leaf;

      const arrow = document.createElement('span');
      arrow.className = 'pair__arrow';
      arrow.textContent = '→';
      arrow.setAttribute('aria-label', 'aliases to');

      const target = document.createElement('span');
      target.className = 'pair__target';
      target.textContent = pair.targetName;
      target.title = pair.targetName;

      row.append(leaf, arrow, target);
      list.appendChild(row);
    }
    el.previewBody.appendChild(list);
  }

  const warnings: string[] = [];
  if (missingInTarget.length > 0) {
    warnings.push(`${names(missingInTarget.length)} no counterpart in the target group.`);
  }
  if (missingInSource.length > 0) {
    warnings.push(`${names(missingInSource.length)} no counterpart in the source group.`);
  }
  if (typeMismatch.length > 0) {
    const verb = typeMismatch.length === 1 ? 'pair has' : 'pairs have';
    warnings.push(`${typeMismatch.length} ${verb} different value types and stay untouched.`);
  }

  if (warnings.length > 0) {
    const box = document.createElement('div');
    box.className = 'warn-list';
    for (const warning of warnings) box.appendChild(renderWarning(warning));
    el.previewBody.appendChild(box);
  }

  syncButtons();
}

function requestPreview(): void {
  const selection = aliasSelection();
  preview = null;
  if (selection) send({ type: 'preview', selection });
  else renderPreview();
}

function syncModes(): void {
  const collection = collections.find((entry) => entry.id === el.targetCollection.value);
  const modes = collection?.modes ?? [];
  fillSelect(
    el.mode,
    modes.length === 0 ? 'Select a collection first' : 'Select a mode',
    modes.map((mode) => ({ value: mode.id, label: mode.name })),
  );
  el.mode.disabled = modes.length === 0;
  if (collection && modes.length === 1) el.mode.value = collection.modes[0]?.id ?? '';
}

function bindCollection(
  select: HTMLSelectElement,
  groupSelect: HTMLSelectElement,
  side: Side,
): void {
  select.addEventListener('change', () => {
    fillSelect(groupSelect, 'Loading groups', []);
    groupSelect.disabled = true;
    if (side === 'target') syncModes();
    if (select.value) send({ type: 'load-groups', side, collectionId: select.value });
    else fillSelect(groupSelect, 'Select a group', []);
    requestPreview();
  });
}

function describe(outcome: Outcome, verb: 'linked' | 'unlinked'): string {
  const parts = [`${outcome.applied} ${verb}`];
  if (outcome.skipped > 0) parts.push(`${outcome.skipped} skipped`);
  if (outcome.failed > 0) parts.push(`${outcome.failed} failed`);
  return parts.join(', ');
}

bindCollection(el.sourceCollection, el.sourceGroup, 'source');
bindCollection(el.targetCollection, el.targetGroup, 'target');

for (const select of [el.sourceGroup, el.targetGroup]) {
  select.addEventListener('change', requestPreview);
}
el.mode.addEventListener('change', syncButtons);

el.create.addEventListener('click', () => {
  const selection = aliasSelection();
  if (!selection) return;
  el.create.disabled = true;
  send({ type: 'create', selection });
});

el.remove.addEventListener('click', () => {
  if (!canRemove()) return;
  el.remove.disabled = true;
  send({
    type: 'remove',
    selection: {
      targetCollectionId: el.targetCollection.value,
      targetGroup: el.targetGroup.value,
      modeId: el.mode.value,
    },
  });
});

onPluginMessage<PluginMessage>((message) => {
  switch (message.type) {
    case 'collections': {
      collections = message.collections;
      const options = collections.map(collectionOption);
      const placeholder = collections.length === 0 ? 'No collections yet' : 'Select a collection';
      fillSelect(el.sourceCollection, placeholder, options);
      fillSelect(el.targetCollection, placeholder, options);
      syncModes();
      renderPreview();
      return;
    }
    case 'groups': {
      const select = message.side === 'source' ? el.sourceGroup : el.targetGroup;
      fillSelect(
        select,
        message.groups.length === 0 ? 'No groups in this collection' : 'Select a group',
        message.groups.map((group) => ({ value: group, label: group })),
      );
      select.disabled = message.groups.length === 0;
      requestPreview();
      return;
    }
    case 'preview':
      preview = message.preview;
      renderPreview();
      return;
    case 'done':
      setVisible(el.noticeGroup, true);
      showNotice(
        el.notice,
        message.outcome.failed > 0 ? 'error' : 'success',
        describe(message.outcome, message.verb),
      );
      requestPreview();
      return;
    case 'error':
      setVisible(el.noticeGroup, true);
      showNotice(el.notice, 'error', message.message);
      syncButtons();
      return;
  }
});

renderPreview();
