#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultDataDir = join(here, '..', 'data', 'kr');
export const CORE_FILES = ['major-fields.json', 'curricula.json', 'dependencies.json'];
export const FIELD_FILES = ['curriculum-standards.json', 'standard-texts.json', 'topics.json', 'clusters.json'];

// 추출기(pipeline/extract-texts.mjs)의 위생 기준을 산출물 쪽에서 한 번 더 건다.
// 추출기는 공유 코드 배정(pickVariant) 경로와 exceptions.json 수동 원문에 대해서는
// 아래 두 검사를 통과시키지 않으므로, 최종 산출물에서 전수로 다시 확인한다.
const MAX_TEXT = 700;
const UNMAPPED_GLYPH = /[\uE000-\uF8FF]/; // 유니코드 사설 사용 영역(Private Use Area)

export function verifyAll(dataDir = defaultDataDir, gates) {
  const read = (rel) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8'));
  const errors = [];

  const { majorFields } = read('core/major-fields.json');
  const { curricula: index } = read('core/curricula.json');
  const { dependencies } = read('core/dependencies.json');
  const includedSet = new Set(gates.includedCategories);

  const slugs = readdirSync(join(dataDir, 'fields')).sort();
  const allStandards = [];
  const allTopics = [];
  const curriculumIds = new Set();
  const fieldCounts = {};
  const textsByField = new Map();

  for (const slug of slugs) {
    const { curricula } = read(`fields/${slug}/curriculum-standards.json`);
    const { texts } = read(`fields/${slug}/standard-texts.json`);
    const { topics } = read(`fields/${slug}/topics.json`);
    const { clusters } = read(`fields/${slug}/clusters.json`);
    textsByField.set(slug, texts);

    for (const c of curricula) {
      if (curriculumIds.has(c.id)) errors.push(`curriculum id 중복: ${c.id}`);
      curriculumIds.add(c.id);
      if (!includedSet.has(c.courseCategory)) {
        errors.push(`미수록 카테고리 데이터 존재: ${c.id} (${c.courseCategory})`);
      }
      if (c.majorFieldSlug !== slug) errors.push(`계열 폴더 불일치: ${c.id}가 ${slug}에 있음`);
      for (const s of c.standards) allStandards.push(s);
    }
    for (const t of topics) allTopics.push(t);

    const keySet = new Set(curricula.flatMap((c) => c.standards.map((s) => s.key)));
    const textKeys = new Set();
    for (const t of texts) {
      if (!keySet.has(t.key)) errors.push(`미지 key 원문: ${t.key}`);
      if (textKeys.has(t.key)) errors.push(`중복 원문: ${t.key}`);
      textKeys.add(t.key);
      if (!t.text || !t.text.trim()) errors.push(`빈 원문: ${t.key}`);
      if (t.text && t.text.length > MAX_TEXT) {
        errors.push(`원문 길이 초과: ${t.key} (${t.text.length}자 > ${MAX_TEXT})`);
      }
      if (t.text && UNMAPPED_GLYPH.test(t.text)) {
        errors.push(`원문 사설 영역 글리프: ${t.key}`);
      }
    }
    for (const key of keySet) if (!textKeys.has(key)) errors.push(`원문 누락: ${key}`);

    const topicIds = new Set(topics.map((t) => t.id));
    for (const cl of clusters) {
      for (const id of cl.topics) if (!topicIds.has(id)) errors.push(`클러스터 ${cl.id}의 미지 주제: ${id}`);
    }
    fieldCounts[slug] = {
      courses: curricula.length,
      standards: curricula.reduce((n, c) => n + c.standardCount, 0),
    };
  }

  // 주제 → 성취기준 key 참조 (계열 교차 없음 가정 없이 전역 대조)
  const globalKeys = new Set(allStandards.map((s) => s.key));
  for (const t of allTopics) {
    for (const key of t.standards) {
      if (!globalKeys.has(key)) errors.push(`주제 ${t.id}의 미지 성취기준 key: ${key}`);
    }
  }
  // 선수관계 → 주제 참조
  const globalTopicIds = new Set(allTopics.map((t) => t.id));
  for (const d of dependencies) {
    if (!globalTopicIds.has(d.topicId)) errors.push(`선수관계 미지 주제: ${d.topicId}`);
    if (!globalTopicIds.has(d.prerequisiteId)) errors.push(`선수관계 미지 주제: ${d.prerequisiteId}`);
  }
  // 색인 ↔ 실데이터 정합
  const indexById = new Map(index.map((c) => [c.id, c]));
  for (const id of curriculumIds) {
    const entry = indexById.get(id);
    if (!entry) errors.push(`색인에 없는 수록 과목: ${id}`);
    else if (!entry.included) errors.push(`색인 included=false인데 데이터 존재: ${id}`);
  }
  for (const c of index) {
    if (c.included && !curriculumIds.has(c.id)) errors.push(`색인 included=true인데 데이터 없음: ${c.id}`);
  }
  // major-fields ↔ 폴더
  const fieldSlugSet = new Set(majorFields.map((f) => f.slug));
  for (const slug of slugs) if (!fieldSlugSet.has(slug)) errors.push(`major-fields에 없는 폴더: ${slug}`);

  // 게이트 대조
  const totals = {
    courses: Object.values(fieldCounts).reduce((n, f) => n + f.courses, 0),
    standards: Object.values(fieldCounts).reduce((n, f) => n + f.standards, 0),
  };
  if (totals.courses !== gates.totals.courses) errors.push(`게이트 불일치: 과목 ${totals.courses} ≠ ${gates.totals.courses}`);
  if (totals.standards !== gates.totals.standards) errors.push(`게이트 불일치: 성취기준 ${totals.standards} ≠ ${gates.totals.standards}`);
  for (const [slug, expected] of Object.entries(gates.fields)) {
    const actual = fieldCounts[slug];
    if (!actual) { errors.push(`게이트 불일치: 계열 ${slug} 데이터 없음`); continue; }
    if (actual.courses !== expected.courses || actual.standards !== expected.standards) {
      errors.push(`게이트 불일치: ${slug} 과목 ${actual.courses}/${expected.courses} · 성취기준 ${actual.standards}/${expected.standards}`);
    }
  }
  for (const slug of Object.keys(fieldCounts)) {
    if (!gates.fields[slug]) errors.push(`게이트에 없는 계열: ${slug}`);
  }

  const counts = {
    fields: slugs.length,
    curricula: totals.courses,
    curriculaIndexed: index.length,
    standards: totals.standards,
    topics: allTopics.length,
    dependencies: dependencies.length,
    texts: [...textsByField.values()].reduce((n, t) => n + t.length, 0),
  };
  return { ok: errors.length === 0, errors, counts, fieldCounts };
}

function main() {
  const gates = JSON.parse(readFileSync(join(here, 'gates.json'), 'utf8'));
  const { ok, errors, counts } = verifyAll(defaultDataDir, gates);
  if (!ok) {
    console.error(`✗ 검증 실패 ${errors.length}건:`);
    for (const e of errors.slice(0, 40)) console.error(`  - ${e}`);
    if (errors.length > 40) console.error(`  … 외 ${errors.length - 40}건`);
    process.exit(1);
  }
  const files = {};
  const record = (rel) => {
    const raw = readFileSync(join(defaultDataDir, rel));
    files[rel] = { bytes: raw.byteLength, sha256: createHash('sha256').update(raw).digest('hex') };
  };
  for (const name of CORE_FILES) record(`core/${name}`);
  for (const slug of readdirSync(join(defaultDataDir, 'fields')).sort()) {
    for (const name of FIELD_FILES) record(`fields/${slug}/${name}`);
  }
  const manifest = {
    dataset: 'korean-vocational-learning-map',
    taxonomyVersion: 'kr-vocational-v0.1',
    generatedAt: new Date().toISOString(),
    counts, files,
  };
  writeFileSync(join(defaultDataDir, 'core', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.error(`✓ 전수 검증 통과 — manifest 기록 (성취기준 ${counts.standards} · 원문 ${counts.texts})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
