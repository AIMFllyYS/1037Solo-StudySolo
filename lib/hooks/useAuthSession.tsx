"use client";

import {getStorageOwner,activateStorageOwner,hydrateOwnerStores} from "@/lib/storage/ownerScope";
import {flushPendingWrites} from "@/lib/storage/idbStorage";
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { restoreAccountSession, logoutAccount, redirectAccount } from "@/lib/auth/account";
import { tryGetBrowserAuthClient } from "@/lib/auth/browserClient";
import {
  type AuthOtpClient,
  type OtpRequestResult,
  type OtpVerifyResult,
} from "@/lib/auth/otp";
import {
  type AuthPasswordClient,
  type PasswordAuthResult,
  type PasswordMailResult,
} from "@/lib/auth/password";
import { installAiAuthFetch } from "@/lib/auth/installAiAuthFetch";
import { sessionAccessToken } from "@/lib/auth/sessionCookie";
import {
  readPersistedSession,
  subscribeAuthSession,
  type AuthSession,
  type AuthSessionClient,
} from "@/lib/auth/session";
import { scheduleCloudPull, setCloudSyncEnabled } from "@/lib/sync/schedule";

export type AuthRuntimeClient = {
  auth: AuthOtpClient["auth"] & AuthSessionClient["auth"] & Partial<AuthPasswordClient["auth"]>;
};

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export interface AuthSessionApi {
  status: AuthStatus;
  session: AuthSession | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  userId: string | null;
  needsNewPassword: boolean;
  requestOtp: (email: string, opts?: { shouldCreateUser?: boolean }) => Promise<OtpRequestResult>;
  verifyOtp: (email: string, token: string) => Promise<OtpVerifyResult>;
  signInWithPassword: (email: string, password: string) => Promise<PasswordAuthResult>;
  signUpWithPassword: (
    email: string,
    password: string,
    confirm: string,
  ) => Promise<PasswordAuthResult | PasswordMailResult>;
  requestPasswordReset: (email: string) => Promise<PasswordMailResult>;
  updatePassword: (password: string, confirm: string) => Promise<PasswordMailResult>;
  signOut: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSessionApi | null>(null);

export function useAuthSessionController(injected?: AuthRuntimeClient | null): AuthSessionApi {
  const [client] = useState<AuthRuntimeClient | null>(() => injected !== undefined ? injected : tryGetBrowserAuthClient());
  const [status,setStatus]=useState<AuthStatus>("loading");
  const [session,setSession]=useState<AuthSession|null>(null);
  useEffect(()=>{
    let active=true;
    let revision=0;
    const apply=(next:AuthSession|null)=>{if(active){setSession(next);setStatus(next?"signedIn":"signedOut");}};
    const restore=async()=>{const started=revision;try{const next=injected!==undefined && client ? await readPersistedSession(client) : await restoreAccountSession();if(started===revision)apply(next);}catch{if(active&&started===revision)setStatus(current=>current==="loading"?"signedOut":current);}};
    const unsubscribe=client?subscribeAuthSession(client,(next,event)=>{if(event==='INITIAL_SESSION'&&revision>0)return;revision++;apply(next);}):()=>{};
    void restore();
    const focus=()=>{if(document.visibilityState!=="hidden")void restore();};
    const timer=setInterval(()=>void restore(),300000);
    window.addEventListener("focus",focus);
    return ()=>{active=false;clearInterval(timer);unsubscribe();window.removeEventListener("focus",focus);};
  },[client,injected]);
  const redirectResult=(action:Parameters<typeof redirectAccount>[0])=>{
    redirectAccount(action);return {ok:false as const,code:"auth_error" as const,message:"请在统一账号中心完成操作"};
  };
  return {
    status,session,email:session?.user.email??null,displayName:session?.user.displayName??null,
    avatarUrl:session?.user.avatarUrl??null,userId:session?.user.id??null,needsNewPassword:false,
    requestOtp:async()=>redirectResult("login"),verifyOtp:async()=>redirectResult("login"),
    signInWithPassword:async()=>redirectResult("login"),signUpWithPassword:async()=>redirectResult("register"),
    requestPasswordReset:async()=>redirectResult("forgot-password"),updatePassword:async()=>redirectResult("update-password"),
    signOut:async()=>{await logoutAccount();setSession(null);setStatus("signedOut");},
  };
}

function useInstallAiAuthFetch(authClient: AuthSessionClient | null) {
  useLayoutEffect(() => {
    if (!authClient) return;
    return installAiAuthFetch(async () => {
      const { data } = await authClient.auth.getSession();
      return sessionAccessToken(data.session);
    });
  }, [authClient]);
}

function useCloudSyncOnAuth(status: AuthStatus, userId: string | null) {
  useEffect(() => {
    if (status === "signedIn" && userId) {
      setCloudSyncEnabled(true);
      scheduleCloudPull();
      return;
    }
    setCloudSyncEnabled(false);
  }, [status, userId]);
}

export function AuthProvider({
  children,
  client,
}: {
  children: ReactNode;
  client?: AuthRuntimeClient | null;
}) {
  const value = useAuthSessionController(client);
  const fetchClient = client !== undefined ? client : tryGetBrowserAuthClient();
  useInstallAiAuthFetch(fetchClient);
  const [readyOwner,setReadyOwner]=useState<string|null|undefined>(undefined);
  useEffect(()=>{
    if(value.status==="loading")return;
    setCloudSyncEnabled(false);
    const previous=getStorageOwner();
    if(previous&&previous!==value.userId){flushPendingWrites();window.location.reload();return;}
    activateStorageOwner(value.userId);
    let active=true;
    void hydrateOwnerStores().then(()=>{if(active)setReadyOwner(value.userId);});
    return()=>{active=false;};
  },[value.status,value.userId]);
  const ready=value.status!=="loading"&&readyOwner===value.userId;
  useCloudSyncOnAuth(ready?value.status:"loading",ready?value.userId:null);
  return <AuthSessionContext.Provider value={value}>{ready?children:<div className="p-8 text-sm">正在打开账号专属学习空间…</div>}</AuthSessionContext.Provider>;

}

const UNAVAILABLE={ok:false as const,code:"auth_error" as const,message:"请在统一账号中心登录"};

const FALLBACK: AuthSessionApi = {
  status: "signedOut",
  session: null,
  email: null,
  displayName: null,
  avatarUrl: null,
  userId: null,
  needsNewPassword: false,
  requestOtp: async () => UNAVAILABLE,
  verifyOtp: async () => ({ ...UNAVAILABLE }),
  signInWithPassword: async () => ({ ...UNAVAILABLE }),
  signUpWithPassword: async () => ({ ...UNAVAILABLE }),
  requestPasswordReset: async () => ({ ...UNAVAILABLE }),
  updatePassword: async () => ({ ...UNAVAILABLE }),
  signOut: async () => {},
};

export function useAuthSession(): AuthSessionApi {
  return useContext(AuthSessionContext) ?? FALLBACK;
}
