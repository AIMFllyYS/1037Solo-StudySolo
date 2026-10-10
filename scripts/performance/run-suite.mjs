/** Stable offline entry points; neither mode starts a server or calls providers. */
import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const mode = process.argv[2];
run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.search-worker.json']);
run(process.execPath, ['scripts/performance/assert-search-worker.mjs']);
if (mode === 'node') {
  run(process.execPath, ['--import', 'tsx', '--expose-gc', 'scripts/performance/run-node-memory.mjs', '--label=perf-node']);
  run(process.execPath, ['--import', 'tsx', '--expose-gc', 'scripts/performance/run-search-baseline.mjs', '--worker', '--label=perf-node-worker']);
  run(process.execPath, ['--import', 'tsx', '--expose-gc', 'scripts/performance/run-product-memory.mjs']);
} else if (mode === 'contracts') {
  run(process.execPath, ['--import', 'tsx', 'scripts/check-index-freshness.ts']);
  run(process.execPath, ['--import', 'tsx', '--test',
    'lib/storage/chatStorage.atomic.test.ts',
    'classolo/tests/session-list-owner.test.ts',
    'lib/storage/chatStorage.queue.test.ts',
    'lib/storage/chatStorage.owner-epoch.test.ts',
    'lib/storage/sessionSummary.test.ts',
    'lib/storage/threeWayChatMerge.test.ts',
    'lib/content/offlineSubjects.test.ts',
    'lib/ai/search/indexHealth.test.ts',
    'lib/ai/search/searchService.test.ts',
    'lib/ai/search/search-worker.lifecycle.test.ts',
    'lib/stores/chat/chatHistory.lru.test.ts',
    'lib/stores/chat/chatHistory.budget.test.ts',
    'lib/stores/chat/chatHistory.cloud-window.test.ts',
    'lib/sync/engine.test.ts',
    'lib/markdown/sanitizeSchema.test.ts',
    'scripts/performance/runtime-asset-inventory.test.ts',
    'tests/bodySearch.test.ts',
  ]);
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
    'lib/ai/search/bm25-compact-oracle.test.tsx',
    'lib/ai/search/search-abort-boundary.test.tsx',
    'lib/stores/chat/chatHistory.owner-epoch.test.tsx',
    'components/window/DeferredWindowLayers.test.tsx',
    'components/window/PdfDocumentPane.test.tsx',
    'components/window/PptxDocumentPane.test.tsx',
    'components/window/DocxDocumentPane.test.tsx',
    'components/agent/AgentSourcePanel.test.tsx',
    'components/agent/AgentImagesPane.lifecycle.test.tsx',
    'components/agent/UnknownToolSourceCard.test.tsx',
    'lib/chat/exportChats.streaming.test.tsx',
    'lib/hooks/auth/useAuthSession.test.tsx',
    'components/shared/ContentImage.test.tsx',
    'lib/stores/assets/artifacts.partition.test.tsx',
    'lib/stores/assets/documents.partition.test.tsx',
    'lib/stores/assets/imageGen.partition.test.tsx',
    'lib/hooks/learning/useToc.deferred.test.tsx',
    'app/[subject]/[category]/[id]/page.transfer.test.tsx',
    'lib/hooks/chat/useStreamingText.test.tsx',
  ]);
} else {
  throw new Error('Usage: npm run perf:node | npm run perf:contracts');
}
