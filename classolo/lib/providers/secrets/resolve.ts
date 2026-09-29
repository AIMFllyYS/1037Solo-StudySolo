import type { ResolvedSecret,SecretKind } from './types';
/** Capability marker only: never a provider credential. Network adapters target same-origin servers. */
export function resolveSecret(kind:SecretKind,_userOverride?:string|null):ResolvedSecret {
  void _userOverride; return {kind,value:'session-transport',source:'none'};
}
