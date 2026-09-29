"use client";
import {useSearchParams} from "next/navigation";
import { redirectAccount } from "@/lib/auth/account";
export default function LoginForm() {
  const params=useSearchParams();const error=params?.get("error");
  return <section className="space-y-5 p-6">{error&&<p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">{error==="mfa_required"?"请先在统一账号中心完成两步验证，再重新授权此应用。":"登录授权未完成，请重新开始。"}</p>}<h2 className="text-xl font-semibold">使用 1037Solo 统一账号</h2><p className="text-sm text-[var(--ink-soft)]">一个账号连接 StudySolo、StudyFlow 和整个生态。邮箱登录、Google、GitHub、密码找回及两步验证均在账号中心完成。</p><button type="button" className="w-full rounded-xl bg-[var(--md-sys-color-primary)] px-4 py-3 text-white" onClick={()=>redirectAccount("login")}>登录并继续</button><div className="flex justify-between text-sm"><button onClick={()=>redirectAccount("register")}>创建账号</button><button onClick={()=>redirectAccount("forgot-password")}>找回密码</button></div></section>;
}
