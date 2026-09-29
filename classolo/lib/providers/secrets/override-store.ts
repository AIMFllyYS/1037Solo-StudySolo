import type {SecretKind} from './types';
export const USER_SECRET_STORAGE_KEY='classolo:server-managed';
export const USER_SECRET_BACKEND='server' as const;
export const USER_SECRET_WRITES_TO_PGLITE=false as const;
export interface SecretOverrideBackend {readonly name:'sessionStorage'|'safeStorage';read:()=>string|null;write:(serialized:string)=>void}
export interface ProviderCredentialRef {kind:SecretKind;credentialRef:string;hasCredential:boolean}
/** Provider secrets are owned by the server. Legacy settings cannot persist them. */
export function setUserSecretOverride(_kind:SecretKind,_value:string|null){void _kind;void _value;}
export function getUserSecretOverride(_kind:SecretKind):string|null{void _kind;return null;}
export function clearAllUserSecretOverrides(){}
export function getProviderCredentialRef(kind:SecretKind):ProviderCredentialRef{return {kind,credentialRef:'server-managed',hasCredential:false};}
export function getProviderCredentialRefs():readonly ProviderCredentialRef[]{return (['ai','asr','image-search'] as const).map(getProviderCredentialRef);}
export function createElectronSafeStorageBackend():SecretOverrideBackend{throw new Error('课堂服务密钥由统一服务端管理');}
