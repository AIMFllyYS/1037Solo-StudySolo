import { afterEach, expect, it, vi } from 'vitest';
import { activateStorageOwner } from '@/lib/storage/ownerScope';
import { freezeGeneratedImages } from './freezeImages';
afterEach(()=>{activateStorageOwner(null);vi.unstubAllGlobals();});
it('freezes provider URL results into local bytes before marking a generation complete',async()=>{
  activateStorageOwner('image-owner');
  const request=vi.fn(async(_input: RequestInfo | URL)=>Response.json({b64_json:'frozen-original'}));vi.stubGlobal('fetch',request);
  expect(await freezeGeneratedImages([{url:'https://provider.invalid/temporary',revised_prompt:'prompt'}])).toEqual([{b64_json:'frozen-original',revised_prompt:'prompt'}]);
  expect(request.mock.calls[0]?.[0]).toBe('/api/assets/capture-image');
});
it('base64 outputs do not need a second network fetch',async()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);
  expect(await freezeGeneratedImages([{b64_json:'original',url:'https://expired.invalid'}])).toEqual([{b64_json:'original',revised_prompt:undefined}]);
  expect(request).not.toHaveBeenCalled();
});
