import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/data-store.mjs';
import { searchStandards, searchTopics, searchStandardTexts, suggestSimilar } from '../src/search.mjs';

const store = createStore();
store.ensureAllIncluded();

test('searchStandards: 코드 정확 일치가 최상위 (공백 없이 질의)', () => {
  const sample = store.allStandards.find((s) => /\s/.test(s.code));
  const spaceless = sample.code.replace(/\s+/g, '').replace(/[[\]]/g, '');
  const { results } = searchStandards(store, { query: spaceless });
  assert.equal(results[0].code, sample.code);
});

test('searchStandards: majorField 필터', () => {
  const slug = store.includedFieldSlugs.find((s) => s !== 'specialized-common');
  const { total, results } = searchStandards(store, { majorField: slug, limit: 50 });
  assert.ok(total >= 1);
  assert.ok(results.every((r) => r.majorFieldSlug === slug));
});

test('searchStandards: limit 상한 50', () => {
  const { results } = searchStandards(store, { limit: 999 });
  assert.ok(results.length <= 50);
});

test('searchTopics: standardCode로 연결 주제 조회', () => {
  const topic = store.topics.find((t) => t.standards.length >= 1);
  const standard = store.standardsByKey.get(topic.standards[0]);
  const { results } = searchTopics(store, { standardCode: standard.code });
  assert.ok(results.some((r) => r.id === topic.id));
});

test('searchStandardTexts: 원문 스니펫 검색', () => {
  const [key, text] = [...store.textsByKey.entries()][0];
  const word = text.split(' ').find((w) => w.length >= 2);
  const { total, results } = searchStandardTexts(store, { query: word });
  assert.ok(total >= 1);
  assert.ok(results[0].snippet.length >= word.length);
});

test('suggestSimilar: 오타에 유사 후보', () => {
  const subject = store.curricula[0].subjectKorean;
  const typo = `${subject}x`;
  assert.ok(suggestSimilar(typo, store.curricula.map((c) => c.subjectKorean)).includes(subject));
});


// 실측 결함: 40자 해시 ID에서 길이 비례 임계값이 14까지 커져,
// 존재하지 않는 ID에도 무관한 ID를 "유사 후보"로 지어냈다.
test('suggestSimilar: maxDistance가 불투명 ID의 허위 후보를 막는다', () => {
  const ids = [...store.topicFieldById.keys()];
  const real = ids[0];

  const typo = `${real}z`;
  assert.ok(suggestSimilar(typo, ids).length > 1); // 상한 없으면 무관한 ID가 딸려 온다
  assert.deepEqual(suggestSimilar(typo, ids, { maxDistance: 3 }), [real]);

  const fabricated = real.replace(/[0-9a-f]{20}$/, '1234567890abcdef1234');
  assert.ok(!ids.includes(fabricated));
  assert.ok(suggestSimilar(fabricated, ids).length > 0); // 상한 없으면 지어낸다
  assert.deepEqual(suggestSimilar(fabricated, ids, { maxDistance: 3 }), []);

  // 짧고 의미 있는 문자열(과목명·코드)의 기존 동작은 그대로다 — 상한을 걸지 않은 호출부는 영향 없음.
  assert.equal(suggestSimilar('통합과힉', ['통합과학', '통합사회'])[0], '통합과학');
});
