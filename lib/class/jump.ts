/**
 * 从 Agent 引用跳回课堂文稿的某一段。
 *
 * 引用渲染在通用聊天层（lib/chat），课堂工作台在 classolo/ 里；两边只通过这个事件
 * 解耦：在 /class 页就交给工作台（必要时先打开那节课再滚动），不在就整页跳过去。
 */
export const CLASS_JUMP_EVENT = "studysolo:class-jump";

export interface ClassJumpDetail {
  sessionId: string;
  segmentId: string;
}

export function classSegmentHref({ sessionId, segmentId }: ClassJumpDetail): string {
  const params = new URLSearchParams({ session: sessionId, segment: segmentId });
  return `/class?${params.toString()}`;
}

export function openClassSegment(detail: ClassJumpDetail): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/class") {
    window.dispatchEvent(new CustomEvent<ClassJumpDetail>(CLASS_JUMP_EVENT, { detail }));
    return;
  }
  window.location.assign(classSegmentHref(detail));
}
