import './styles.css';
import {
  bindSegmented,
  byId,
  clear,
  fillSelect,
  onPluginMessage,
  postToPlugin,
  setVisible,
  showNotice,
} from '../../ui-kit/kit.ts';
import type {
  LinkPlan,
  LinkRequest,
  ModeAssignment,
  ModeInfo,
  Operation,
  Outcome,
  PluginMessage,
  SourceCollection,
  TargetCollection,
  UiMessage,
  UnlinkPlan,
  UnlinkRequest,
} from '../messages.ts';

const el = {
  meta: byId('headerMeta'),
  operationSwitch: byId('operationSwitch'),
  emptyView: byId('emptyView'),
  mainView: byId('mainView'),
  sourceGroupBox: byId('sourceGroupBox'),
  sourceCollection: byId<HTMLSelectElement>('sourceCollection'),
  libraryHint: byId('libraryHint'),
  targetCollection: byId<HTMLSelectElement>('targetCollection'),
  targetGroup: byId<HTMLSelectElement>('targetGroup'),
  modeBox: byId('modeBox'),
  modeLabel: byId('modeLabel'),
  modeCount: byId('modeCount'),
  modeRows: byId('modeRows'),
  modeHint: byId('modeHint'),
  previewBody: byId('previewBody'),
  toggleAll: byId<HTMLButtonElement>('toggleAll'),
  noticeGroup: byId('noticeGroup'),
  notice: byId('notice'),
  apply: byId<HTMLButtonElement>('apply'),
};

let operation: Operation = 'link';
let sources: SourceCollection[] = [];
let targets: TargetCollection[] = [];
let sourceGroups: string[] = [];
let linkPlan: LinkPlan | null = null;
let unlinkPlan: UnlinkPlan | null = null;

/* Which pair keys are ticked. Absent means ticked, so a fresh plan starts fully selected. */
const unticked = new Set<string>();

function send(message: UiMessage): void {
  postToPlugin(message);
}

function currentSource(): SourceCollection | undefined {
  return sources.find((s) => `${s.kind}:${s.ref}` === el.sourceCollection.value);
}

function currentTarget(): TargetCollection | undefined {
  return targets.find((t) => t.id === el.targetCollection.value);
}

function targetModes(): ModeInfo[] {
  return currentTarget()?.modes ?? [];
}

function hint(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'fig-hint';
  p.textContent = text;
  return p;
}

// ── mode rows ──

function modeSelect(mode: ModeInfo): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'fig-select';
  select.dataset.modeId = mode.id;
  select.setAttribute('aria-label', `Source group for mode ${mode.name}`);
  fillSelect(
    select,
    'Skip this mode',
    sourceGroups.map((group) => ({ value: group, label: group })),
  );
  select.addEventListener('change', requestPlan);
  return select;
}

function modeCheckbox(mode: ModeInfo): HTMLElement {
  const label = document.createElement('label');
  label.className = 'fig-check';
  label.innerHTML =
    `<input type="checkbox" data-mode-id="${mode.id}" checked />` +
    '<span class="fig-check__box" aria-hidden="true">' +
    '<svg viewBox="0 0 10 10" fill="none"><path d="M2 5.5 4 7.5 8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '</span>';
  label.append(document.createTextNode(mode.name));
  label.querySelector('input')?.addEventListener('change', requestPlan);
  return label;
}

function renderModeRows(): void {
  clear(el.modeRows);
  const modes = targetModes();

  if (modes.length === 0) {
    el.modeRows.appendChild(hint('Pick a target collection first.'));
    return;
  }

  for (const mode of modes) {
    if (operation === 'link') {
      const row = document.createElement('div');
      row.className = 'mode-row';
      const name = document.createElement('span');
      name.className = 'mode-row__name';
      name.textContent = mode.name;
      name.title = mode.name;
      row.append(name, modeSelect(mode));
      el.modeRows.appendChild(row);
    } else {
      el.modeRows.appendChild(modeCheckbox(mode));
    }
  }
}

function assignments(): ModeAssignment[] {
  return [...el.modeRows.querySelectorAll<HTMLSelectElement>('select[data-mode-id]')]
    .filter((select) => select.value !== '')
    .map((select) => ({ modeId: select.dataset.modeId ?? '', sourceGroup: select.value }));
}

function checkedModeIds(): string[] {
  return [...el.modeRows.querySelectorAll<HTMLInputElement>('input[data-mode-id]')]
    .filter((input) => input.checked)
    .map((input) => input.dataset.modeId ?? '');
}

// ── requests ──

function linkRequest(): LinkRequest | null {
  const source = currentSource();
  const target = currentTarget();
  const group = el.targetGroup.value;
  const assigned = assignments();
  if (!source || !target || !group || assigned.length === 0) return null;
  return {
    source,
    targetCollectionId: target.id,
    targetGroup: group,
    assignments: assigned,
  };
}

function unlinkRequest(): UnlinkRequest | null {
  const target = currentTarget();
  const group = el.targetGroup.value;
  const modeIds = checkedModeIds();
  if (!target || !group || modeIds.length === 0) return null;
  return { targetCollectionId: target.id, targetGroup: group, modeIds };
}

function requestPlan(): void {
  linkPlan = null;
  unlinkPlan = null;
  unticked.clear();

  if (operation === 'link') {
    const request = linkRequest();
    if (request) send({ type: 'plan-link', request });
    else renderPreview();
    return;
  }

  const request = unlinkRequest();
  if (request) send({ type: 'plan-unlink', request });
  else renderPreview();
}

// ── preview ──

function pairRow(key: string, left: string, right: string): HTMLElement {
  const row = document.createElement('label');
  row.className = 'pair';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'pair__box';
  box.checked = !unticked.has(key);
  box.addEventListener('change', () => {
    if (box.checked) unticked.delete(key);
    else unticked.add(key);
    syncApply();
  });

  const leaf = document.createElement('span');
  leaf.className = 'pair__leaf';
  leaf.textContent = left;
  leaf.title = left;

  const arrow = document.createElement('span');
  arrow.className = 'pair__arrow';
  arrow.textContent = '→';

  const target = document.createElement('span');
  target.className = 'pair__target';
  target.textContent = right;
  target.title = right;

  row.append(box, leaf, arrow, target);
  return row;
}

function modeHeading(text: string, count: string): HTMLElement {
  const head = document.createElement('div');
  head.className = 'mode-head';
  const name = document.createElement('span');
  name.textContent = text;
  const meta = document.createElement('span');
  meta.className = 'mode-head__meta';
  meta.textContent = count;
  head.append(name, meta);
  return head;
}

function renderLinkPreview(plan: LinkPlan): number {
  let total = 0;

  for (const mode of plan.modes) {
    el.previewBody.appendChild(
      modeHeading(`${mode.modeName} ← ${mode.sourceGroup}`, `${mode.matched.length} pairs`),
    );

    if (mode.matched.length === 0) {
      el.previewBody.appendChild(hint('No names match between these two groups.'));
    } else {
      const list = document.createElement('div');
      list.className = 'pair-list';
      for (const pair of mode.matched) {
        list.appendChild(pairRow(pair.key, pair.leaf, pair.targetName));
      }
      el.previewBody.appendChild(list);
      total += mode.matched.length;
    }

    const warnings: string[] = [];
    if (mode.missingInTarget.length > 0) {
      warnings.push(`${mode.missingInTarget.length} source names have no counterpart.`);
    }
    if (mode.missingInSource.length > 0) {
      warnings.push(`${mode.missingInSource.length} target names have no counterpart.`);
    }
    if (mode.typeMismatch.length > 0) {
      warnings.push(`${mode.typeMismatch.length} pairs differ in value type and stay untouched.`);
    }
    for (const warning of warnings) el.previewBody.appendChild(hint(warning));
  }

  return total;
}

function renderUnlinkPreview(plan: UnlinkPlan): number {
  let total = 0;

  for (const mode of plan.modes) {
    el.previewBody.appendChild(modeHeading(mode.modeName, `${mode.aliased.length} aliased`));

    if (mode.aliased.length === 0) {
      el.previewBody.appendChild(hint('Nothing in this group is aliased in this mode.'));
      continue;
    }

    const list = document.createElement('div');
    list.className = 'pair-list';
    for (const entry of mode.aliased) {
      list.appendChild(pairRow(entry.key, entry.leaf, entry.pointsAt));
    }
    el.previewBody.appendChild(list);
    total += mode.aliased.length;

    if (mode.plain > 0) {
      el.previewBody.appendChild(hint(`${mode.plain} already hold a concrete value.`));
    }
  }

  return total;
}

function renderPreview(): void {
  clear(el.previewBody);
  const plan = operation === 'link' ? linkPlan : unlinkPlan;

  if (!plan) {
    el.previewBody.appendChild(
      hint(
        operation === 'link'
          ? 'Pick a target group, then a source group per mode.'
          : 'Pick a target group and at least one mode.',
      ),
    );
    setVisible(el.toggleAll, false);
    syncApply();
    return;
  }

  const total =
    operation === 'link'
      ? renderLinkPreview(plan as LinkPlan)
      : renderUnlinkPreview(plan as UnlinkPlan);

  setVisible(el.toggleAll, total > 0);
  syncApply();
}

function allKeys(): string[] {
  if (operation === 'link') {
    return (linkPlan?.modes ?? []).flatMap((mode) => mode.matched.map((pair) => pair.key));
  }
  return (unlinkPlan?.modes ?? []).flatMap((mode) => mode.aliased.map((entry) => entry.key));
}

function selectedKeys(): string[] {
  return allKeys().filter((key) => !unticked.has(key));
}

function syncApply(): void {
  const selected = selectedKeys().length;
  const request = operation === 'link' ? linkRequest() : unlinkRequest();
  el.apply.disabled = request === null || selected === 0;
  el.apply.textContent =
    operation === 'link'
      ? selected > 0
        ? `Create ${selected} aliases`
        : 'Create aliases'
      : selected > 0
        ? `Unlink ${selected} variables`
        : 'Unlink variables';
  el.meta.textContent = selected > 0 ? `${selected} selected` : '';
  el.toggleAll.textContent = selected > 0 ? 'Deselect all' : 'Select all';
}

// ── wiring ──

const selectOperation = bindSegmented(el.operationSwitch, (value) => {
  operation = value as Operation;
  setVisible(el.sourceGroupBox, operation === 'link');
  el.modeLabel.textContent = operation === 'link' ? 'Source group per mode' : 'Modes';
  el.modeHint.textContent =
    operation === 'link'
      ? 'A mode left on Skip is not written. One mode at a time still works.'
      : 'Aliases are replaced by the concrete value they resolve to.';
  renderModeRows();
  requestPlan();
});

el.sourceCollection.addEventListener('change', () => {
  sourceGroups = [];
  renderModeRows();
  const source = currentSource();
  if (source) send({ type: 'load-source-groups', source });
  requestPlan();
});

el.targetCollection.addEventListener('change', () => {
  fillSelect(el.targetGroup, 'Loading groups', []);
  el.targetGroup.disabled = true;
  renderModeRows();
  if (el.targetCollection.value) {
    send({ type: 'load-target-groups', collectionId: el.targetCollection.value });
  }
  requestPlan();
});

el.targetGroup.addEventListener('change', requestPlan);

el.toggleAll.addEventListener('click', () => {
  if (selectedKeys().length > 0) for (const key of allKeys()) unticked.add(key);
  else unticked.clear();
  renderPreview();
});

el.apply.addEventListener('click', () => {
  const keys = selectedKeys();
  if (keys.length === 0) return;
  el.apply.disabled = true;

  if (operation === 'link') {
    const request = linkRequest();
    if (request) send({ type: 'apply-link', request, keys });
    return;
  }
  const request = unlinkRequest();
  if (request) send({ type: 'apply-unlink', request, keys });
});

function describe(outcome: Outcome, done: Operation): string {
  const verb = done === 'link' ? 'linked' : 'unlinked';
  const parts = [`${outcome.applied} ${verb}`];
  if (outcome.skipped > 0) parts.push(`${outcome.skipped} skipped`);
  if (outcome.failed > 0) parts.push(`${outcome.failed} failed`);
  return parts.join(', ');
}

onPluginMessage<PluginMessage>((message) => {
  switch (message.type) {
    case 'sources': {
      sources = message.sources;
      targets = message.targets;

      setVisible(el.mainView, targets.length > 0);
      setVisible(el.emptyView, targets.length === 0);

      fillSelect(
        el.sourceCollection,
        sources.length === 0 ? 'No collections available' : 'Select a source',
        sources.map((s) => ({
          value: `${s.kind}:${s.ref}`,
          label: s.libraryName === null ? s.name : `${s.libraryName} · ${s.name}`,
        })),
      );
      fillSelect(
        el.targetCollection,
        targets.length === 0 ? 'No collections in this file' : 'Select a target',
        targets.map((t) => ({ value: t.id, label: t.name })),
      );

      const libraries = sources.filter((s) => s.kind === 'library').length;
      el.libraryHint.textContent =
        message.libraryError !== null
          ? `Libraries could not be read: ${message.libraryError}`
          : libraries === 0
            ? 'No library collections found. Enable a library in this file to alias to it.'
            : `${libraries} library ${libraries === 1 ? 'collection' : 'collections'} available.`;
      setVisible(el.libraryHint, true);

      renderModeRows();
      renderPreview();
      return;
    }

    case 'source-groups':
      sourceGroups = message.groups;
      renderModeRows();
      requestPlan();
      return;

    case 'target-groups':
      fillSelect(
        el.targetGroup,
        message.groups.length === 0 ? 'No groups in this collection' : 'Select a target group',
        message.groups.map((group) => ({ value: group, label: group })),
      );
      el.targetGroup.disabled = message.groups.length === 0;
      renderModeRows();
      requestPlan();
      return;

    case 'link-plan':
      linkPlan = message.plan;
      el.modeCount.textContent = `${message.plan.modes.length} assigned`;
      renderPreview();
      return;

    case 'unlink-plan':
      unlinkPlan = message.plan;
      renderPreview();
      return;

    case 'done':
      setVisible(el.noticeGroup, true);
      showNotice(
        el.notice,
        message.outcome.failed > 0 ? 'error' : 'success',
        describe(message.outcome, message.operation),
      );
      requestPlan();
      return;

    case 'error':
      setVisible(el.noticeGroup, true);
      showNotice(el.notice, 'error', message.message);
      syncApply();
      return;
  }
});

selectOperation('link');
setVisible(el.sourceGroupBox, true);
el.modeLabel.textContent = 'Source group per mode';
el.modeHint.textContent = 'A mode left on Skip is not written. One mode at a time still works.';
renderModeRows();
renderPreview();
