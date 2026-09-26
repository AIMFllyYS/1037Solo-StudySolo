import { notFound } from 'next/navigation';
import AgentAssetDetail from '@/components/agent/AgentAssetDetail';
import { parseAssetKind } from '@/lib/agent/assetHref';
export const metadata = { title: '我的云端资产 · StudySolo', robots: { index: false, follow: false } };
/** Query values support original client IDs without treating slashes/dots as URL path segments. */
export default async function OpenAsset({searchParams}:{searchParams:Promise<{kind?:string;id?:string}>}) {
  const {kind,id}=await searchParams;
  const parsed=typeof kind==='string'?parseAssetKind(kind):null;
  if(!parsed||!['note','flashcard','document','artifact'].includes(parsed)||typeof id!=='string'||!id||id.length>200)notFound();
  return <AgentAssetDetail kind={parsed} id={id}/>;
}
