import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createStore } from '../src/data-store.mjs';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'kr');

test('기동 시 core만 로드되고 계열 데이터는 비어 있다', () => {
  const store = createStore(dataDir);
  assert.ok(store.majorFields.length >= 1);
  assert.ok(store.curriculaIndex.length >= 528); // 전 범위 색인(528)
  assert.equal(store.loadedFields.size, 0);
  assert.equal(store.allStandards.length, 0);
  assert.equal(store.topicFieldById.size, store.manifest.counts.topics);
  assert.ok(store.clusterFieldById.size >= 1);
  assert.ok(store.standardFieldsByCode.size >= 1);
});

// manifest 상대 비교만으로는 RELEASE_SCOPE가 축소돼도 전 테스트가 통과한다.
// v0.2 출시 범위(전문교과 전 범위)를 절대값으로 못 박아 범위 회귀를 잡는다.
test('v0.2 출시 범위가 절대값으로 고정되어 있다', () => {
  const store = createStore(dataDir);
  assert.equal(store.manifest.counts.curricula, 528);   // 전공일반 216 + 전공실무 309 + 전문공통 3
  assert.equal(store.manifest.counts.standards, 47625);
  assert.equal(store.manifest.counts.texts, 47625);     // 출시 범위 = 원문 범위
  assert.equal(store.curriculaIndex.length, 528);
});

test('ensureField는 해당 계열을 로드·병합하고 캐시한다', () => {
  const store = createStore(dataDir);
  const slug = store.includedFieldSlugs[0];
  store.ensureField(slug);
  assert.ok(store.loadedFields.has(slug));
  assert.ok(store.allStandards.length >= 1);
  const before = store.allStandards.length;
  store.ensureField(slug); // 재호출은 no-op
  assert.equal(store.allStandards.length, before);
});

test('로드된 계열은 원문 수 = 성취기준 수', () => {
  const store = createStore(dataDir);
  const slug = store.includedFieldSlugs[0];
  store.ensureField(slug);
  assert.equal(store.textsByKey.size, store.allStandards.length);
});

test('ensureAllIncluded 후 전체 수치가 manifest counts와 일치한다', () => {
  const store = createStore(dataDir);
  store.ensureAllIncluded();
  assert.equal(store.allStandards.length, store.manifest.counts.standards);
  assert.equal(store.textsByKey.size, store.manifest.counts.texts);
  assert.equal(store.topics.length, store.manifest.counts.topics);
});

test('미지 계열 슬러그는 한국어 오류', () => {
  const store = createStore(dataDir);
  assert.throws(() => store.ensureField('no-such-field'), /계열/);
});

test('코드 조회는 공백 유무와 무관하다', () => {
  const store = createStore(dataDir);
  store.ensureAllIncluded();
  const withSpace = store.allStandards.find((s) => /\s/.test(s.code));
  assert.ok(withSpace, '전문교과 코드에는 공백이 있어야 한다');
  const spaceless = withSpace.code.replace(/\s+/g, '');
  assert.ok(store.standardsByCodeAll.get(store.normalizeCode(spaceless)).some((s) => s.key === withSpace.key));
});

test('계열 파일 변조 시 지연 로드가 거부한다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'voc-store-'));
  cpSync(dataDir, tmp, { recursive: true });
  const store = createStore(tmp);
  const slug = store.includedFieldSlugs[0];
  const p = join(tmp, 'fields', slug, 'topics.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('{', '{ '));
  assert.throws(() => store.ensureField(slug), /체크섬 불일치/);
});

test('core 파일 변조 시 기동이 거부된다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'voc-store-'));
  cpSync(dataDir, tmp, { recursive: true });
  const p = join(tmp, 'core', 'curricula.json');
  writeFileSync(p, readFileSync(p, 'utf8').replace('{', '{ '));
  assert.throws(() => createStore(tmp), /체크섬 불일치/);
});

test('원문 수 불일치 시 병합 전에 거부되어 집계가 오염되지 않는다', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'voc-store-'));
  cpSync(dataDir, tmp, { recursive: true });
  const store0 = createStore(tmp);
  const slug = store0.includedFieldSlugs[0];
  // 원문 1건을 제거하고 manifest 해시를 재계산해 sha 게이트는 통과시키되 count 불변식만 깨뜨린다.
  const textsPath = join(tmp, 'fields', slug, 'standard-texts.json');
  const data = JSON.parse(readFileSync(textsPath, 'utf8'));
  data.texts.pop();
  const raw = Buffer.from(`${JSON.stringify(data, null, 1)}\n`);
  writeFileSync(textsPath, raw);
  const manifestPath = join(tmp, 'core', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.files[`fields/${slug}/standard-texts.json`] = {
    bytes: raw.byteLength,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const store = createStore(tmp);
  assert.throws(() => store.ensureField(slug), /원문 수/);
  // 핵심: throw 후에도 집계가 비어 있어야 한다(부분 병합 잔류 금지).
  assert.equal(store.allStandards.length, 0);
  assert.equal(store.loadedFields.size, 0);
});
