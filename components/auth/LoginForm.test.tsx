import {beforeEach,describe,expect,it,vi} from "vitest";
import {render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "./LoginForm";
import {redirectAccount} from "@/lib/auth/account";
const fixture=vi.hoisted(()=>({params:new URLSearchParams()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>fixture.params}));
vi.mock("@/lib/auth/account",()=>({redirectAccount:vi.fn()}));
beforeEach(()=>{fixture.params=new URLSearchParams();vi.clearAllMocks();});
describe("unified Account login",()=>{
 it("never collects credentials or sends a standalone login",()=>{render(<LoginForm/>);expect(screen.getByRole("heading",{name:"使用 1037Solo 统一账号"})).toBeInTheDocument();expect(screen.queryByLabelText("邮箱")).toBeNull();expect(screen.queryByLabelText("密码")).toBeNull();expect(redirectAccount).not.toHaveBeenCalled();});
 it.each([["登录并继续","login"],["创建账号","register"],["找回密码","forgot-password"]])("routes %s to canonical Account",async(label,action)=>{render(<LoginForm/>);await userEvent.click(screen.getByRole("button",{name:label}));expect(redirectAccount).toHaveBeenCalledWith(action);});
 it("does not reflect an upstream error query into markup",()=>{fixture.params.set("error","sensitive-upstream-detail");render(<LoginForm/>);expect(screen.getByRole("alert")).toHaveTextContent("登录授权未完成");expect(screen.queryByText("sensitive-upstream-detail")).toBeNull();});
});
