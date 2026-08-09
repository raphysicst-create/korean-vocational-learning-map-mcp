#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRoman, normalizeText } from '../src/normalize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cacheDir = join(repoRoot, '.cache', 'deck6');
const outDir = join(repoRoot, 'data', 'kr');

export const VOCATIONAL_CATEGORIES = new Set(['major-general', 'major-practical', 'specialized-common']);
// v0.2 수록 범위: 전문교과 전 범위. (v0.1은 major-general+specialized-common만이었다.)
export const RELEASE_SCOPE = new Set(['major-general', 'major-practical', 'specialized-common']);
export const EXPECTED_INCLUDED_COURSES = 528; // 전공일반 216 + 전공실무 309 + 전문공통 3 (상류 실측)

// 스펙 확정 표 (별책 23~39 순).
export const FIELD_SLUGS = new Map([
  ['경영·금융', 'business-finance'],
  ['보건·복지', 'health-welfare'],
  ['문화·예술·디자인·방송', 'culture-arts-design-broadcast'],
  ['미용', 'beauty'],
  ['관광·레저', 'tourism-leisure'],
  ['식품·조리', 'food-cooking'],
  ['건축·토목', 'construction-civil'],
  ['기계', 'machinery'],
  ['재료', 'materials'],
  ['화학공업', 'chemical-industry'],
  ['섬유·의류', 'textile-clothing'],
  ['전기·전자', 'electrical-electronics'],
  ['정보·통신', 'information-communication'],
  ['환경·안전·소방', 'environment-safety-fire'],
  ['농림·축산', 'agriculture-livestock'],
  ['수산·해운', 'fisheries-shipping'],
  ['융복합·지식재산', 'convergence-ip'],
]);
export const SPECIALIZED_COMMON_SLUG = 'specialized-common';

export function resolveFieldSlug(groupLabel) {
  const squash = (v) => normalizeText(v).replace(/\s+/g, '').replace(/(교과\(군\)|교과군|계열)$/, '');
  const target = squash(groupLabel);
  for (const [label, slug] of FIELD_SLUGS) {
    if (squash(label) === target) return slug;
  }
  throw new Error(`매핑되지 않은 계열: "${groupLabel}" — pipeline/build-data.mjs의 FIELD_SLUGS를 확인하세요.`);
}

export function slugifyCourse(labelKorean) {
  const label = normalizeRoman(String(labelKorean).normalize('NFC'))
    .replace(/[\s·/(),]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `kr-2022-voc-${label}`;
}

export function buildVocational(raw) {
  const groupLabel = new Map(raw.subjectGroups.map((g) => [g.id, g.labelKorean]));
  const domainLabel = new Map(raw.domains.map((d) => [d.id, d.labelKorean]));

  const vocCourses = raw.courses.filter((c) => VOCATIONAL_CATEGORIES.has(c.courseCategory));
  const fieldOf = (course) =>
    course.courseCategory === 'specialized-common'
      ? SPECIALIZED_COMMON_SLUG
      : resolveFieldSlug(groupLabel.get(course.subjectGroupId));

  const standardsByCourse = new Map();
  for (const s of raw.standards) {
    if (!standardsByCourse.has(s.courseId)) standardsByCourse.set(s.courseId, []);
    standardsByCourse.get(s.courseId).push(s);
  }

  // 색인(528과목 전부) + 수록 과목 전체 레코드.
  const curriculaIndex = [];
  const keyByDeck6StandardId = new Map();
  const includedCourseIds = new Map(); // deck6CourseId → { slug, record }
  const fields = new Map(); // slug → { curricula, topics, clusters }
  const ensureField = (slug) => {
    if (!fields.has(slug)) fields.set(slug, { curricula: [], topics: [], clusters: [] });
    return fields.get(slug);
  };

  for (const course of vocCourses) {
    const slug = fieldOf(course);
    const own = standardsByCourse.get(course.id) ?? [];
    const included = RELEASE_SCOPE.has(course.courseCategory);
    const id = slugifyCourse(course.labelKorean);
    curriculaIndex.push({
      id, subjectKorean: course.labelKorean, majorFieldSlug: slug,
      courseCategory: course.courseCategory, gradeBand: '10-12',
      standardCount: own.length, included, deck6CourseId: course.id,
    });
    if (!included) continue;
    const standards = own.map((s) => {
      const key = `${id}:${s.code}`;
      keyByDeck6StandardId.set(s.id, key);
      return {
        key, code: s.code, gradeBand: '10-12',
        subjectKorean: course.labelKorean, majorFieldSlug: slug,
        courseCategory: course.courseCategory,
        domainKorean: domainLabel.get(s.domainId) ?? null,
        summary: s.summary, summaryKind: s.summaryKind,
        sourceRefs: s.sourceRefs, sourceLocator: s.sourceLocator ?? null,
        deck6Id: s.id,
      };
    });
    if (standards.length === 0) continue;
    const record = {
      id, subjectKorean: course.labelKorean, majorFieldSlug: slug,
      subjectGroupKorean: groupLabel.get(course.subjectGroupId) ?? null,
      courseCategory: course.courseCategory, gradeBand: '10-12',
      name: `${course.labelKorean} 2022 개정 전문교과 교육과정`,
      deck6CourseId: course.id, sourceRefs: course.sourceRefs ?? [],
      standardCount: standards.length, standards,
    };
    ensureField(slug).curricula.push(record);
    includedCourseIds.set(course.id, { slug, record });
  }

  // 주제: 수록 과목에 연결된 것만, 첫 수록 과목 기준으로 계열 배정.
  const includedTopicIds = new Set();
  for (const t of raw.topics) {
    const hit = (t.courseIds ?? []).find((cid) => includedCourseIds.has(cid));
    if (!hit) continue;
    const { slug, record } = includedCourseIds.get(hit);
    includedTopicIds.add(t.id);
    ensureField(slug).topics.push({
      id: t.id, titleKorean: t.labelKorean,
      subjectKorean: record.subjectKorean, majorFieldSlug: slug, gradeBand: '10-12',
      domainKorean: domainLabel.get(t.domainId) ?? null,
      facetKey: t.facetKey ?? null, types: t.types ?? [],
      description: t.description, evidence: t.evidence ?? [],
      assessmentPrompts: t.assessmentPrompts ?? [],
      standards: (t.standardAlignments ?? [])
        .map((a) => keyByDeck6StandardId.get(a.standardId))
        .filter(Boolean),
      sourceRefs: t.sourceRefs ?? [],
    });
  }

  // 클러스터: 수록 과목의 것만.
  for (const c of raw.clusters) {
    if (!includedCourseIds.has(c.courseId)) continue;
    const { slug, record } = includedCourseIds.get(c.courseId);
    ensureField(slug).clusters.push({
      id: c.id, titleKorean: c.labelKorean,
      subjectKorean: record.subjectKorean, majorFieldSlug: slug, gradeBand: '10-12',
      domainKorean: domainLabel.get(c.domainId) ?? null,
      summary: c.summary, topicCount: (c.topicIds ?? []).length, topics: c.topicIds ?? [],
    });
  }

  // 선수관계: 양끝이 수록 주제인 것만 core에 통합 보관 (희소·계열 교차 허용).
  const dependencies = [];
  let droppedDeps = 0;
  for (const r of raw.learningRelations ?? []) {
    if (!includedTopicIds.has(r.dependentTopicId) || !includedTopicIds.has(r.prerequisiteTopicId)) {
      droppedDeps += 1; continue;
    }
    dependencies.push({
      topicId: r.dependentTopicId, prerequisiteId: r.prerequisiteTopicId,
      strength: r.strength === 'required' ? 'hard' : 'soft',
      relationKind: r.relationKind, scope: r.scope, reason: r.reason, basis: r.basis,
    });
  }

  // 계열 개요: 미수록 카테고리 포함 전체 집계.
  const fieldMeta = new Map(); // slug → { labelKorean, annexCount: Map, courseCount, standardCount }
  for (const course of vocCourses) {
    const slug = fieldOf(course);
    if (!fieldMeta.has(slug)) {
      fieldMeta.set(slug, {
        labelKorean: slug === SPECIALIZED_COMMON_SLUG ? '전문공통' : groupLabel.get(course.subjectGroupId),
        annexCount: new Map(), courseCount: {}, standardCount: {},
      });
    }
    const meta = fieldMeta.get(slug);
    const cat = course.courseCategory;
    meta.courseCount[cat] = (meta.courseCount[cat] ?? 0) + 1;
    meta.standardCount[cat] = (meta.standardCount[cat] ?? 0) + (standardsByCourse.get(course.id)?.length ?? 0);
    for (const ref of course.sourceRefs ?? []) {
      meta.annexCount.set(ref, (meta.annexCount.get(ref) ?? 0) + 1);
    }
  }
  const majorFields = [...fieldMeta.entries()].map(([slug, meta]) => ({
    slug, labelKorean: meta.labelKorean,
    annexId: [...meta.annexCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    courseCount: meta.courseCount, standardCount: meta.standardCount,
    includedCategories: [...RELEASE_SCOPE],
  })).sort((a, b) => a.slug.localeCompare(b.slug, 'en'));

  return { majorFields, curriculaIndex, fields, dependencies, droppedDeps };
}

function readCache(name) {
  return JSON.parse(readFileSync(join(cacheDir, name), 'utf8')).records;
}

function main() {
  const raw = {
    subjectGroups: readCache('high-subject-groups.json'),
    courses: readCache('high-courses.json'),
    domains: readCache('high-domains.json'),
    standards: readCache('high-standards.json'),
    topics: readCache('high-topics.json'),
    clusters: readCache('high-clusters.json'),
    learningRelations: readCache('high-learning-relations.json'),
  };
  const out = buildVocational(raw);

  const includedCourses = out.curriculaIndex.filter((c) => c.included);
  if (includedCourses.length !== EXPECTED_INCLUDED_COURSES) {
    throw new Error(`수록 과목 수 불일치: ${includedCourses.length} ≠ ${EXPECTED_INCLUDED_COURSES}`);
  }

  const write = (rel, payload) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(payload, null, 1)}\n`);
  };
  write('core/major-fields.json', { majorFields: out.majorFields });
  write('core/curricula.json', { curricula: out.curriculaIndex });
  write('core/dependencies.json', { dependencies: out.dependencies });
  const fieldCounts = {};
  for (const [slug, data] of [...out.fields.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en'))) {
    write(`fields/${slug}/curriculum-standards.json`, { curricula: data.curricula });
    write(`fields/${slug}/topics.json`, { topics: data.topics });
    write(`fields/${slug}/clusters.json`, { clusters: data.clusters });
    fieldCounts[slug] = {
      courses: data.curricula.length,
      standards: data.curricula.reduce((n, c) => n + c.standardCount, 0),
    };
  }

  const totals = {
    courses: includedCourses.length,
    standards: Object.values(fieldCounts).reduce((n, f) => n + f.standards, 0),
  };
  if (process.argv.includes('--record-gates')) {
    writeFileSync(join(here, 'gates.json'), `${JSON.stringify({
      release: 'v0.2.0',
      includedCategories: [...RELEASE_SCOPE],
      totals, fields: fieldCounts,
    }, null, 2)}\n`);
    console.error('✓ gates.json 기록 — 수치를 직접 확인한 뒤 커밋할 것');
  }
  console.error(`✓ 수록 과목 ${totals.courses} · 성취기준 ${totals.standards} · 계열 ${Object.keys(fieldCounts).length}`);
  console.error(`✓ 선수관계 ${out.dependencies.length} (드롭 ${out.droppedDeps})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
