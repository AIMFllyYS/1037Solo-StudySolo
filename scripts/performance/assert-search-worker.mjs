import {access,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const root=resolve('runtime/search-worker')
for(const path of ['search/worker/index.mjs','search/worker/core.mjs','indexing/bm25Index.js'])await access(resolve(root,path))
await mkdir(root,{recursive:true})
await writeFile(resolve(root,'package.json'),'{"type":"module"}\n')
process.stdout.write('search-worker: compiled entry and shared codec present\n')
