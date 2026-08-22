#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const cacheDir = join(repoRoot, '.cache', 'deck6');
const sourcesPath = join(here, 'sources.json');

export function rawUrl(commit, path) {
  return `https://raw.githubusercontent.com/DECK6/korean-secondary-learning-map/${commit}/${path}`;
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function cacheNameFor(path) {
  // data/kr/high/standards.json → high-standards.json
  const parts = path.split('/');
  return `${parts[2]}-${basename(path)}`;
}

// [별책23] · [별책 23] · [ 별책23 ] 을 잡되 [별책2]·[별책230]은 잡지 않는다.
export function pdfPattern(annexNo) {
  return new RegExp(`\\[\\s*별\\s*책\\s*${annexNo}\\s*\\]`);
}

async function fetchDeck6Files(sources) {
  let failures = 0;
  mkdirSync(cacheDir, { recursive: true });
  for (const file of sources.deck6.files) {
    const dest = join(cacheDir, cacheNameFor(file.path));
    let body;
    if (existsSync(dest)) {
      body = readFileSync(dest);
    } else {
      const res = await fetch(rawUrl(sources.deck6.commit, file.path));
      if (!res.ok) { console.error(`✗ 다운로드 실패 ${file.path}: HTTP ${res.status}`); failures += 1; continue; }
      body = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, body);
    }
    const hash = sha256Hex(body);
    if (file.sha256 !== hash) { console.error(`✗ 해시 불일치 ${file.path}\n  대장: ${file.sha256}\n  실제: ${hash}`); failures += 1; }
    else console.error(`✓ ${file.path}`);
  }
  return failures;
}

async function resolvePdfs(sources) {
  // PDF의 URL·SHA-256은 sources.json의 pdfAnnexes.items에 고정돼 있다.
  // 상류 shared/source-manifest.json과도 대조해, 상류가 바뀌면 조용히 따라가지 않고 실패시킨다.
  const manifest = JSON.parse(
    readFileSync(join(cacheDir, 'shared-source-manifest.json'), 'utf8')
  );
  const entries = manifest.sources ?? manifest;
  const pdfDir = resolve(repoRoot, process.env.PDF_DIR ?? '..');
  const pdfPaths = {};
  let failures = 0;
  for (const pinned of sources.pdfAnnexes.items) {
    const n = pinned.annexNo;
    const entry = entries.find((e) => e.id === pinned.id);
    if (!entry) { console.error(`✗ 상류 매니페스트에 ${pinned.id} 항목이 없습니다.`); failures += 1; continue; }
    if (entry.url !== pinned.url || entry.sha256 !== pinned.sha256) {
      console.error(`✗ annex${n} 상류 대장이 고정값과 다릅니다 — sources.json과 RIGHTS.md를 검토해 함께 갱신하세요.
  고정: ${pinned.sha256}
  상류: ${entry.sha256}`);
      failures += 1; continue;
    }
    const re = pdfPattern(n);
    let name = readdirSync(pdfDir).find((f) => f.toLowerCase().endsWith('.pdf') && re.test(f));
    if (!name) {
      console.error(`… annex${n} 로컬 PDF 없음 — NCIC에서 다운로드 시도`);
      const res = await fetch(pinned.url);
      if (!res.ok) {
        console.error(`✗ annex${n} 다운로드 실패(HTTP ${res.status}) — ${pinned.url} 을 브라우저로 받아 PDF_DIR에 두세요.`);
        failures += 1; continue;
      }
      name = `[별책${n}] 전문교과 교육과정(2024-3호).pdf`;
      writeFileSync(join(pdfDir, name), Buffer.from(await res.arrayBuffer()));
    }
    const p = join(pdfDir, name);
    const hash = sha256Hex(readFileSync(p));
    if (hash !== pinned.sha256) {
      console.error(`✗ annex${n} 해시 불일치 — 구판(2022-33호) 가능성. 2024-3호 개정판으로 교체하세요.\n  파일: ${name}\n  대장: ${pinned.sha256}\n  실제: ${hash}`);
      failures += 1; continue;
    }
    console.error(`✓ [별책${n}] ${name}`);
    pdfPaths[`annex${n}`] = p;
  }
  writeFileSync(join(repoRoot, '.cache', 'pdf-paths.json'), JSON.stringify(pdfPaths, null, 1));
  return failures;
}

async function main() {
  const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
  const failures = (await fetchDeck6Files(sources)) + (await resolvePdfs(sources));
  if (failures) { console.error(`✗ 실패 ${failures}건`); process.exit(1); }
  console.error('✓ 원본 전체 확보·검증 완료');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
