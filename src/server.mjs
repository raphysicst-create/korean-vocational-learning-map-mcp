import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeCode, parseVocationalCode } from './normalize.mjs';
import {
  normalizeText, searchStandards, searchStandardTexts, searchTopics, suggestSimilar,
} from './search.mjs';
import { directEdges, learningPath } from './graph.mjs';
import { buildRoadmap } from './roadmap.mjs';

const SERVER_INFO = { name: 'korean-vocational-learning-map', version: '0.2.0' };

const MAJOR_FIELD = z.string().max(100).optional()
  .describe('계열 슬러그 또는 계열명 (예: electrical-electronics, 전기·전자)');
const EMPTY_HINT =
  '검색 결과가 없습니다. query를 더 짧은 핵심어로 바꾸거나 majorField 필터를 확인하세요. 계열 목록은 list_major_fields.';
const SPARSE_DEPS_HINT =
  '전문교과는 공식 문서에 선수관계 명시가 희소합니다 — 관계가 없는 것이 정상일 수 있습니다.';
const MECHANICAL_NOTE =
  '이 주제의 설명·관찰 증거·평가 발문은 상류 데이터의 기계 파생물(candidate)입니다. 성취기준 공식 원문은 get_standard로 확인하세요.';

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 1) }] };
}

function fail(message, suggestions = []) {
  const text = suggestions.length ? `${message} 유사 후보: ${suggestions.join(', ')}` : message;
  return { content: [{ type: 'text', text }], isError: true };
}

// majorField 입력(슬러그 또는 한국어 계열명)을 슬러그로 푼다. 실패 시 Error(한국어).
function resolveMajorField(store, input) {
  if (!input) return null;
  const squash = (v) => normalizeText(v).replace(/\s+/g, '');
  const target = squash(input);
  const hit = store.majorFields.find(
    (f) => f.slug === input || squash(f.labelKorean) === target
  );
  if (!hit) {
    throw new Error(
      `계열 "${input}"을(를) 찾을 수 없습니다. 유효한 계열: ${store.majorFields.map((f) => f.slug).join(', ')}`
    );
  }
  return hit.slug;
}

// 과목명이 주어지면 그 과목이 속한 계열만, 아니면 majorField 또는 전체를 로드한다.
function ensureScope(store, { subject, majorField }) {
  if (majorField) { store.ensureField(majorField); return; }
  if (subject) {
    const squash = (v) => normalizeText(v).replace(/\s+/g, '');
    const target = squash(subject);
    const hits = store.curriculaIndex.filter((c) => c.included && squash(c.subjectKorean) === target);
    if (hits.length > 0) {
      for (const hit of hits) store.ensureField(hit.majorFieldSlug);
      return;
    }
  }
  store.ensureAllIncluded();
}

// 과목명 공백 무시 대조로 실제 라벨 복원 (색인 기준 — 로드 여부 무관).
function resolveSubjectLabel(store, label) {
  const squash = (v) => normalizeText(v).replace(/\s+/g, '');
  const target = squash(label);
  if (!target) return label;
  return store.curriculaIndex.find((c) => squash(c.subjectKorean) === target)?.subjectKorean ?? label;
}

function aboutText(store) {
  const { taxonomyVersion, counts } = store.manifest;
  return [
    '# 한국 특성화고 전문교과 학습지도 MCP 서버',
    '',
    `- 데이터 릴리스: ${taxonomyVersion}`,
    `- 수량: 수록 과목 ${counts.curricula}/${counts.curriculaIndexed} · 성취기준 ${counts.standards} · 주제 ${counts.topics} · 선수관계 ${counts.dependencies} · 계열 ${counts.fields}`,
    '- 라이선스: MIT. 데이터 원천은 DECK6/korean-secondary-learning-map(MIT)이며 원 저작권 고지를 유지한다.',
    '- 성취기준 공식 원문을 수록한다. 원문은 국가교육위원회 고시 제2024-3호 별책23~39(전문교과) 공공저작물로서 저작권법 제24조의2에 따라 출처를 표기해 이용한다.',
    '- 범위: 특성화고·마이스터고 전문교과 전 범위(전공일반·전공실무·전문공통). 보통교과·특목 계열은 korean-secondary-learning-map-mcp가 담당한다.',
    '- 세부 학습 주제의 설명·증거·발문은 상류의 기계 파생물(candidate)이다.',
    '- 교육부·국가교육위원회·NCIC의 공식 산출물이 아니며, 개별 학습자를 진단하지 않는다.',
    '- 출처·방법론: https://github.com/DECK6/korean-secondary-learning-map',
  ].join('\n');
}

export function createServer(store) {
  const server = new McpServer(SERVER_INFO);

  // 도구 핸들러 공통 래퍼: resolve·ensure 단계의 Error를 isError 응답으로 변환.
  const guarded = (fn) => async (args) => {
    try {
      return await fn(args);
    } catch (error) {
      return fail(error.message);
    }
  };

  server.registerResource(
    'about',
    'about://korean-vocational-learning-map',
    {
      title: '데이터 출처·라이선스 안내',
      description: '데이터 릴리스, 수량, 라이선스, 수록 범위 고지',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: aboutText(store) }],
    })
  );

  server.registerTool(
    'list_major_fields',
    {
      title: '전문교과 계열 목록',
      description:
        '17개 계열 + 전문공통의 개요(과목 수·성취기준 수·수록 여부·근거 별책)를 반환한다.',
      inputSchema: {},
    },
    guarded(async () => ok({
      release: store.manifest.taxonomyVersion,
      fields: store.majorFields.map((f) => ({
        slug: f.slug,
        labelKorean: f.labelKorean,
        annexId: f.annexId,
        courseCount: f.courseCount,
        standardCount: f.standardCount,
        includedCategories: f.includedCategories,
        dataAvailable: store.includedFieldSlugs.includes(f.slug),
      })),
    }))
  );

  server.registerTool(
    'list_curricula',
    {
      title: '과목 목록',
      description:
        '필터가 없으면 계열 단위 요약을 반환한다. majorField를 주면 그 계열의 과목 목록을 반환한다.',
      inputSchema: { majorField: MAJOR_FIELD },
    },
    guarded(async ({ majorField }) => {
      const slug = resolveMajorField(store, majorField);
      if (!slug) {
        const groups = new Map();
        for (const c of store.curriculaIndex) {
          if (!groups.has(c.majorFieldSlug)) {
            const field = store.majorFieldsBySlug.get(c.majorFieldSlug);
            groups.set(c.majorFieldSlug, {
              majorFieldSlug: c.majorFieldSlug,
              labelKorean: field?.labelKorean ?? null,
              courseCount: 0, includedCourseCount: 0, standardCount: 0,
            });
          }
          const g = groups.get(c.majorFieldSlug);
          g.courseCount += 1;
          if (c.included) g.includedCourseCount += 1;
          g.standardCount += c.standardCount;
        }
        return ok({
          groups: [...groups.values()].sort((a, b) => a.majorFieldSlug.localeCompare(b.majorFieldSlug, 'en')),
        });
      }
      const courses = store.curriculaIndex
        .filter((c) => c.majorFieldSlug === slug)
        .map((c) => ({
          id: c.id, subjectKorean: c.subjectKorean, courseCategory: c.courseCategory,
          gradeBand: c.gradeBand, standardCount: c.standardCount, included: c.included,
        }));
      return ok({
        majorFieldSlug: slug,
        courses,
      });
    })
  );

  server.registerTool(
    'search_standards',
    {
      title: '성취기준 검색',
      description:
        '성취기준을 코드·키워드·필터로 검색해 요약 목록을 반환한다. 상세는 get_standard로 조회한다.',
      inputSchema: {
        query: z.string().max(200).optional().describe('키워드 또는 코드 (예: 회로, 간기 01-01)'),
        subject: z.string().max(200).optional().describe('과목명'),
        majorField: MAJOR_FIELD,
        domain: z.string().max(200).optional().describe('영역명'),
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async (args) => {
      const majorField = resolveMajorField(store, args.majorField);
      ensureScope(store, { subject: args.subject, majorField });
      const result = searchStandards(store, {
        ...args, majorField, subject: args.subject ? resolveSubjectLabel(store, args.subject) : undefined,
      });
      if (result.total === 0) result.hint = EMPTY_HINT;
      return ok(result);
    })
  );

  server.registerTool(
    'search_standard_text',
    {
      title: '성취기준 원문 검색',
      description:
        '성취기준 공식 원문 전문에서 키워드를 검색해 코드와 스니펫을 반환한다. 상세 원문은 get_standard의 officialText.',
      inputSchema: {
        query: z.string().min(1).max(200).describe('원문에서 찾을 키워드'),
        subject: z.string().max(200).optional().describe('과목명 필터'),
        majorField: MAJOR_FIELD,
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async (args) => {
      const majorField = resolveMajorField(store, args.majorField);
      ensureScope(store, { subject: args.subject, majorField });
      const result = searchStandardTexts(store, {
        ...args, majorField, subject: args.subject ? resolveSubjectLabel(store, args.subject) : undefined,
      });
      if (result.total === 0) result.hint = EMPTY_HINT;
      return ok(result);
    })
  );

  server.registerTool(
    'get_standard',
    {
      title: '성취기준 상세',
      description:
        '성취기준 코드([간기 01-01] — 공백 유무 무관)로 전체 레코드, 공식 원문, 연결 주제, 코드 구조 해석을 조회한다. 일부 코드는 여러 과목·계열이 공유할 수 있어 subject·majorField로 구분한다.',
      inputSchema: {
        code: z.string().max(200).describe('성취기준 코드'),
        subject: z.string().max(200).optional().describe('과목명 (공유 코드 구분용)'),
        majorField: MAJOR_FIELD,
      },
    },
    guarded(async ({ code, subject, majorField }) => {
      const slug = resolveMajorField(store, majorField);
      if (slug) store.ensureField(slug);
      else ensureScope(store, { subject });
      const normalized = normalizeCode(code);
      let all = store.standardsByCodeAll.get(normalized) ?? [];
      if (slug) all = all.filter((s) => s.majorFieldSlug === slug);
      let candidates = all;
      if (subject && all.length > 0) {
        const target = normalizeText(resolveSubjectLabel(store, subject));
        candidates = all.filter((s) => normalizeText(s.subjectKorean) === target);
        if (candidates.length === 0) {
          return fail(
            `코드 ${normalized}에 과목 ${subject}은(는) 없습니다. 이 코드의 과목: ${all.map((s) => s.subjectKorean).join(', ')}`
          );
        }
      }
      if (candidates.length === 0) {
        return fail(
          `성취기준 ${normalized}을(를) 찾을 수 없습니다.`,
          suggestSimilar(normalized, [...store.standardsByCodeAll.keys()])
        );
      }
      if (candidates.length > 1) {
        return fail(
          `코드 ${normalized}는 과목 ${candidates.map((s) => s.subjectKorean).join(', ')}에 모두 존재합니다. subject로 과목을 지정하세요.`
        );
      }
      const standard = candidates[0];
      const linked = store.topicsByStandardKey.get(standard.key) ?? [];
      return ok({
        ...standard,
        officialText: store.textsByKey.get(standard.key) ?? null,
        codeStructure: parseVocationalCode(standard.code),
        linkedTopics: linked.map((topic) => ({ id: topic.id, titleKorean: topic.titleKorean })),
      });
    })
  );

  server.registerTool(
    'search_topics',
    {
      title: '학습 주제 검색',
      description:
        '세부 학습 주제를 키워드·필터로 검색한다. 주제는 상류 기계 파생물(candidate)이다. 상세는 get_topic.',
      inputSchema: {
        query: z.string().max(200).optional().describe('키워드'),
        subject: z.string().max(200).optional().describe('과목명'),
        majorField: MAJOR_FIELD,
        facetKey: z.string().max(200).optional().describe('주제 관점 키'),
        standardCode: z.string().max(200).optional().describe('이 성취기준에 연결된 주제만'),
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async (args) => {
      const majorField = resolveMajorField(store, args.majorField);
      ensureScope(store, { subject: args.subject, majorField });
      const result = searchTopics(store, {
        ...args, majorField, subject: args.subject ? resolveSubjectLabel(store, args.subject) : undefined,
      });
      if (result.total === 0) result.hint = EMPTY_HINT;
      return ok(result);
    })
  );

  server.registerTool(
    'get_topic',
    {
      title: '학습 주제 상세',
      description:
        '주제 ID로 전체 레코드를 조회한다. 설명·증거·발문은 상류 기계 파생물(candidate)이다.',
      inputSchema: { topicId: z.string().max(200).describe('주제 ID (예: kr.topic.2022.high.…)') },
    },
    guarded(async ({ topicId }) => {
      if (!store.topicsById.has(topicId)) store.ensureAllIncluded();
      const topic = store.topicsById.get(topicId);
      if (!topic) {
        return fail(
          `주제 ${topicId}을(를) 찾을 수 없습니다.`,
          suggestSimilar(topicId, [...store.topicsById.keys()].slice(0, 2000))
        );
      }
      return ok({ ...topic, note: MECHANICAL_NOTE });
    })
  );

  server.registerTool(
    'get_prerequisites',
    {
      title: '선수관계 조회',
      description:
        '주제의 선수(prerequisites)/후속(unlocks) 관계를 조회한다. 전문교과는 공식 선수관계가 희소해 빈 결과가 정상일 수 있다. depth=all이면 전이 경로를 위상 순서로 반환한다.',
      inputSchema: {
        topicId: z.string().max(200).describe('주제 ID'),
        direction: z.enum(['prerequisites', 'unlocks']).optional().describe('기본 prerequisites'),
        depth: z.union([z.literal(1), z.literal('all')]).optional().describe('1(직접) 또는 all(전이)'),
        strength: z.enum(['hard', 'soft']).optional().describe('관계 강도 필터'),
      },
    },
    guarded(async ({ topicId, direction = 'prerequisites', depth = 1, strength }) => {
      if (!store.topicsById.has(topicId)) store.ensureAllIncluded();
      if (!store.topicsById.has(topicId)) {
        return fail(
          `주제 ${topicId}을(를) 찾을 수 없습니다.`,
          suggestSimilar(topicId, [...store.topicsById.keys()].slice(0, 2000))
        );
      }
      if (depth === 'all') {
        return ok({
          topicId, direction,
          pathOrder: learningPath(store, topicId, { direction, strength }),
        });
      }
      const edges = directEdges(store, topicId, { direction, strength });
      return ok({
        topicId, direction, edges,
        hint: edges.length === 0 ? SPARSE_DEPS_HINT : undefined,
      });
    })
  );

  server.registerTool(
    'get_learning_roadmap',
    {
      title: '학습 로드맵 요약',
      description:
        '과목의 성취기준을 영역→클러스터 계층으로 집계한 로드맵을 반환한다. 기존 데이터의 집계이며 새 순서를 만들지 않는다.',
      inputSchema: {
        subject: z.string().max(200).describe('과목명'),
        majorField: MAJOR_FIELD,
        domain: z.string().max(200).optional().describe('영역명 필터'),
      },
    },
    guarded(async ({ subject, majorField, domain }) => {
      const slug = resolveMajorField(store, majorField);
      ensureScope(store, { subject, majorField: slug });
      const resolved = resolveSubjectLabel(store, subject);
      const roadmap = buildRoadmap(store, { subject: resolved, majorField: slug, domain });
      if (roadmap.error === 'unknown-subject') {
        return fail(`과목 ${subject}을(를) 찾을 수 없습니다.`, roadmap.suggestions);
      }
      if (roadmap.error === 'ambiguous-subject') {
        return fail(
          `과목 ${subject}은(는) 여러 계열에 있습니다: ${roadmap.fields.join(', ')}. majorField로 계열을 지정하세요.`
        );
      }
      if (roadmap.standardCount === 0) {
        roadmap.hint = '해당 영역 필터에 성취기준이 없습니다. domain 이름을 확인하세요.';
      }
      return ok(roadmap);
    })
  );

  server.registerTool(
    'list_clusters',
    {
      title: '클러스터 조회',
      description:
        '학습 클러스터(단원 묶음) 목록을 조회한다. clusterId를 주면 단건 전체 레코드를 반환한다.',
      inputSchema: {
        clusterId: z.string().max(200).optional().describe('클러스터 ID (단건 상세)'),
        subject: z.string().max(200).optional().describe('과목명 필터'),
        majorField: MAJOR_FIELD,
        limit: z.number().int().min(1).max(50).optional().describe('최대 결과 수 (기본 20)'),
      },
    },
    guarded(async ({ clusterId, subject, majorField, limit }) => {
      const slug = resolveMajorField(store, majorField);
      if (clusterId) {
        if (!store.clustersById.has(clusterId)) store.ensureAllIncluded();
        const cluster = store.clustersById.get(clusterId);
        if (!cluster) {
          return fail(
            `클러스터 ${clusterId}을(를) 찾을 수 없습니다.`,
            suggestSimilar(clusterId, [...store.clustersById.keys()].slice(0, 2000))
          );
        }
        return ok(cluster);
      }
      ensureScope(store, { subject, majorField: slug });
      let candidates = store.clusters;
      if (subject) {
        const target = normalizeText(resolveSubjectLabel(store, subject));
        candidates = candidates.filter((c) => normalizeText(c.subjectKorean) === target);
      }
      if (slug) candidates = candidates.filter((c) => c.majorFieldSlug === slug);
      // total은 잘리기 전 전체 개수 — 호출자가 결과가 잘렸음을 알 수 있어야 한다.
      const cap = Math.min(limit ?? 20, 50);
      return ok({
        total: candidates.length,
        results: candidates.slice(0, cap).map((c) => ({
          id: c.id, titleKorean: c.titleKorean, subjectKorean: c.subjectKorean,
          majorFieldSlug: c.majorFieldSlug, topicCount: c.topicCount,
        })),
      });
    })
  );

  return server;
}
