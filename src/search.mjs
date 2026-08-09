import { normalizeText, normalizeCode } from './normalize.mjs';

export { normalizeText };

const MAX_LIMIT = 50;

export function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(prev[j] + 1, current[j - 1] + 1, substitution);
    }
    prev = current;
  }
  return prev[b.length];
}

export function suggestSimilar(input, candidates, max = 3) {
  const norm = normalizeText(input);
  const threshold = Math.max(3, Math.ceil(norm.length / 3));
  const scored = candidates.map((candidate) => {
    const c = normalizeText(candidate);
    if (c.includes(norm) || norm.includes(c)) return { candidate, distance: 0 };
    return { candidate, distance: levenshtein(norm, c) };
  });
  scored.sort((a, b) => a.distance - b.distance);
  return scored
    .filter((entry) => entry.distance <= threshold)
    .slice(0, max)
    .map((entry) => entry.candidate);
}

export function compactStandard(standard) {
  return {
    key: standard.key,
    code: standard.code,
    subjectKorean: standard.subjectKorean,
    majorFieldSlug: standard.majorFieldSlug,
    courseCategory: standard.courseCategory,
    gradeBand: standard.gradeBand,
    domainKorean: standard.domainKorean,
    summary: standard.summary,
  };
}

export function compactTopic(topic) {
  return {
    id: topic.id,
    titleKorean: topic.titleKorean,
    subjectKorean: topic.subjectKorean,
    majorFieldSlug: topic.majorFieldSlug,
    gradeBand: topic.gradeBand,
    domainKorean: topic.domainKorean,
    facetKey: topic.facetKey,
    types: topic.types,
  };
}

function matchesFilter(filterValue, ...recordValues) {
  const target = normalizeText(filterValue);
  return recordValues.some((value) => normalizeText(value) === target);
}

function scoreByFields(normQuery, weightedFields) {
  let score = 0;
  for (const [value, weight] of weightedFields) {
    if (value && normalizeText(value).includes(normQuery)) score += weight;
  }
  return score;
}

function rankByQuery(candidates, query, weightedFieldsOf, tieBreak) {
  const normQuery = normalizeText(query);
  return candidates
    .map((record) => ({ record, score: weightedFieldsOf(record, normQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || tieBreak(a.record, b.record))
    .map((entry) => entry.record);
}

export function searchStandards(store, { query, subject, majorField, domain, limit = 20 } = {}) {
  const cap = Math.min(limit, MAX_LIMIT);
  let candidates = store.allStandards;
  if (subject) candidates = candidates.filter((s) => matchesFilter(subject, s.subjectKorean));
  if (majorField) candidates = candidates.filter((s) => s.majorFieldSlug === majorField);
  if (domain) candidates = candidates.filter((s) => matchesFilter(domain, s.domainKorean));
  if (query) {
    const codeQuery = normalizeText(normalizeCode(query));
    candidates = rankByQuery(
      candidates,
      query,
      (s, normQuery) => {
        let score = scoreByFields(normQuery, [
          [s.domainKorean, 8],
          [s.summary, 5],
          [s.subjectKorean, 3],
        ]);
        const normCode = normalizeText(normalizeCode(s.code));
        if (normCode === codeQuery) score += 100;
        else if (normCode.includes(normQuery)) score += 50;
        return score;
      },
      (a, b) => a.code.localeCompare(b.code)
    );
  }
  return { total: candidates.length, results: candidates.slice(0, cap).map(compactStandard) };
}

export function searchTopics(
  store,
  { query, subject, majorField, facetKey, standardCode, limit = 20 } = {}
) {
  const cap = Math.min(limit, MAX_LIMIT);
  let candidates = store.topics;
  if (subject) candidates = candidates.filter((t) => matchesFilter(subject, t.subjectKorean));
  if (majorField) candidates = candidates.filter((t) => t.majorFieldSlug === majorField);
  if (facetKey) candidates = candidates.filter((t) => t.facetKey === facetKey);
  if (standardCode) {
    const matches = store.standardsByCodeAll.get(normalizeCode(standardCode)) ?? [];
    const linkedIds = new Set(
      matches.flatMap((standard) => (store.topicsByStandardKey.get(standard.key) ?? []).map((t) => t.id))
    );
    candidates = candidates.filter((t) => linkedIds.has(t.id));
  }
  if (query) {
    candidates = rankByQuery(
      candidates,
      query,
      (t, normQuery) =>
        scoreByFields(normQuery, [
          [t.titleKorean, 10],
          [t.domainKorean, 5],
          [t.description, 3],
        ]),
      (a, b) => a.id.localeCompare(b.id)
    );
  }
  return { total: candidates.length, results: candidates.slice(0, cap).map(compactTopic) };
}

export function makeSnippet(normalizedText, normQuery, radius = 40) {
  const idx = normalizedText.indexOf(normQuery);
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(normalizedText.length, idx + normQuery.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalizedText.length ? '…' : '';
  return `${prefix}${normalizedText.slice(start, end)}${suffix}`;
}

export function searchStandardTexts(store, { query, subject, majorField, limit = 20 } = {}) {
  const cap = Math.min(limit, MAX_LIMIT);
  const normQuery = normalizeText(query);
  const results = [];
  for (const standard of store.allStandards) {
    if (subject && !matchesFilter(subject, standard.subjectKorean)) continue;
    if (majorField && standard.majorFieldSlug !== majorField) continue;
    const text = store.textsByKey.get(standard.key);
    if (!text) continue;
    const snippet = makeSnippet(normalizeText(text), normQuery);
    if (snippet) {
      results.push({
        code: standard.code,
        subjectKorean: standard.subjectKorean,
        majorFieldSlug: standard.majorFieldSlug,
        snippet,
      });
    }
  }
  return { total: results.length, results: results.slice(0, cap) };
}
