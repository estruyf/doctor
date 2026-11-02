import React, { useEffect, useState } from 'react';
import { ExtensionMessage, FieldState, NotReadyReason, SharePointStatus } from '../messages';
import { sendMessage } from './vscode';
import { FieldRow } from './FieldRow';
import { Collapsible } from './Collapsible';
import { SpinnerIcon, RefreshIcon } from './Icons';

const NOT_READY_MESSAGES: Record<NotReadyReason, string> = {
  'no-editor': 'Open a markdown file to see its metadata.',
  'not-markdown': 'Open a markdown file to see its metadata.',
  'not-doctor-project':
    'This file is not inside a doctor.json project. Doctor only activates for files under a folder that has a doctor.json.',
  'no-front-matter': 'This file has no front matter yet.',
};

const SHAREPOINT_STATUS_MESSAGES: Record<Exclude<SharePointStatus, 'ready'>, string> = {
  'not-configured':
    'SharePoint is not configured. Add certificate auth settings to doctor.json (or run "Doctor: Configure Fallback Sign-in").',
  'error': 'SharePoint is unavailable. Check the notifications/Debug Console for details.',
};

function formatSiteUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    return `${url.host}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return siteUrl;
  }
}

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [notReadyReason, setNotReadyReason] = useState<NotReadyReason>('no-editor');
  const [fileName, setFileName] = useState('');
  const [fileUri, setFileUri] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [fields, setFields] = useState<FieldState[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [sharePointStatus, setSharePointStatus] = useState<SharePointStatus>('ready');
  const [sharePointMessage, setSharePointMessage] = useState<string | undefined>();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg: ExtensionMessage = event.data;
      switch (msg.command) {
        case 'loading':
          setLoading(msg.payload);
          break;
        case 'metadata':
          setFields(msg.payload.fields);
          setFileName(msg.payload.fileName);
          setFileUri(msg.payload.fileUri);
          setSiteUrl(msg.payload.siteUrl ?? '');
          setSchemaLoading(msg.payload.schemaLoading);
          setBackgroundSyncing(msg.payload.backgroundSyncing);
          setSharePointStatus(msg.payload.sharePointStatus);
          setSharePointMessage(msg.payload.sharePointMessage);
          setLoading(false);
          setReady(true);
          break;
        case 'notReady':
          setLoading(false);
          setReady(false);
          setFields([]);
          setFileUri('');
          setSiteUrl('');
          setNotReadyReason(msg.reason ?? 'no-editor');
          break;
      }
    };
    window.addEventListener('message', handler);
    sendMessage({ command: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  if (loading) {
    return <div style={styles.center}><span style={styles.muted}>Loading…</span></div>;
  }

  if (!ready) {
    return (
      <div style={styles.center}>
        <span style={styles.muted}>{NOT_READY_MESSAGES[notReadyReason]}</span>
      </div>
    );
  }

  const pageFields = fields.filter((f) => f.group === 'page');
  const metadataFields = fields.filter((f) => f.group === 'metadata');
  const sharePointNotice = sharePointStatus !== 'ready'
    ? (sharePointMessage || SHAREPOINT_STATUS_MESSAGES[sharePointStatus])
    : undefined;
  const syncing = schemaLoading || backgroundSyncing;

  // Every outgoing message is tagged with the fileUri this panel snapshot was
  // built from, so the extension always writes to the file the field actually
  // belongs to — even if the user has since switched to a different tab.
  const makeHandler = (field: FieldState) => ({
    onChange: (value: any) => sendMessage({ command: 'updateField', field: field.internalName, value, group: field.group, fileUri }),
    onPickTerm: () => sendMessage({ command: 'pickTerm', field: field.internalName, fileUri, group: field.group }),
    onPickUser: () => sendMessage({ command: 'pickUser', field: field.internalName, fileUri, group: field.group }),
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerText}>
          <span style={styles.fileName}>{fileName}</span>
          {siteUrl && (
            <span style={styles.siteIndicator} title={`SharePoint data source: ${siteUrl}`}>
              Data source: {formatSiteUrl(siteUrl)}
            </span>
          )}
        </div>
        {syncing && (
          <span style={styles.syncingBadge} title={backgroundSyncing ? 'Refreshing SharePoint data…' : 'Syncing SharePoint field metadata…'}>
            <SpinnerIcon />
            <span>{backgroundSyncing ? 'Refreshing…' : 'Syncing…'}</span>
          </span>
        )}
        <button
          type="button"
          style={styles.refreshButton}
          title={backgroundSyncing ? 'Refreshing SharePoint data…' : 'Refresh SharePoint schema and terms'}
          disabled={syncing}
          onClick={() => sendMessage({ command: 'refreshData' })}
        >
          <RefreshIcon />
        </button>
      </div>

      <div style={styles.scrollArea}>
        {pageFields.length > 0 && (
          <Collapsible stateKey="section:page" title="Page" badge={pageFields.length}>
            {pageFields.map((field) => (
              <FieldRow key={field.internalName} field={field} {...makeHandler(field)} />
            ))}
          </Collapsible>
        )}

        <Collapsible stateKey="section:metadata" title="Metadata" badge={metadataFields.length || undefined}>
          {sharePointNotice && (
            <div style={styles.sharePointNotice}>{sharePointNotice}</div>
          )}
          {metadataFields.map((field) => (
            <FieldRow key={field.internalName} field={field} {...makeHandler(field)} />
          ))}
          {metadataFields.length === 0 && !sharePointNotice && (
            <div style={styles.sharePointNotice}>No SharePoint metadata fields available for this page.</div>
          )}
        </Collapsible>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border))',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 auto',
    minWidth: 0,
    gap: '2px',
  },
  fileName: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: 'var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground))',
    opacity: 0.8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  siteIndicator: {
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  syncingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    fontSize: '10px',
    opacity: 0.6,
  },
  refreshButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '20px',
    height: '20px',
    padding: 0,
    border: 'none',
    borderRadius: '3px',
    background: 'transparent',
    color: 'var(--vscode-icon-foreground, var(--vscode-foreground))',
    cursor: 'pointer',
  },
  sharePointNotice: {
    padding: '10px 12px',
    fontSize: '11px',
    opacity: 0.65,
    lineHeight: 1.5,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '16px',
    textAlign: 'center',
  },
  muted: {
    opacity: 0.5,
    fontSize: '12px',
  },
};
