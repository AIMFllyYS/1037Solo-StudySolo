import { ASSET_KINDS, type AssetKind } from "./assetCatalog";

/** 资产详情路由：/agent/assets/{kind}/{id}。非法 kind 返回 null（路由层 notFound）。 */
export function assetHref(kind: AssetKind, id: string): string {
  if(kind==="classroom")return `/class?session=${encodeURIComponent(id)}`;
  return `/agent/assets/${kind}/${encodeURIComponent(id)}`;
}

export function parseAssetKind(segment: string): AssetKind | null {
  return (ASSET_KINDS as readonly string[]).includes(segment) ? (segment as AssetKind) : null;
}

export const ASSET_LIST_HREF = "/agent/assets";