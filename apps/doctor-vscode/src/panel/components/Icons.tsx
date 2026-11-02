import React from 'react';

/**
 * Small inline SVG icons, styled with `currentColor` so they inherit the
 * surrounding text color and work with VS Code theme variables out of the
 * box. We use plain SVG rather than the `$(codicon)` placeholder syntax —
 * that syntax is only special-cased by native VS Code UI (QuickPick,
 * StatusBarItem, TreeView labels, etc.), and renders as literal text like
 * "$(tag)" inside a webview's HTML, which is what made the pick buttons look
 * broken.
 */

const baseProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 16 16',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
} as const;

export const TagIcon: React.FC = () => (
  <svg {...baseProps}>
    <path
      d="M7.06 2H3a1 1 0 0 0-1 1v4.06a1 1 0 0 0 .29.7l6 6a1 1 0 0 0 1.42 0l4.35-4.35a1 1 0 0 0 0-1.42l-6-6A1 1 0 0 0 7.06 2Z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <circle cx="4.75" cy="4.75" r="0.9" fill="currentColor" />
  </svg>
);

export const PersonIcon: React.FC = () => (
  <svg {...baseProps}>
    <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M2.75 13.25c0-2.6 2.35-4.25 5.25-4.25s5.25 1.65 5.25 4.25"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export const ChevronIcon: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    style={{
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.1s ease',
      flexShrink: 0,
    }}
  >
    <path d="M5 3.5 10 8l-5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SpinnerIcon: React.FC = () => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    style={{ animation: 'doctor-metadata-spin 0.8s linear infinite' }}
  >
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.8" />
    <path d="M14.25 8a6.25 6.25 0 0 0-6.25-6.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const RefreshIcon: React.FC = () => (
  <svg {...baseProps}>
    <path
      d="M13 8a5 5 0 1 1-1.55-3.62"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <path d="M13 2.5v3.2h-3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
