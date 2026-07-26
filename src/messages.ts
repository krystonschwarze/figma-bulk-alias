import type { MatchedPair } from './pairing.ts';

export type Operation = 'link' | 'unlink';

/*
 * A source may live in this file or in an enabled library. Local collections are addressed by id,
 * library collections by key, so both carry an opaque `ref` and a kind that says how to read it.
 * Targets are always local: a plugin cannot write variables into someone else's library.
 */
export type SourceKind = 'local' | 'library';

export interface SourceCollection {
  kind: SourceKind;
  ref: string;
  name: string;
  libraryName: string | null;
}

export interface ModeInfo {
  id: string;
  name: string;
}

export interface TargetCollection {
  id: string;
  name: string;
  modes: ModeInfo[];
}

/* One source group per target mode. A mode left unassigned is skipped, which keeps the old
 * one-mode-at-a-time workflow available. */
export interface ModeAssignment {
  modeId: string;
  sourceGroup: string;
}

export interface LinkRequest {
  source: SourceCollection;
  targetCollectionId: string;
  targetGroup: string;
  assignments: ModeAssignment[];
}

export interface UnlinkRequest {
  targetCollectionId: string;
  targetGroup: string;
  modeIds: string[];
}

export interface ModePlan {
  modeId: string;
  modeName: string;
  sourceGroup: string;
  matched: MatchedPair[];
  missingInTarget: string[];
  missingInSource: string[];
  typeMismatch: string[];
}

export interface LinkPlan {
  modes: ModePlan[];
}

export interface AliasedVariable {
  key: string;
  leaf: string;
  targetName: string;
  pointsAt: string;
}

export interface ModeUnlinkPlan {
  modeId: string;
  modeName: string;
  aliased: AliasedVariable[];
  plain: number;
}

export interface UnlinkPlan {
  modes: ModeUnlinkPlan[];
}

export interface LibraryProbe {
  name: string;
  libraryName: string | null;
  count: number;
  error: string | null;
}

export interface Outcome {
  applied: number;
  skipped: number;
  failed: number;
}

export type UiMessage =
  | { type: 'reload' }
  | { type: 'load-source-groups'; source: SourceCollection }
  | { type: 'probe-libraries' }
  | { type: 'load-target-groups'; collectionId: string }
  | { type: 'plan-link'; request: LinkRequest }
  | { type: 'apply-link'; request: LinkRequest; keys: string[] }
  | { type: 'plan-unlink'; request: UnlinkRequest }
  | { type: 'apply-unlink'; request: UnlinkRequest; keys: string[] };

export type PluginMessage =
  | {
      type: 'sources';
      sources: SourceCollection[];
      targets: TargetCollection[];
      libraryError: string | null;
    }
  | { type: 'source-groups'; groups: string[]; variableCount: number; rootCount: number }
  | { type: 'library-probe'; results: LibraryProbe[] }
  | { type: 'target-groups'; groups: string[] }
  | { type: 'link-plan'; plan: LinkPlan }
  | { type: 'unlink-plan'; plan: UnlinkPlan }
  | { type: 'done'; outcome: Outcome; operation: Operation }
  | { type: 'error'; message: string };

/* Stable identity for a checkbox: a pair belongs to exactly one mode. */
export function pairKey(modeId: string, leaf: string): string {
  return `${modeId}::${leaf}`;
}
