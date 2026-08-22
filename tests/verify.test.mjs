import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyAll, verifyRights } from '../pipeline/verify.mjs';

function writeFixture(root) {
  const w = (rel, obj) => {
    const p = join(root, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, JSON.stringify(obj));
  };
  const standard = {
    key: 'kr-2022-voc-전기-기초:[전기 01-01]', code: '[전기 01-01]', gradeBand: '10-12',
    subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics',
    courseCategory: 'major-general', domainKorean: '전기 회로',
    summary: '요약', summaryKind: 'mechanical', sourceRefs: [], sourceLocator: null, deck6Id: 's1',
  };
  w('core/major-fields.json', { majorFields: [{ slug: 'electrical-electronics', labelKorean: '전기·전자', annexId: 'kr-nec-2024-3-annex34', courseCount: { 'major-general': 1 }, standardCount: { 'major-general': 1 }, includedCategories: ['major-general', 'specialized-common'] }] });
  w('core/curricula.json', { curricula: [{ id: 'kr-2022-voc-전기-기초', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', courseCategory: 'major-general', gradeBand: '10-12', standardCount: 1, included: true, deck6CourseId: 'c1' }] });
  w('core/dependencies.json', { dependencies: [] });
  w('core/routing-index.json', {
    topicFields: { t1: 'electrical-electronics' },
    clusterFields: { cl1: 'electrical-electronics' },
    standardCodeFields: { '[전기01-01]': ['electrical-electronics'] },
  });
  w('fields/electrical-electronics/curriculum-standards.json', { curricula: [{ id: 'kr-2022-voc-전기-기초', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', subjectGroupKorean: '전기·전자', courseCategory: 'major-general', gradeBand: '10-12', name: '전기 기초 2022 개정 전문교과 교육과정', deck6CourseId: 'c1', sourceRefs: ['kr-nec-2024-3-annex34'], standardCount: 1, standards: [standard] }] });
  w('fields/electrical-electronics/standard-texts.json', { version: 'v1', sourceNote: '', texts: [{ key: standard.key, code: standard.code, text: '본문.', sourceId: 'annex34', locator: 'pattern-match' }] });
  w('fields/electrical-electronics/topics.json', { topics: [{ id: 't1', titleKorean: '주제', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', gradeBand: '10-12', domainKorean: '전기 회로', facetKey: 'f', types: [], description: '', evidence: [], assessmentPrompts: [], standards: [standard.key], sourceRefs: [] }] });
  w('fields/electrical-electronics/clusters.json', { clusters: [{ id: 'cl1', titleKorean: '묶음', subjectKorean: '전기 기초', majorFieldSlug: 'electrical-electronics', gradeBand: '10-12', domainKorean: '전기 회로', summary: '', topicCount: 1, topics: ['t1'] }] });
  return root;
}

const GATES = {
  release: 'v0.1.0', includedCategories: ['major-general', 'specialized-common'],
  totals: { courses: 1, standards: 1 },
  fields: { 'electrical-electronics': { courses: 1, standards: 1 } },
};

test('verifyAll: 정상 데이터는 통과하고 counts를 준다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const { ok, errors, counts } = verifyAll(root, GATES);
  assert.deepEqual(errors, []);
  assert.ok(ok);
  assert.equal(counts.standards, 1);
  assert.equal(counts.texts, 1);
  assert.equal(counts.fields, 1);
});

test('verifyAll: 원문 누락을 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  writeFileSync(join(root, 'fields/electrical-electronics/standard-texts.json'),
    JSON.stringify({ version: 'v1', sourceNote: '', texts: [] }));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('원문 누락')));
});

test('verifyAll: gates 수치 불일치를 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const wrongGates = { ...GATES, totals: { courses: 2, standards: 1 } };
  const { ok, errors } = verifyAll(root, wrongGates);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('게이트')));
});

test('verifyAll: 미수록 카테고리 데이터 존재를 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const p = join(root, 'fields/electrical-electronics/curriculum-standards.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));
  data.curricula[0].courseCategory = 'major-practical';
  writeFileSync(p, JSON.stringify(data));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('미수록 카테고리')));
});

// ── 브리프 대비 확장 (Task 5 리뷰 지적: pickVariant 경로가 추출기의 MAX_TEXT·PUA 검사를 우회한다) ──

test('verifyAll: 700자를 넘는 원문을 잡는다 (경계 700자는 통과)', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const p = join(root, 'fields/electrical-electronics/standard-texts.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));

  data.texts[0].text = '가'.repeat(700);
  writeFileSync(p, JSON.stringify(data));
  assert.ok(verifyAll(root, GATES).ok, '700자는 허용 범위다');

  data.texts[0].text = '가'.repeat(701);
  writeFileSync(p, JSON.stringify(data));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('원문 길이 초과')));
});

// ── v0.2 최종 리뷰 C2: 절단 원문이 게이트를 통과해 출시됐다(실측 3건). 산출물 쪽에 고정한다. ──

test('verifyAll: 요약문의 진부분 접두사인 절단 원문을 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const sp = join(root, 'fields/electrical-electronics/curriculum-standards.json');
  const std = JSON.parse(readFileSync(sp, 'utf8'));
  std.curricula[0].standards[0].summary = 'CNC 밀링(머시닝센 터) 가공 데이터를 생성하기';
  writeFileSync(sp, JSON.stringify(std));
  const tp = join(root, 'fields/electrical-electronics/standard-texts.json');
  const data = JSON.parse(readFileSync(tp, 'utf8'));

  // 단어 중간에서 잘린 원문 — 요약문의 진부분 접두사가 된다.
  data.texts[0].text = 'CNC 밀링(머시닝센';
  writeFileSync(tp, JSON.stringify(data));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('절단')));

  // 온전한 원문은 요약문보다 길어 접두사 조건에 걸리지 않는다.
  data.texts[0].text = 'CNC 밀링(머시닝센 터) 가공 데이터를 생성할 수 있다.';
  writeFileSync(tp, JSON.stringify(data));
  assert.deepEqual(verifyAll(root, GATES).errors, []);
});

test('verifyAll: 사설 영역(PUA) 글리프가 섞인 원문을 잡는다', () => {
  const root = writeFixture(mkdtempSync(join(tmpdir(), 'voc-verify-')));
  const p = join(root, 'fields/electrical-electronics/standard-texts.json');
  const data = JSON.parse(readFileSync(p, 'utf8'));
  // U+E0A1 — 심벌 폰트 수식이 매핑 없이 추출될 때 나타나는 사설 영역 글자.
  data.texts[0].text = '전압 \uE0A1 를 설명한다.';
  writeFileSync(p, JSON.stringify(data));
  const { ok, errors } = verifyAll(root, GATES);
  assert.ok(!ok);
  assert.ok(errors.some((e) => e.includes('사설 영역 글리프')));
});


const RIGHTS_SOURCES = {
  pdfAnnexes: {
    items: [
      { id: 'kr-nec-2024-3-annex30', annexNo: 30, fieldKorean: '기계', url: 'https://example.test/30', sha256: 'a'.repeat(64) },
      { id: 'kr-nec-2024-3-annex34', annexNo: 34, fieldKorean: '전기·전자', url: 'https://example.test/34', sha256: 'b'.repeat(64) },
    ],
  },
};
const RIGHTS_ROW = (no, field, sha) =>
  `| ${no} | ${field} | [NCIC](https://example.test/${no}) | \`${sha.repeat(64)}\` | 고시 별책 | 보호대상 제외 |`;
const RIGHTS_MD = [
  '| 별책 | 전문교과 | 공식 PDF | SHA-256 | 고시 편입 | 배포 판정 |',
  '|---|---|---|---|---|---|',
  RIGHTS_ROW(30, '기계', 'a'),
  RIGHTS_ROW(34, '전기·전자', 'b'),
].join('\n');

test('verifyRights: RIGHTS.md와 sources.json 고정값이 일치하면 통과한다', () => {
  assert.deepEqual(verifyRights(RIGHTS_MD, RIGHTS_SOURCES), []);
});

test('verifyRights: 해시·URL·교과명 드리프트와 행 누락·추가를 각각 잡는다', () => {
  const sha = verifyRights(RIGHTS_MD.replace('b'.repeat(64), 'c'.repeat(64)), RIGHTS_SOURCES);
  assert.ok(sha.some((e) => e.includes('별책34 SHA-256 불일치')));

  const url = verifyRights(RIGHTS_MD.replace('https://example.test/30', 'https://example.test/x'), RIGHTS_SOURCES);
  assert.ok(url.some((e) => e.includes('별책30 공식 URL 불일치')));

  const field = verifyRights(RIGHTS_MD.replace('| 30 | 기계 |', '| 30 | 기게 |'), RIGHTS_SOURCES);
  assert.ok(field.some((e) => e.includes('별책30 전문교과명 불일치')));

  const dropped = verifyRights(RIGHTS_MD.split('\n').slice(0, -1).join('\n'), RIGHTS_SOURCES);
  assert.ok(dropped.some((e) => e.includes('별책34 행이 없다')));
  assert.ok(dropped.some((e) => e.includes('행 1건 ≠ sources.json 고정 2건')));

  const extra = verifyRights(`${RIGHTS_MD}\n${RIGHTS_ROW(39, '융복합·지식재산', 'd')}`, RIGHTS_SOURCES);
  assert.ok(extra.some((e) => e.includes('고정되지 않은 별책이 RIGHTS.md에 있다: 별책39')));
});
