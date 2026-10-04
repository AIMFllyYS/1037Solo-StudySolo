'use client';

import React from 'react';
import { BookOpen, GitMerge, Lightbulb } from 'lucide-react';
import NewChatSuggestions from '@/components/chat/NewChatSuggestions';
import { QUICK_PROMPTS } from '@/lib/constants/prompts';
import PencilSparklesIcon from '@/components/icons/PencilSparklesIcon';

interface ChatEmptyStateProps {
  topic: string;
  subjectName: string;
  onFollowUpClick: (question: string) => void;
}

const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({
  topic,
  subjectName,
  onFollowUpClick,
}) => {
  return (
    <div className="chat-empty-state animate-fade-up">
      <div className="chat-empty-icon">
        <PencilSparklesIcon size={24} style={{ color: 'var(--md-sys-color-primary)' }} />
      </div>
      <p className="chat-empty-title">我是你的{subjectName}助教</p>
      <p className="chat-empty-desc">
        遇到不懂的概念随时问我，我可以解释公式、出题练习、或者帮你梳理知识点
      </p>
      {topic && (
        <div className="chat-empty-topic">
          当前学习: {topic}
        </div>
      )}
      <div className="chat-empty-prompts">
        <NewChatSuggestions
          label="试试这样问我"
          className="chat-welcome-examples--compact"
          items={QUICK_PROMPTS.map((prompt, index) => ({ id: prompt.icon, text: prompt.text, icon: [<Lightbulb key="concept" size={15} />, <BookOpen key="quiz" size={15} />, <GitMerge key="formula" size={15} />][index] }))}
          onSelect={onFollowUpClick}
        />
      </div>
    </div>
  );
};

export default ChatEmptyState;
