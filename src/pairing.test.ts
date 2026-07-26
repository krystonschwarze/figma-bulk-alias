import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pairKey } from './messages.ts';
import { byLeaf, groupOf, groupsOf, leafOf, match, naturalCompare } from './pairing.ts';
import type { Pairable } from './pairing.ts';

function v(id: string, name: string, resolvedType = 'COLOR'): Pairable {
  return { id, name, resolvedType };
}

const key = (leaf: string): string => pairKey('mode-1', leaf);

test('groupOf and leafOf split on the last slash', () => {
  assert.equal(groupOf('design/static/alpha/01'), 'design/static/alpha');
  assert.equal(leafOf('design/static/alpha/01'), '01');
  assert.equal(groupOf('ungrouped'), '');
  assert.equal(leafOf('ungrouped'), 'ungrouped');
});

test('byLeaf only picks up the exact group, not nested ones', () => {
  const variables = [
    v('1', 'color/base/01'),
    v('2', 'color/base/deep/01'),
    v('3', 'color/base/02'),
  ];
  assert.deepEqual([...byLeaf(variables, 'color/base').keys()].sort(), ['01', '02']);
});

test('groupsOf lists nested groups and drops ungrouped variables', () => {
  const variables = [v('1', 'color/base/01'), v('2', 'color/brand/01'), v('3', 'loose')];
  assert.deepEqual(groupsOf(variables), ['color/base', 'color/brand']);
});

test('pairing ignores collection order', () => {
  const source = byLeaf([v('s1', 'a/01'), v('s2', 'a/02'), v('s3', 'a/03')], 'a');
  const target = byLeaf([v('t3', 'b/03'), v('t1', 'b/01'), v('t2', 'b/02')], 'b');

  const result = match(source, target, key);

  assert.deepEqual(
    result.matched.map((pair) => [pair.sourceName, pair.targetName]),
    [
      ['a/01', 'b/01'],
      ['a/02', 'b/02'],
      ['a/03', 'b/03'],
    ],
  );
});

test('names without a counterpart are reported on both sides', () => {
  const source = byLeaf([v('s1', 'a/01'), v('s2', 'a/only-source')], 'a');
  const target = byLeaf([v('t1', 'b/01'), v('t2', 'b/only-target')], 'b');

  const result = match(source, target, key);

  assert.deepEqual(
    result.matched.map((pair) => pair.leaf),
    ['01'],
  );
  assert.deepEqual(result.missingInTarget, ['only-source']);
  assert.deepEqual(result.missingInSource, ['only-target']);
});

test('a type mismatch is reported instead of paired', () => {
  const result = match(
    byLeaf([v('s1', 'a/01', 'COLOR')], 'a'),
    byLeaf([v('t1', 'b/01', 'FLOAT')], 'b'),
    key,
  );

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.typeMismatch, ['01']);
});

test('a variable is never aliased to itself', () => {
  const same = v('same', 'a/01');
  const result = match(byLeaf([same], 'a'), new Map([['01', same]]), key);

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.missingInTarget, []);
  assert.deepEqual(result.typeMismatch, []);
});

test('a library source keeps its synthesised id distinct from local targets', () => {
  const source = byLeaf([v('library:abc123', 'a/01')], 'a');
  const target = byLeaf([v('VariableID:1:2', 'b/01')], 'b');

  const result = match(source, target, key);

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.sourceName, 'a/01');
});

test('every pair carries a key scoped to its mode', () => {
  const source = byLeaf([v('s1', 'a/01')], 'a');
  const target = byLeaf([v('t1', 'b/01')], 'b');

  const light = match(source, target, (leaf) => pairKey('light', leaf));
  const dark = match(source, target, (leaf) => pairKey('dark', leaf));

  assert.equal(light.matched[0]?.key, 'light::01');
  assert.equal(dark.matched[0]?.key, 'dark::01');
  assert.notEqual(light.matched[0]?.key, dark.matched[0]?.key);
});

test('numbered leaves sort naturally, not alphabetically', () => {
  const names = ['1', '10', '11', '12', '2', '3', '9'];
  const source = byLeaf(
    names.map((n) => v(`s${n}`, `a/${n}`)),
    'a',
  );
  const target = byLeaf(
    names.map((n) => v(`t${n}`, `b/${n}`)),
    'b',
  );

  const result = match(source, target, key);

  assert.deepEqual(
    result.matched.map((pair) => pair.leaf),
    ['1', '2', '3', '9', '10', '11', '12'],
  );
});

test('naturalCompare handles zero padding and mixed text', () => {
  assert.deepEqual(['10', '02', '1', '01', '9'].sort(naturalCompare), ['1', '01', '02', '9', '10']);
  assert.deepEqual(['step-10', 'step-2', 'step-1'].sort(naturalCompare), [
    'step-1',
    'step-2',
    'step-10',
  ]);
});

test('the unmatched lists sort naturally too', () => {
  const source = byLeaf(
    ['1', '10', '2'].map((n) => v(`s${n}`, `a/${n}`)),
    'a',
  );
  const result = match(source, new Map(), key);

  assert.deepEqual(result.missingInTarget, ['1', '2', '10']);
});

test('group names sort naturally', () => {
  const variables = [v('1', 'scale/1000/x'), v('2', 'scale/200/x'), v('3', 'scale/50/x')];
  assert.deepEqual(groupsOf(variables), ['scale/50', 'scale/200', 'scale/1000']);
});
