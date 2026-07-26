import assert from 'node:assert/strict';
import { test } from 'node:test';
import { byLeaf, groupOf, groupsOf, leafOf, match } from './pairing.ts';
import type { Pairable } from './pairing.ts';

function v(id: string, name: string, resolvedType = 'COLOR'): Pairable {
  return { id, name, resolvedType };
}

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
  const picked = byLeaf(variables, 'color/base');
  assert.deepEqual([...picked.keys()].sort(), ['01', '02']);
});

test('pairing ignores collection order', () => {
  const source = byLeaf([v('s1', 'a/01'), v('s2', 'a/02'), v('s3', 'a/03')], 'a');
  const target = byLeaf([v('t3', 'b/03'), v('t1', 'b/01'), v('t2', 'b/02')], 'b');

  const result = match(source, target);

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

  const result = match(source, target);

  assert.deepEqual(
    result.matched.map((pair) => pair.leaf),
    ['01'],
  );
  assert.deepEqual(result.missingInTarget, ['only-source']);
  assert.deepEqual(result.missingInSource, ['only-target']);
});

test('a type mismatch is reported instead of paired', () => {
  const source = byLeaf([v('s1', 'a/01', 'COLOR')], 'a');
  const target = byLeaf([v('t1', 'b/01', 'FLOAT')], 'b');

  const result = match(source, target);

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.typeMismatch, ['01']);
});

test('a variable is never aliased to itself', () => {
  const same = v('same', 'a/01');
  const result = match(byLeaf([same], 'a'), new Map([['01', same]]));

  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.missingInTarget, []);
  assert.deepEqual(result.typeMismatch, []);
});

test('groupsOf lists nested groups and drops ungrouped variables', () => {
  const variables = [v('1', 'color/base/01'), v('2', 'color/brand/01'), v('3', 'loose')];
  assert.deepEqual(groupsOf(variables), ['color/base', 'color/brand']);
});
