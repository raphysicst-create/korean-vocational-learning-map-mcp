import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createStore } from '../src/data-store.mjs';
import { createServer } from '../src/server.mjs';

async function connect(store = createStore()) {
  const server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);
  return { client, store };
}

function payloadOf(result) {
  return JSON.parse(result.content[0].text);
}

test('about 리소스에 고시 원문 권리 근거가 있다', async () => {
  const { client } = await connect();
  const { contents } = await client.readResource({ uri: 'about://korean-vocational-learning-map' });
  assert.ok(contents[0].text.includes('제7조 제2호'));
  assert.ok(contents[0].text.includes('수록 원문 기준 고시'));
  assert.ok(contents[0].text.includes('별책23~39'));
});

test('도구 10종이 등록되어 있다', async () => {
  const { client } = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      'get_learning_roadmap', 'get_prerequisites', 'get_standard', 'get_topic',
      'list_clusters', 'list_curricula', 'list_major_fields',
      'search_standard_text', 'search_standards', 'search_topics',
    ]
  );
});

test('list_major_fields: 계열 개요', async () => {
  const { client } = await connect();
  const payload = payloadOf(await client.callTool({ name: 'list_major_fields', arguments: {} }));
  assert.ok(payload.fields.length >= 1);
  const f = payload.fields[0];
  assert.ok('slug' in f && 'labelKorean' in f && 'courseCount' in f && 'standardCount' in f);
  // 전 범위 수록으로 값이 상수가 된 단계 출시 잔재 필드는 응답에서 제거됐다.
  assert.ok(!('includedCategories' in f));
  assert.ok(!('dataAvailable' in f));
});

test('list_curricula: 무필터는 계열 요약, majorField 지정 시 과목 목록', async () => {
  const { client, store } = await connect();
  const summary = payloadOf(await client.callTool({ name: 'list_curricula', arguments: {} }));
  assert.ok(summary.groups.length >= 1);
  const slug = store.includedFieldSlugs[0];
  const detail = payloadOf(
    await client.callTool({ name: 'list_curricula', arguments: { majorField: slug } })
  );
  assert.ok(detail.courses.length >= 1);
  // 단계 출시 잔재: 무필터 요약의 includedCourseCount·과목의 included는 항상 상수였다.
  assert.ok(!('includedCourseCount' in summary.groups[0]));
  assert.ok(!('included' in detail.courses[0]));
});

test('검색은 계열을 지연 로드한다 (서버 생성 시 0, 검색 후 ≥1)', async () => {
  const { client, store } = await connect();
  assert.equal(store.loadedFields.size, 0);
  const slug = store.includedFieldSlugs[0];
  await client.callTool({ name: 'search_standards', arguments: { majorField: slug } });
  assert.ok(store.loadedFields.has(slug));
  assert.equal(store.loadedFields.size, 1); // 다른 계열은 안 로드됨
});

test('ID·코드 조회는 core 라우팅 색인의 계열만 로드하고 미지 ID는 전혀 로드하지 않는다', async () => {
  const unknown = await connect();
  await unknown.client.callTool({ name: 'get_topic', arguments: { topicId: 'no-such-topic' } });
  await unknown.client.callTool({ name: 'list_clusters', arguments: { clusterId: 'no-such-cluster' } });
  await unknown.client.callTool({ name: 'get_standard', arguments: { code: '[없음 99-99]' } });
  assert.equal(unknown.store.loadedFields.size, 0);

  const topicCase = await connect();
  const [topicId, topicField] = topicCase.store.topicFieldById.entries().next().value;
  await topicCase.client.callTool({ name: 'get_topic', arguments: { topicId } });
  assert.deepEqual([...topicCase.store.loadedFields], [topicField]);

  const codeCase = await connect();
  const [code, codeFields] = codeCase.store.standardFieldsByCode.entries().next().value;
  await codeCase.client.callTool({ name: 'get_standard', arguments: { code } });
  assert.deepEqual([...codeCase.store.loadedFields].sort(), [...codeFields].sort());

  const prerequisiteCase = await connect();
  await prerequisiteCase.client.callTool({ name: 'get_prerequisites', arguments: { topicId } });
  assert.deepEqual([...prerequisiteCase.store.loadedFields], [topicField]);

  const clusterCase = await connect();
  const [clusterId, clusterField] = clusterCase.store.clusterFieldById.entries().next().value;
  await clusterCase.client.callTool({ name: 'list_clusters', arguments: { clusterId } });
  assert.deepEqual([...clusterCase.store.loadedFields], [clusterField]);

  const listCase = await connect();
  const list = payloadOf(await listCase.client.callTool({ name: 'list_clusters', arguments: {} }));
  assert.equal(list.results.length, 20);
  assert.equal(list.total, listCase.store.clusterFieldById.size);
  assert.ok(listCase.store.loadedFields.size < listCase.store.includedFieldSlugs.length);
});

// 라우팅 색인은 계열 slug 알파벳순이라, 후보를 앞에서 잘라내면
// 색인 뒷부분 계열의 오타는 엉뚱한 계열의 코드·ID를 제안받게 된다.
test('미지 코드·ID 제안은 후보를 잘라내지 않고 색인 뒷부분까지 본다', async () => {
  const { client, store } = await connect();

  const codes = [...store.standardFieldsByCode.keys()];
  const lastCode = codes[codes.length - 1];
  const missingCode = lastCode.replace(/\]$/, '9]');
  assert.ok(!store.standardFieldsByCode.has(missingCode));
  const codeResult = await client.callTool({ name: 'get_standard', arguments: { code: missingCode } });
  assert.ok(codeResult.isError);
  assert.ok(
    codeResult.content[0].text.includes(lastCode),
    `제안에 ${lastCode}이(가) 없다: ${codeResult.content[0].text}`
  );

  const topicIds = [...store.topicFieldById.keys()];
  const lastTopic = topicIds[topicIds.length - 1];
  const topicResult = await client.callTool({ name: 'get_topic', arguments: { topicId: `${lastTopic}x` } });
  assert.ok(topicResult.isError);
  assert.ok(topicResult.content[0].text.includes(lastTopic));

  const clusterIds = [...store.clusterFieldById.keys()];
  const lastCluster = clusterIds[clusterIds.length - 1];
  const clusterResult = await client.callTool({ name: 'list_clusters', arguments: { clusterId: `${lastCluster}x` } });
  assert.ok(clusterResult.isError);
  assert.ok(clusterResult.content[0].text.includes(lastCluster));
});

test('list_clusters는 offset으로 상한 너머 total까지 페이지를 넘길 수 있다', async () => {
  const { client } = await connect();
  const call = async (args) => payloadOf(await client.callTool({ name: 'list_clusters', arguments: args }));

  const first = await call({ limit: 5 });
  const second = await call({ limit: 5, offset: 5 });
  assert.equal(first.offset, 0);
  assert.equal(second.offset, 5);
  assert.equal(first.results.length, 5);
  assert.equal(second.results.length, 5);
  assert.equal(first.total, second.total);

  const seen = new Set(first.results.map((r) => r.id));
  assert.ok(second.results.every((r) => !seen.has(r.id)));

  // limit 상한(50) 너머의 구간에도 도달할 수 있어야 한다 — offset 이전에는 불가능했다.
  const far = await call({ limit: 5, offset: 100 });
  assert.equal(far.offset, 100);
  assert.equal(far.results.length, 5);
  assert.ok(far.results.every((r) => !seen.has(r.id)));

  // 끝을 넘으면 total은 유지한 채 빈 페이지를 준다.
  const past = await call({ offset: first.total });
  assert.equal(past.total, first.total);
  assert.equal(past.results.length, 0);
});

test('실재하지 않는 주제·클러스터 ID에는 유사 후보를 지어내지 않는다', async () => {
  const { client, store } = await connect();
  const realTopic = [...store.topicFieldById.keys()][0];
  const fabricated = realTopic.replace(/[0-9a-f]{20}$/, '1234567890abcdef1234');
  assert.ok(!store.topicFieldById.has(fabricated));

  const miss = await client.callTool({ name: 'get_topic', arguments: { topicId: fabricated } });
  assert.ok(miss.isError);
  assert.ok(!miss.content[0].text.includes('유사 후보'), miss.content[0].text);

  const typo = await client.callTool({ name: 'get_topic', arguments: { topicId: `${realTopic}z` } });
  assert.ok(typo.isError);
  assert.ok(typo.content[0].text.includes(realTopic));
});

test('search_standards → get_standard 왕복 (원문 + 코드 구조 해석)', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const sample = store.allStandards.find((s) => /\s/.test(s.code));
  const detail = payloadOf(
    await client.callTool({ name: 'get_standard', arguments: { code: sample.code, subject: sample.subjectKorean } })
  );
  assert.equal(detail.code, sample.code);
  assert.ok(detail.officialText.length > 5);
  assert.ok(detail.codeStructure === null || typeof detail.codeStructure.abbrev === 'string');
});

test('get_standard: 미지 코드는 유사 후보와 함께 실패', async () => {
  const { client } = await connect();
  const result = await client.callTool({ name: 'get_standard', arguments: { code: '[없음 99-99]' } });
  assert.ok(result.isError);
  assert.ok(result.content[0].text.includes('찾을 수 없습니다'));
});

test('get_topic: 주제 전체 레코드 (기계 파생 고지 포함)', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const topic = store.topics[0];
  const payload = payloadOf(await client.callTool({ name: 'get_topic', arguments: { topicId: topic.id } }));
  assert.equal(payload.id, topic.id);
  assert.ok(payload.note.includes('기계'));
});

test('get_prerequisites: 없는 주제 실패 / 있는 주제는 edges 반환 + 희소 안내', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const topic = store.topics[0];
  const payload = payloadOf(
    await client.callTool({ name: 'get_prerequisites', arguments: { topicId: topic.id } })
  );
  assert.ok(Array.isArray(payload.edges));
  if (payload.edges.length === 0) assert.ok(payload.hint.includes('희소'));
});

test('get_learning_roadmap: 과목 로드맵', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const curriculum = store.curricula[0];
  const payload = payloadOf(
    await client.callTool({
      name: 'get_learning_roadmap',
      arguments: { subject: curriculum.subjectKorean, majorField: curriculum.majorFieldSlug },
    })
  );
  assert.equal(payload.standardCount, curriculum.standardCount);
});

test('list_clusters: 요약 목록과 단건 상세', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  if (store.clusters.length === 0) return; // 전문교과에 클러스터가 없으면 스킵
  const list = payloadOf(await client.callTool({ name: 'list_clusters', arguments: {} }));
  assert.ok(list.total >= 1);
  const detail = payloadOf(
    await client.callTool({ name: 'list_clusters', arguments: { clusterId: list.results[0].id } })
  );
  assert.equal(detail.id, list.results[0].id);
});

test('list_clusters: 무필터 목록에도 limit 상한이 걸린다', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  if (store.clusters.length <= 50) return; // 상한을 시험할 만큼 크지 않으면 스킵
  const dflt = payloadOf(await client.callTool({ name: 'list_clusters', arguments: {} }));
  assert.ok(dflt.results.length <= 50, '무필터 호출이 전량을 반환하면 안 된다');
  assert.equal(dflt.results.length, 20); // 다른 도구와 같은 기본값
  assert.ok(dflt.total > dflt.results.length, 'total은 잘리기 전 전체 개수여야 한다');
  const capped = payloadOf(
    await client.callTool({ name: 'list_clusters', arguments: { limit: 50 } })
  );
  assert.equal(capped.results.length, 50);
  assert.equal(capped.total, dflt.total);
  assert.equal(capped.total, store.clusters.length);
});

test('search_standard_text: 원문 검색', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const text = [...store.textsByKey.values()][0];
  const word = text.split(' ').find((w) => w.length >= 2);
  const payload = payloadOf(
    await client.callTool({ name: 'search_standard_text', arguments: { query: word } })
  );
  assert.ok(payload.total >= 1);
});

test('미지 majorField는 한국어 오류 + 유효 슬러그 안내', async () => {
  const { client } = await connect();
  const result = await client.callTool({
    name: 'search_standards', arguments: { majorField: 'no-such' },
  });
  assert.ok(result.isError);
  assert.ok(result.content[0].text.includes('계열'));
});

test('get_standard: majorField로 계열을 좁혀 조회한다', async () => {
  const { client, store } = await connect();
  store.ensureAllIncluded();
  const sample = store.allStandards[0];
  const detail = payloadOf(
    await client.callTool({
      name: 'get_standard',
      arguments: { code: sample.code, subject: sample.subjectKorean, majorField: sample.majorFieldSlug },
    })
  );
  assert.equal(detail.key, sample.key);
  // 잘못된 계열을 주면 해당 계열엔 그 코드가 없다는 오류.
  const wrongField = store.includedFieldSlugs.find((s) => s !== sample.majorFieldSlug);
  const miss = await client.callTool({
    name: 'get_standard',
    arguments: { code: sample.code, majorField: wrongField },
  });
  // 다른 계열에 같은 코드가 실존할 수도 있으므로: 성공하면 그 계열 소속이어야 하고, 실패면 한국어 오류.
  if (miss.isError) assert.ok(miss.content[0].text.includes('찾을 수 없습니다'));
  else assert.equal(payloadOf(miss).majorFieldSlug, wrongField);
});

test('list_major_fields: 전 범위 수록 후 정적 미수록 note가 없다', async () => {
  const { client, store } = await connect();
  const payload = payloadOf(await client.callTool({ name: 'list_major_fields', arguments: {} }));
  assert.equal(payload.note, undefined);
  assert.equal(payload.fields.length, store.majorFields.length);
});
