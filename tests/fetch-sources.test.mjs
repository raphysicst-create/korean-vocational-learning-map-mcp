import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheNameFor, pdfPattern, rawUrl } from '../pipeline/fetch-sources.mjs';

test('cacheNameFor는 경로 3번째 조각을 접두사로 쓴다', () => {
  assert.equal(cacheNameFor('data/kr/high/standards.json'), 'high-standards.json');
  assert.equal(cacheNameFor('data/kr/shared/source-manifest.json'), 'shared-source-manifest.json');
});

test('pdfPattern은 별책 번호를 공백·정확 일치로 잡는다', () => {
  assert.ok(pdfPattern(23).test('(2022개정)초·중등학교교육과정[별책23]경영·금융전문교과.pdf'));
  assert.ok(pdfPattern(27).test('(2022개정)초·중등학교 교육과정[별책27] 관광·레저 전문 교과.pdf'));
  assert.ok(!pdfPattern(3).test('[별책39]융복합.pdf'));
  assert.ok(!pdfPattern(23).test('[별책2]초등학교.pdf'));
});

test('rawUrl은 고정 커밋 raw URL을 만든다', () => {
  assert.equal(
    rawUrl('abc123', 'data/kr/high/courses.json'),
    'https://raw.githubusercontent.com/DECK6/korean-secondary-learning-map/abc123/data/kr/high/courses.json'
  );
});
