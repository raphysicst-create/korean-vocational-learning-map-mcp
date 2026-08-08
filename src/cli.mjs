#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStore } from './data-store.mjs';
import { createServer } from './server.mjs';

try {
  const store = createStore();
  const server = createServer(store);
  await server.connect(new StdioServerTransport());
  console.error(
    `korean-vocational-learning-map-mcp ${store.manifest.taxonomyVersion}: stdio 서버 시작됨 (계열 ${store.includedFieldSlugs.length}개 지연 로드)`
  );
} catch (error) {
  console.error(`서버 시작 실패: ${error.message}`);
  process.exit(1);
}
