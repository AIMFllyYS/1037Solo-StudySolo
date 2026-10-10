// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest'
import {chunkMetadataIo,getChunkMetadataIndex,resetChunkMetadataForTests} from './indexes/indexIo'

afterEach(()=>{vi.restoreAllMocks();resetChunkMetadataForTests()})
it('shares one parsed metadata index until the file revision changes',()=>{
  let version=1
  const read=vi.spyOn(chunkMetadataIo,'read').mockImplementation(()=>Buffer.from(JSON.stringify({chunks:[{id:'synthetic',path:'physics/detail/one',subjectId:'physics',subjectName:'Physics',categoryId:'detail',itemId:'one',title:'One',chunkIndex:0,text:'synthetic'}]})))
  vi.spyOn(chunkMetadataIo,'stat').mockImplementation(()=>({size:version,mtimeMs:version}) as ReturnType<typeof chunkMetadataIo.stat>)
  resetChunkMetadataForTests()
  const first=getChunkMetadataIndex(),second=getChunkMetadataIndex()
  expect(second).toBe(first)
  expect(read).toHaveBeenCalledTimes(1)
  expect(first.byId.get('synthetic')).toBe(first.rows[0])
  version=2
  expect(getChunkMetadataIndex()).not.toBe(first)
  expect(read).toHaveBeenCalledTimes(2)
})
