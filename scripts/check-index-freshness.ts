import { verifyIndexContentFreshness } from "../lib/ai/search/indexHealth";

const fresh = verifyIndexContentFreshness();
if (fresh === null) {
  console.error("search-index: deep content check unavailable; inspect manifest and content inputs");
  process.exitCode = 1;
} else if (!fresh) {
  console.error("search-index: contentHash differs from current searchable content; rebuild the index before release");
  process.exitCode = 1;
} else {
  console.log("search-index: deep content hash matches the runtime manifest");
}
