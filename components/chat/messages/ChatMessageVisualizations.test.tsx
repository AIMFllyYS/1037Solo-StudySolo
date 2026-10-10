import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessageVisualizations, vennShare } from './ChatMessageVisualizations';

describe('vennShare', () => {
  it('0–1 原样，百分数除以 100', () => {
    expect(vennShare(0.4)).toBe(0.4);
    expect(vennShare(30)).toBe(0.3);
    expect(vennShare('25')).toBe(0.25);
    expect(vennShare(undefined)).toBeUndefined();
  });
});

describe('ChatMessageVisualizations InteractiveVenn', () => {
  it('按 props 渲染自定义标签，百分数转成份额', () => {
    render(
      <ChatMessageVisualizations
        tagName="InteractiveVenn"
        props={{ a: 30, b: 25, ab: 10, aLabel: '线粒体', bLabel: '叶绿体', abLabel: '内共生' }}
        childrenText="集合A|集合B|交集"
      />,
    );
    expect(screen.getByText('线粒体')).toBeInTheDocument();
    expect(screen.getByText('叶绿体')).toBeInTheDocument();
    expect(screen.getByText('内共生')).toBeInTheDocument();
    expect(screen.getByText(/P\(A\)/)).toBeInTheDocument();
    expect(screen.getByText('0.30')).toBeInTheDocument();
  });
});
