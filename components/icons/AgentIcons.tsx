import type { SVGProps } from 'react';

export interface AgentIconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Original 20-unit outline glyphs for the assistant. No icon-font or vendor art. */
function IconFrame({ size = 18, children, ...props }: AgentIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Two offset open loops, deliberately distinct from any provider's logo. */
export function AgentLoopIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="loop"><path d="M12.8 5.4a4.5 4.5 0 1 0-6.5 6.1l2.1 1.4a2.8 2.8 0 0 0 3.8-4" /><path d="M7.2 14.6a4.5 4.5 0 1 0 6.5-6.1l-2.1-1.4a2.8 2.8 0 0 0-3.8 4" /></IconFrame>;
}

export function AgentFileIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="file"><path d="M11.5 2.5H5a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 5 17.5h10a1.5 1.5 0 0 0 1.5-1.5V7.5z" /><path d="M11.5 2.5v5h5M6.5 10.5h7M6.5 13.5h5" /></IconFrame>;
}

export function AgentTerminalIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="terminal"><rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><path d="m6 7.2 2.6 2.6L6 12.4m5.2.1H14" /></IconFrame>;
}

export function AgentSearchIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="search"><circle cx="8.7" cy="8.7" r="5.7" /><path d="m13 13 4 4" /></IconFrame>;
}

export function AgentImageIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="image"><rect x="2.5" y="3" width="15" height="14" rx="2.5" /><circle cx="12.8" cy="7" r="1.2" /><path d="m3 13 4.2-4.2 4.1 4.1 2.3-2.3 3.6 3.6" /></IconFrame>;
}

export function AgentGlobeIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="globe"><circle cx="10" cy="10" r="7.2" /><ellipse cx="10" cy="10" rx="3.2" ry="7.2" /><path d="M3 10h14" /></IconFrame>;
}

export function AgentChevronIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="chevron"><path d="m6 8 4 4 4-4" /></IconFrame>;
}

export function AgentCheckIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="check"><path d="m4 10 4 4 8-8" /></IconFrame>;
}

export function AgentPauseIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="pause"><path d="M7 4.5v11M13 4.5v11" /></IconFrame>;
}

export function AgentAlertIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="alert"><circle cx="10" cy="10" r="7.2" /><path d="M10 5.8v4.7M10 13.8h.01" /></IconFrame>;
}

export function AgentInfoIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="info"><circle cx="10" cy="10" r="7.2" /><path d="M10 9v5.2M10 5.8h.01" /></IconFrame>;
}

export function AgentQuoteIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="quote"><path d="M8.2 5.3C5.7 6.2 4 8.2 4 11v3.7h4.7V10H4m12.2-4.7C13.7 6.2 12 8.2 12 11v3.7h4.7V10H12" /></IconFrame>;
}

export function AgentUserIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="user"><circle cx="10" cy="6.2" r="3" /><path d="M4.3 16.6v-1.1a5.7 5.7 0 0 1 11.4 0v1.1" /></IconFrame>;
}

export function AgentArrowUpIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="arrow-up"><path d="M10 16V4m-5 5 5-5 5 5" /></IconFrame>;
}

export function AgentArrowUpRightIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="arrow-up-right"><path d="M5.5 14.5 14.5 5.5m-8 0h8v8" /></IconFrame>;
}

export function AgentStopIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="stop"><rect x="5" y="5" width="10" height="10" rx="1.3" fill="currentColor" stroke="none" /></IconFrame>;
}

export function AgentPlusIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="plus"><path d="M10 4v12M4 10h12" /></IconFrame>;
}

export function AgentCloseIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="close"><path d="m5.5 5.5 9 9m0-9-9 9" /></IconFrame>;
}

export function AgentSettingsIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="settings"><path d="M3 5.5h3m4 0h7M3 14.5h7m4 0h3" /><circle cx="8" cy="5.5" r="2" /><circle cx="12" cy="14.5" r="2" /></IconFrame>;
}

export function AgentHistoryIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="history"><path d="M3.2 7.2A7 7 0 1 1 3 12M3 3v4.5h4.5M10 5.8v4.6l3 1.9" /></IconFrame>;
}

/** Right-edge panel with a close chevron: collapse the Agent column. */
export function AgentPanelCloseIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="panel-close"><rect x="2.6" y="3.2" width="14.8" height="13.6" rx="2.2" /><path d="M13.4 3.2v13.6M8.8 7.2 6.2 10l2.6 2.8" /></IconFrame>;
}

/** Clipboard with a ticked option row: quiz / structured questions. */
export function AgentQuizIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="quiz"><rect x="3.5" y="3.5" width="13" height="14" rx="2.2" /><path d="M7.5 2.5h5v2.4h-5z" /><path d="m6.3 9.4 1.2 1.2 2.1-2.3M11.5 9.8h2.4" /><path d="m6.3 13.6 1.2 1.2 2.1-2.3M11.5 14h2.4" /></IconFrame>;
}

/** Long page with a ruled body and a folded corner: document writing. */
export function AgentDocumentIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="document"><path d="M12 2.5H5.5A1.5 1.5 0 0 0 4 4v12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 16V6.5z" /><path d="M12 2.5v4h4" /><path d="M6.6 8.6h3M6.6 11.2h6.8M6.6 13.8h6.8" /></IconFrame>;
}

/** Two stacked frames: image gallery / figures already in the notes. */
export function AgentGalleryIcon(props: AgentIconProps) {
  return <IconFrame {...props} data-agent-icon="gallery"><rect x="2.5" y="5.5" width="12" height="11" rx="2" /><path d="M6 2.5h9.5A2 2 0 0 1 17.5 4.5v9" /><circle cx="6.3" cy="9" r="1.1" /><path d="m3 14 3.4-3.2 3 2.9 1.8-1.7 3.3 3.2" /></IconFrame>;
}
