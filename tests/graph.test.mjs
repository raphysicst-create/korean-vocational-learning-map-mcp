import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data-store.mjs';
import { directEdges, learningPath } from '../src/graph.mjs';

const store = createStore();
store.ensureAllIncluded();

test('선수관계가 있으면 directEdges가 관련 주제를 준다 (없으면 빈 배열)', () => {
  if (store.dependencies.length === 0) {
    // 전문교과는 공식 선수관계가 희소하다 — 0건이면 빈 결과 규약만 확인.
    assert.deepEqual(directEdges(store, store.topics[0].id), []);
    return;
  }
  const edge = store.dependencies[0];
  const edges = directEdges(store, edge.topicId);
  assert.ok(edges.some((e) => e.relatedTopicId === edge.prerequisiteId));
  const path = learningPath(store, edge.topicId);
  assert.ok(path.length >= 2);
  assert.equal(path[path.length - 1].topicId, edge.topicId);
});
