/** Prepare the manual browser collector without launching a browser or dev server. */
import {copyFile,mkdir} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
const output=resolve('artifacts/performance/manual-browser-collector.js')
await mkdir(dirname(output),{recursive:true})
await copyFile(resolve(here,'browser-collector.js'),output)
process.stdout.write(`Collector prepared: ${output}\nPaste its source into DevTools before the scenario. Use __ssPerfCollector.sample('label') after each step, __ssPerfCollector.export() at the end, then __ssPerfCollector.dispose(). Browser execution is intentionally not performed by this script.\n`)
