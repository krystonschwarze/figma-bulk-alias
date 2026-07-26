export type Side = 'source' | 'target';

export interface ModeInfo {
  id: string;
  name: string;
}

export interface CollectionInfo {
  id: string;
  name: string;
  defaultModeId: string;
  modes: ModeInfo[];
}

export interface MatchedPair {
  leaf: string;
  sourceName: string;
  targetName: string;
}

export interface Preview {
  matched: MatchedPair[];
  missingInTarget: string[];
  missingInSource: string[];
  typeMismatch: string[];
}

export interface AliasSelection {
  sourceCollectionId: string;
  sourceGroup: string;
  targetCollectionId: string;
  targetGroup: string;
  modeId: string;
}

export interface RemoveSelection {
  targetCollectionId: string;
  targetGroup: string;
  modeId: string;
}

export interface Outcome {
  applied: number;
  skipped: number;
  failed: number;
}

export type UiMessage =
  | { type: 'load-groups'; side: Side; collectionId: string }
  | { type: 'preview'; selection: AliasSelection }
  | { type: 'create'; selection: AliasSelection }
  | { type: 'remove'; selection: RemoveSelection };

export type PluginMessage =
  | { type: 'collections'; collections: CollectionInfo[] }
  | { type: 'groups'; side: Side; groups: string[] }
  | { type: 'preview'; preview: Preview }
  | { type: 'done'; outcome: Outcome; verb: 'linked' | 'unlinked' }
  | { type: 'error'; message: string };
