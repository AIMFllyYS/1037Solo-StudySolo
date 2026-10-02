// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({availability:vi.fn(),search:vi.fn(),embedding:vi.fn()}))
vi.mock('@/lib/ai/search/searchService',()=>({localSearchAvailability:f.availability,searchLocalIndex:f.search,localVectorModel:()=> 'synthetic-model',localIndexBuiltAt:()=> 'fixture-built-at'}))
vi.mock('@/lib/ai/embedding',()=>({getQueryEmbeddingClient:()=>({embed:f.embedding})}))
import {hybridSearch} from './hybridSearch'
const previous=process.env.AI_SEARCH_MODE
beforeEach(()=>{vi.resetAllMocks();f.availability.mockReturnValue(true);f.search.mockResolvedValue([]);f.embedding.mockResolvedValue(Array(8).fill(0))})
afterEach(()=>{if(previous===undefined)delete process.env.AI_SEARCH_MODE;else process.env.AI_SEARCH_MODE=previous})
it('keyword search never opens the vector index or embedding client',async()=>{
  process.env.AI_SEARCH_MODE='keyword'
  expect(await hybridSearch('synthetic query')).toEqual([])
  expect(f.availability).toHaveBeenCalledExactlyOnceWith('keyword')
  expect(f.search).toHaveBeenCalledWith(expect.objectContaining({mode:'keyword'}))
  expect(f.search).not.toHaveBeenCalledWith(expect.objectContaining({mode:'vector'}))
  expect(f.embedding).not.toHaveBeenCalled()
})
it('vector search never opens BM25, including built-at diagnostics',async()=>{
  process.env.AI_SEARCH_MODE='vector'
  expect(await hybridSearch('synthetic query')).toEqual([])
  expect(f.availability).toHaveBeenCalledExactlyOnceWith('vector')
  expect(f.search).toHaveBeenCalledWith(expect.objectContaining({mode:'vector'}))
  expect(f.search).not.toHaveBeenCalledWith(expect.objectContaining({mode:'keyword'}))
})
