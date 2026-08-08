import { normalizeText } from './normalize.mjs';
import { suggestSimilar } from './search.mjs';

export function buildRoadmap(store, { subject, majorField, domain } = {}) {
  const target = normalizeText(subject);
  let matches = store.curricula.filter((c) => normalizeText(c.subjectKorean) === target);
  if (majorField) matches = matches.filter((c) => c.majorFieldSlug === majorField);
  if (matches.length === 0) {
    return {
      error: 'unknown-subject',
      suggestions: suggestSimilar(subject, store.curricula.map((c) => c.subjectKorean)),
    };
  }
  if (new Set(matches.map((c) => c.majorFieldSlug)).size > 1) {
    return { error: 'ambiguous-subject', fields: [...new Set(matches.map((c) => c.majorFieldSlug))] };
  }
  const curriculum = matches[0];
  let standards = curriculum.standards;
  if (domain) {
    const domainTarget = normalizeText(domain);
    standards = standards.filter((s) => normalizeText(s.domainKorean) === domainTarget);
  }

  const domainMap = new Map();
  standards.forEach((standard, index) => {
    if (!domainMap.has(standard.domainKorean)) {
      domainMap.set(standard.domainKorean, { domainKorean: standard.domainKorean, firstSeen: index, standards: [] });
    }
    domainMap.get(standard.domainKorean).standards.push({
      code: standard.code,
      summary: standard.summary,
      topicCount: (store.topicsByStandardKey.get(standard.key) ?? []).length,
    });
  });

  const domains = [...domainMap.values()]
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .map((group) => ({
      domainKorean: group.domainKorean,
      clusters: store.clusters
        .filter(
          (cluster) =>
            normalizeText(cluster.subjectKorean) === normalizeText(curriculum.subjectKorean) &&
            cluster.majorFieldSlug === curriculum.majorFieldSlug &&
            normalizeText(cluster.domainKorean) === normalizeText(group.domainKorean)
        )
        .map((cluster) => ({ id: cluster.id, titleKorean: cluster.titleKorean })),
      standards: group.standards,
    }));

  return {
    subject: curriculum.subjectKorean,
    majorFieldSlug: curriculum.majorFieldSlug,
    gradeBand: curriculum.gradeBand,
    standardCount: standards.length,
    domains,
  };
}
