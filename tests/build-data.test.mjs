import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RELEASE_SCOPE, resolveFieldSlug, slugifyCourse, buildVocational,
} from '../pipeline/build-data.mjs';

test('resolveFieldSlug는 계열명을 슬러그로 푼다 (공백·"계열" 수식 허용)', () => {
  assert.equal(resolveFieldSlug('경영·금융'), 'business-finance');
  assert.equal(resolveFieldSlug('전기·전자'), 'electrical-electronics');
  assert.equal(resolveFieldSlug('전기 · 전자 계열'), 'electrical-electronics');
  assert.throws(() => resolveFieldSlug('없는 계열'), /매핑되지 않은 계열/);
});

test('slugifyCourse는 kr-2022-voc- 접두 슬러그를 만든다', () => {
  assert.equal(slugifyCourse('간호의 기초'), 'kr-2022-voc-간호의-기초');
  assert.equal(slugifyCourse('전자 회로Ⅱ'), 'kr-2022-voc-전자-회로II');
});

function syntheticRaw() {
  return {
    subjectGroups: [
      { id: 'g-elec', labelKorean: '전기·전자' },
      { id: 'g-common', labelKorean: '보통 교과군' },
    ],
    courses: [
      { id: 'c1', labelKorean: '전기 기초', subjectGroupId: 'g-elec',
        courseCategory: 'major-general', sourceRefs: ['kr-nec-2024-3-annex34'] },
      { id: 'c2', labelKorean: '3D 프린터 개발', subjectGroupId: 'g-elec',
        courseCategory: 'major-practical', sourceRefs: ['kr-nec-2024-3-annex34'] },
      { id: 'c3', labelKorean: '성공적인 직업생활', subjectGroupId: 'g-elec',
        courseCategory: 'specialized-common', sourceRefs: ['kr-nec-2024-3-annex23'] },
      { id: 'c4', labelKorean: '물리학', subjectGroupId: 'g-common',
        courseCategory: 'general-elective', sourceRefs: [] },
    ],
    domains: [{ id: 'd1', labelKorean: '전기 회로' }],
    standards: [
      { id: 's1', courseId: 'c1', code: '[전기 01-01]', domainId: 'd1',
        summary: '요약1', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
      { id: 's2', courseId: 'c2', code: '[3개 01-01-01]', domainId: 'd1',
        summary: '요약2', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
      { id: 's3', courseId: 'c3', code: '[직생 01-01]', domainId: 'd1',
        summary: '요약3', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
      { id: 's4', courseId: 'c4', code: '[12물리01-01]', domainId: 'd1',
        summary: '요약4', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null },
    ],
    topics: [
      { id: 't1', labelKorean: '주제1', courseIds: ['c1'], domainId: 'd1', facetKey: 'f',
        types: [], description: '', evidence: [], assessmentPrompts: [],
        standardAlignments: [{ standardId: 's1' }], sourceRefs: [] },
      { id: 't2', labelKorean: '주제2(전공실무)', courseIds: ['c2'], domainId: 'd1', facetKey: 'f',
        types: [], description: '', evidence: [], assessmentPrompts: [],
        standardAlignments: [{ standardId: 's2' }], sourceRefs: [] },
    ],
    clusters: [
      { id: 'cl1', labelKorean: '묶음1', courseId: 'c1', domainId: 'd1',
        summary: '', topicIds: ['t1'] },
    ],
    learningRelations: [
      { dependentTopicId: 't1', prerequisiteTopicId: 't1', strength: 'required',
        relationKind: 'k', scope: 's', reason: 'r', basis: 'b' },
      { dependentTopicId: 't2', prerequisiteTopicId: 't1', strength: 'recommended',
        relationKind: 'k', scope: 's', reason: 'r', basis: 'b' },
    ],
  };
}

test('buildVocational: 수록 범위 필터·계열 분할·색인·의존 필터', () => {
  const out = buildVocational(syntheticRaw());
  // 보통교과(c4)는 색인에도 없다. 전문교과 3과목은 전부 색인에 있다.
  assert.deepEqual(out.curriculaIndex.map((c) => c.deck6CourseId).sort(), ['c1', 'c2', 'c3']);
  // v0.1 수록: major-general·specialized-common만 included.
  const included = Object.fromEntries(out.curriculaIndex.map((c) => [c.deck6CourseId, c.included]));
  assert.deepEqual(included, { c1: true, c2: false, c3: true });
  // 계열 파일: 전기·전자에 c1만 (c2는 미수록), specialized-common 의사 계열에 c3.
  assert.deepEqual([...out.fields.keys()].sort(), ['electrical-electronics', 'specialized-common']);
  assert.deepEqual(out.fields.get('electrical-electronics').curricula.map((c) => c.deck6CourseId), ['c1']);
  assert.deepEqual(out.fields.get('specialized-common').curricula.map((c) => c.deck6CourseId), ['c3']);
  // standard 레코드에 majorFieldSlug·courseCategory가 붙는다.
  const s = out.fields.get('electrical-electronics').curricula[0].standards[0];
  assert.equal(s.majorFieldSlug, 'electrical-electronics');
  assert.equal(s.courseCategory, 'major-general');
  assert.equal(s.key, `${out.fields.get('electrical-electronics').curricula[0].id}:[전기 01-01]`);
  assert.equal(s.gradeBand, '10-12');
  // 주제: 수록 과목 연결분만 (t2는 c2 전용이라 제외).
  assert.deepEqual(out.fields.get('electrical-electronics').topics.map((t) => t.id), ['t1']);
  // 선수관계: 양끝이 수록 주제인 것만 (t2 관련 엣지 드롭).
  assert.equal(out.dependencies.length, 1);
  assert.equal(out.dependencies[0].strength, 'hard');
  // major-fields: 카테고리별 수치 (미수록 포함 전체 집계).
  const elec = out.majorFields.find((f) => f.slug === 'electrical-electronics');
  assert.equal(elec.courseCount['major-general'], 1);
  assert.equal(elec.courseCount['major-practical'], 1);
  assert.equal(elec.standardCount['major-practical'], 1);
  assert.deepEqual(elec.includedCategories, [...RELEASE_SCOPE]);
  assert.equal(elec.annexId, 'kr-nec-2024-3-annex34');
});
