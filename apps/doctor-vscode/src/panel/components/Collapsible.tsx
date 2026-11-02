import React, { useState } from 'react';
import { ChevronIcon } from './Icons';
import { getUiState, setUiState } from './vscode';

interface Props {
  /** Unique key used to persist the collapsed/expanded state across reloads. */
  stateKey: string;
  title: string;
  /** Optional trailing badge, e.g. a field count. */
  badge?: React.ReactNode;
  defaultExpanded?: boolean;
  /** 'card' (default) is used for top-level Page/Metadata sections — a
   *  solid rounded card with a filled header. 'inset' is used for a
   *  structured field's own sub-fields (e.g. header/partials) nested inside
   *  a card — a lighter dashed box that reads as "part of the field above"
   *  rather than a sibling section. */
  variant?: 'card' | 'inset';
  children: React.ReactNode;
}

/**
 * A collapsible section with a persistent (per-`stateKey`) expand/collapse
 * state, used both for the top-level Page/Metadata groups and for grouping
 * a structured field's own sub-fields (e.g. all of `header`'s properties).
 */
export const Collapsible: React.FC<Props> = ({ stateKey, title, badge, defaultExpanded = true, variant = 'card', children }) => {
  const [expanded, setExpanded] = useState(() => !getUiState(`collapsed:${stateKey}`, !defaultExpanded));

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      setUiState(`collapsed:${stateKey}`, !next);
      return next;
    });
  };

  const isInset = variant === 'inset';

  return (
    <div style={isInset ? styles.insetContainer : styles.cardContainer}>
      <button
        type="button"
        style={isInset ? styles.insetHeader : styles.cardHeader}
        onClick={toggle}
        aria-expanded={expanded}
      >
        <ChevronIcon expanded={expanded} />
        <span style={isInset ? styles.insetTitle : styles.cardTitle}>{title}</span>
        {badge !== undefined && <span style={styles.badge}>{badge}</span>}
      </button>
      {expanded && <div style={isInset ? styles.insetContent : styles.cardContent}>{children}</div>}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  cardContainer: {
    display: 'flex',
    flexDirection: 'column',
    margin: '10px 12px',
    border: '1px solid var(--vscode-widget-border)',
    borderRadius: '6px',
    overflow: 'hidden',
    background: 'rgba(128, 128, 128, 0.04)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '9px 12px',
    background: 'var(--vscode-sideBarSectionHeader-background)',
    border: 'none',
    color: 'var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground))',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  cardTitle: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    opacity: 0.9,
  },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  insetContainer: {
    display: 'flex',
    flexDirection: 'column',
    margin: '10px 14px 14px',
    border: '1px dashed var(--vscode-widget-border)',
    borderRadius: '5px',
  },
  insetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    border: 'none',
    color: 'var(--vscode-foreground)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  insetTitle: {
    fontSize: '10px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    opacity: 0.7,
  },
  insetContent: {
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: '4px',
  },
  badge: {
    marginLeft: 'auto',
    fontSize: '10px',
    opacity: 0.6,
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 'normal',
    background: 'rgba(128, 128, 128, 0.15)',
    padding: '1px 7px',
    borderRadius: '8px',
  },
};
