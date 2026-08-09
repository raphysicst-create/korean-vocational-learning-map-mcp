import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCode } from './normalize.mjs';

const defaultDataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'kr');

export const CORE_FILES = ['major-fields.json', 'curricula.json', 'dependencies.json'];
export const FIELD_FILES = ['curriculum-standards.json', 'standard-texts.json', 'topics.json', 'clusters.json'];

function readVerified(dataDir, manifest, rel) {
  const expected = manifest.files[rel];
  if (!expected) throw new Error(`manifest.json에 ${rel} 항목이 없습니다.`);
  const raw = readFileSync(join(dataDir, rel));
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (sha256 !== expected.sha256) {
    throw new Error(
      `${rel} 체크섬 불일치 — 설치본이 손상되었습니다. 패키지를 재설치하세요. (manifest=${expected.sha256}, 실제=${sha256})`
    );
  }
  return JSON.parse(raw.toString('utf8'));
}

export function createStore(dataDir = defaultDataDir) {
  const manifest = JSON.parse(readFileSync(join(dataDir, 'core', 'manifest.json'), 'utf8'));
  const { majorFields } = readVerified(dataDir, manifest, 'core/major-fields.json');
  const { curricula: curriculaIndex } = readVerified(dataDir, manifest, 'core/curricula.json');
  const { dependencies } = readVerified(dataDir, manifest, 'core/dependencies.json');

  const prerequisitesByTopic = new Map();
  const unlocksByTopic = new Map();
  for (const edge of dependencies) {
    if (!prerequisitesByTopic.has(edge.topicId)) prerequisitesByTopic.set(edge.topicId, []);
    prerequisitesByTopic.get(edge.topicId).push(edge);
    if (!unlocksByTopic.has(edge.prerequisiteId)) unlocksByTopic.set(edge.prerequisiteId, []);
    unlocksByTopic.get(edge.prerequisiteId).push(edge);
  }

  const majorFieldsBySlug = new Map(majorFields.map((f) => [f.slug, f]));
  // 수록 데이터가 실재하는 계열 = manifest.files에 폴더가 기록된 계열.
  const includedFieldSlugs = [...new Set(
    Object.keys(manifest.files)
      .filter((rel) => rel.startsWith('fields/'))
      .map((rel) => rel.split('/')[1])
  )].sort();

  const store = {
    manifest, majorFields, majorFieldsBySlug, curriculaIndex, dependencies,
    prerequisitesByTopic, unlocksByTopic, includedFieldSlugs,
    normalizeCode,
    loadedFields: new Set(),
    curricula: [], topics: [], clusters: [], allStandards: [],
    standardsByCodeAll: new Map(), standardsByKey: new Map(),
    textsByKey: new Map(), topicsById: new Map(), clustersById: new Map(),
    topicsByStandardKey: new Map(),
  };

  store.ensureField = (slug) => {
    if (store.loadedFields.has(slug)) return;
    if (!includedFieldSlugs.includes(slug)) {
      const known = majorFieldsBySlug.get(slug);
      throw new Error(
        known
          ? `계열 ${slug}(${known.labelKorean})은 아직 수록되지 않았습니다. 수록 현황은 list_major_fields로 확인하세요.`
          : `계열 ${slug}을(를) 찾을 수 없습니다. 유효한 슬러그: ${includedFieldSlugs.join(', ')}`
      );
    }
    const { curricula } = readVerified(dataDir, manifest, `fields/${slug}/curriculum-standards.json`);
    const { texts } = readVerified(dataDir, manifest, `fields/${slug}/standard-texts.json`);
    const { topics } = readVerified(dataDir, manifest, `fields/${slug}/topics.json`);
    const { clusters } = readVerified(dataDir, manifest, `fields/${slug}/clusters.json`);

    const expectedTexts = curricula.reduce((n, c) => n + c.standards.length, 0);
    if (texts.length !== expectedTexts) {
      throw new Error(
        `계열 ${slug}: 원문 수(${texts.length})가 성취기준 수(${expectedTexts})와 다릅니다 — pipeline/verify.mjs를 실행하세요.`
      );
    }

    for (const curriculum of curricula) {
      store.curricula.push(curriculum);
      for (const standard of curriculum.standards) {
        const record = { ...standard, curriculumId: curriculum.id };
        store.allStandards.push(record);
        const codeKey = normalizeCode(standard.code);
        if (!store.standardsByCodeAll.has(codeKey)) store.standardsByCodeAll.set(codeKey, []);
        store.standardsByCodeAll.get(codeKey).push(record);
        store.standardsByKey.set(standard.key, record);
      }
    }
    for (const entry of texts) store.textsByKey.set(entry.key, entry.text);
    for (const topic of topics) {
      store.topics.push(topic);
      store.topicsById.set(topic.id, topic);
      for (const key of topic.standards ?? []) {
        if (!store.topicsByStandardKey.has(key)) store.topicsByStandardKey.set(key, []);
        store.topicsByStandardKey.get(key).push(topic);
      }
    }
    for (const cluster of clusters) {
      store.clusters.push(cluster);
      store.clustersById.set(cluster.id, cluster);
    }
    store.loadedFields.add(slug);
  };

  store.ensureAllIncluded = () => {
    for (const slug of includedFieldSlugs) store.ensureField(slug);
  };

  return store;
}
