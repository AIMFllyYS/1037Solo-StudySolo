import { jsonSchema, tool } from "ai";
import { kitSoloBase } from "@/lib/plugins/kitsolo-oauth-client";
import { callKitSolo, kitSoloInputSchema, type KitSoloInput } from "@/lib/plugins/kitsolo-rpc";
export function createKitSoloTool(accessToken: string) {
  return tool({ description: "使用用户已关联的 KitSolo 工具箱。先 action=search 检索任务，返回 aiCallable、mcpName、inputSchema 和工作台链接。aiCallable=true 时 action=call 按 schema 执行；否则 action=open 返回入口，交给用户操作。工具输入会发往 KitSolo。不要声称已经打开或操作用户浏览器。", inputSchema: jsonSchema<KitSoloInput>(kitSoloInputSchema), execute: (input, { abortSignal }) => callKitSolo(kitSoloBase(), accessToken, input, abortSignal), toModelOutput: ({ output }) => ({ type: "text", value: output.text.slice(0, 12000) }) });
}
