"use client";

import { createElement, type ComponentType } from "react";

const registry: Record<string, ComponentType> = {};

function key(subjectId: string, categoryId: string, itemId: string): string {
  return `${subjectId}/${categoryId}/${itemId}`;
}

export function getComponent(
  subjectId: string,
  categoryId: string,
  itemId: string,
): ComponentType | null {
  return registry[key(subjectId, categoryId, itemId)] ?? null;
}

export function ComponentRenderer({
  subjectId,
  categoryId,
  itemId,
}: {
  subjectId: string;
  categoryId: string;
  itemId: string;
}) {
  const Comp = getComponent(subjectId, categoryId, itemId);
  if (!Comp) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] p-8 text-center">
        <h3 className="text-[16px] font-semibold">组件未注册</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-[var(--ink-soft)]">
          {`${subjectId}/${categoryId}/${itemId}`} 对应的组件尚未在 componentRegistry 中注册。
        </p>
      </div>
    );
  }
  return createElement(Comp);
}
