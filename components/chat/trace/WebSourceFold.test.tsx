import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import WebSourceFold from './WebSourceFold';

import { useWindowManager } from '@/lib/hooks/useWindowManager';

afterEach(() => {
  cleanup();
  useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
});

const sources = [
  { title: '大学课程资料', url: 'https://example.edu/course', snippet: '公开课程摘要不应该撑高折叠卡片' },
];

/** 走马灯卡与展开清单里都会出现标题——取 ul 里的那一颗。 */
function listRow(name: RegExp) {
  const row = screen.getAllByRole('button', { name }).find((el) => el.closest('ul'));
  if (!row) throw new Error('找不到展开清单里的来源行');
  return row;
}

describe('WebSourceFold', () => {
  it('走马灯常显：标题/host 进卡；展开清单后点行打开 Mac 来源预览', () => {
    render(<WebSourceFold sources={sources} cacheHit />);
    expect(screen.getByText(/联网来源 · 1 条 · 缓存/)).toBeVisible();
    // 走马灯卡始终渲染（序号 + host + 标题），清单仍默认收起。
    // （motion 入场动画中 opacity 是渐变的，所以这里断「在文档中」而不是「可见」。）
    const stripCard = screen.getAllByRole('button', { name: /大学课程资料/ })
      .find((el) => !el.closest('ul'));
    expect(stripCard).toBeTruthy();
    expect(screen.getByText('example.edu')).toBeInTheDocument();
    expect(screen.queryByText(/1\. 大学课程资料/)).not.toBeInTheDocument();
    expect(screen.queryByText(/公开课程摘要/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /联网来源 · 1 条/ }));
    expect(screen.getByText(/1\. 大学课程资料/)).toBeVisible();
    expect(screen.getByText('https://example.edu/course')).toBeVisible();
    fireEvent.click(listRow(/大学课程资料/));
    expect(useWindowManager.getState().windows.some((win) => win.type === 'source-trace-viewer')).toBe(true);
  });

  it('点走马灯卡展开详情：摘要 + 打开原页面 + 打开来源面板', async () => {
    render(<WebSourceFold sources={sources} />);
    const card = screen.getAllByRole('button', { name: /大学课程资料/ })[0];
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/公开课程摘要/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /打开原页面/ })).toHaveAttribute('href', 'https://example.edu/course');
    fireEvent.click(screen.getByRole('button', { name: /打开来源面板/ }));
    expect(useWindowManager.getState().windows.some((win) => win.type === 'source-trace-viewer')).toBe(true);
    // 再点一次同一张卡收起详情（退出动画结束后从 DOM 摘除）
    useWindowManager.setState({ windows: [], topZ: 5000, activeWindowId: null });
    fireEvent.click(screen.getAllByRole('button', { name: /大学课程资料/ })[0]);
    expect(screen.getAllByRole('button', { name: /大学课程资料/ })[0]).toHaveAttribute('aria-expanded', 'false');
    await waitForElementToBeRemoved(() => screen.queryByText(/公开课程摘要/), { timeout: 1500 });
  });

  it('live 态：标题换「正在搜索」，骨架卡占位，供应商脉冲点', () => {
    render(
      <WebSourceFold
        sources={[]}
        live
        chips={[
          { provider: 'kimi', state: 'running' },
          { provider: 'zhipu', state: 'running' },
        ]}
      />,
    );
    expect(screen.getByText(/正在搜索 Kimi · 智谱/)).toBeVisible();
    expect(document.querySelectorAll('.web-source-card.is-skeleton')).toHaveLength(3);
    expect(document.querySelectorAll('.web-search-chip[data-state="running"]')).toHaveLength(2);
  });

  it('失败态：灰态标题 + 原因文案', () => {
    render(<WebSourceFold sources={[]} errorText="upstream 503" />);
    expect(screen.getByText('搜索失败')).toBeVisible();
    expect(screen.getByText('upstream 503')).toBeVisible();
  });

  it('dedupes sources by url', () => {
    render(
      <WebSourceFold
        sources={[
          { title: '大学课程资料', url: 'https://example.edu/course', snippet: '' },
          { title: '重复', url: 'https://example.edu/course', snippet: '' },
          { title: '另一篇', url: 'https://example.edu/other', snippet: '' },
        ]}
      />,
    );
    expect(screen.getByText(/联网来源 · 2 条/)).toBeVisible();
  });

  it("keeps unique list keys when several sources have no url", () => {
    render(
      <WebSourceFold
        sources={[
          { title: "空链接甲", url: "", snippet: "" },
          { title: "空链接乙", url: "", snippet: "" },
          { title: "有地址", url: "https://example.edu/ok", snippet: "" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /联网来源 · 3 条/ }));
    expect(screen.getByText(/1\. 空链接甲/)).toBeVisible();
    expect(screen.getByText(/2\. 空链接乙/)).toBeVisible();
    expect(screen.getByText(/3\. 有地址/)).toBeVisible();
    // 走马灯卡 + 清单行各出现一次「暂无链接」
    expect(screen.getAllByText("暂无链接").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("https://example.edu/ok")).toBeVisible();
  });
});
