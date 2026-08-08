import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data-store.mjs';
import { buildRoadmap } from '../src/roadmap.mjs';

const store = createStore();
store.ensureAllIncluded();

test('buildRoadmap: 실과목의 영역→클러스터 로드맵', () => {
  const curriculum = store.curricula[0];
  const roadmap = buildRoadmap(store, { subject: curriculum.subjectKorean, majorField: curriculum.majorFieldSlug });
  assert.equal(roadmap.subject, curriculum.subjectKorean);
  assert.equal(roadmap.standardCount, curriculum.standardCount);
  assert.ok(roadmap.domains.length >= 1);
  assert.ok(roadmap.domains[0].standards.length >= 1);
});

test('buildRoadmap: 미지 과목은 unknown-subject + 유사 후보', () => {
  const roadmap = buildRoadmap(store, { subject: '존재하지 않는 과목명' });
  assert.equal(roadmap.error, 'unknown-subject');
  assert.ok(Array.isArray(roadmap.suggestions));
});

test('buildRoadmap: 동명 과목이 여러 계열에 있으면 ambiguous-subject', () => {
  const byName = new Map();
  for (const c of store.curricula) {
    byName.set(c.subjectKorean, [...(byName.get(c.subjectKorean) ?? []), c]);
  }
  const dup = [...byName.values()].find((list) => new Set(list.map((c) => c.majorFieldSlug)).size > 1);
  if (!dup) return; // 동명 과목이 없으면 이 케이스는 데이터상 성립하지 않음
  const roadmap = buildRoadmap(store, { subject: dup[0].subjectKorean });
  assert.equal(roadmap.error, 'ambiguous-subject');
  assert.ok(roadmap.fields.length > 1);
});
