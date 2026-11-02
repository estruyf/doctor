import React, { useEffect, useState } from 'react';
import { booleanValue, countSettings, FieldDescriptor, FieldGroup } from '../config/configModel';
import type {
  ConfigEditorMessage,
  ConfigStateMessage,
  LanguagesMessage,
} from '../config/ConfigEditorProvider';
import { addLanguage, parseCustomLcid, replaceEntry, resolveEntry } from '../config/languages';
import {
  addItem,
  idFromName,
  problemsFor,
  readItems,
  removeItem,
  StaticMenuItem,
  updateItem,
} from '../config/menuItems';

declare function acquireVsCodeApi(): {
  postMessage(msg: ConfigEditorMessage): void;
  getState(): any;
  setState(state: any): void;
};

const vscode = acquireVsCodeApi();
const send = (message: ConfigEditorMessage) => vscode.postMessage(message);
const set = (path: string, value: unknown) => send({ command: 'set', path, value });

export const ConfigForm: React.FC = () => {
  const [state, setState] = useState<ConfigStateMessage | null>(null);
  // Bumped by every message from the host, so each box can go back to what
  // the file says even when the value it is given has not changed — which is
  // exactly what happens when the host refused or ignored a write
  const [revision, setRevision] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    () => vscode.getState()?.collapsed ?? {}
  );

  useEffect(() => {
    const listener = (event: MessageEvent<ConfigStateMessage>) => {
      if (event.data?.command === 'state') {
        setState(event.data);
        setRevision((r) => r + 1);
      }
    };
    window.addEventListener('message', listener);
    send({ command: 'ready' });
    return () => window.removeEventListener('message', listener);
  }, []);

  const toggle = (id: string) => {
    const next = { ...collapsed, [id]: !collapsed[id] };
    setCollapsed(next);
    vscode.setState({ collapsed: next });
  };

  const active = useActiveGroup(state?.groups ?? []);

  // A group picked in the table of contents is opened first when it was
  // collapsed, so the jump lands on its settings rather than on a closed header
  const goTo = (id: string) => {
    if (collapsed[id]) {
      toggle(id);
    }
    requestAnimationFrame(() =>
      document.getElementById(groupAnchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  if (!state) {
    return <div style={styles.page}>Loading…</div>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>doctor.json</h1>
          <p style={styles.subtitle}>
            Every change is an ordinary edit to the file, so undo, save and Git work as usual.
          </p>
        </div>
        <div style={styles.actions}>
          <button style={styles.secondary} onClick={() => send({ command: 'run', run: 'status' })}>
            Status
          </button>
          <button style={styles.primary} onClick={() => send({ command: 'run', run: 'publish' })}>
            Publish
          </button>
          <button style={styles.secondary} onClick={() => send({ command: 'openSource' })}>
            Open as text
          </button>
        </div>
      </header>

      {state.error && (
        <div style={styles.error} role="alert">
          <strong>doctor.json is not valid JSON.</strong> The form will not save until it is fixed,
          so it cannot overwrite what is there. <code>{state.error}</code>
        </div>
      )}

      <style>{LAYOUT_CSS}</style>
      <div className="doctor-layout">
        <nav className="doctor-toc" aria-label="Settings">
          <ul style={styles.tocList}>
            {state.groups.map((group) => (
              <li key={group.id}>
                <button
                  className={`doctor-toc-item${active === group.id ? ' is-active' : ''}`}
                  aria-current={active === group.id ? 'true' : undefined}
                  onClick={() => goTo(group.id)}
                >
                  <span>{group.title}</span>
                  <span style={styles.tocCount}>{countSettings(group.fields)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div style={styles.content}>
          {state.groups.map((group) => (
            <Group
              key={group.id}
              group={group}
              state={state}
              revision={revision}
              collapsed={!!collapsed[group.id]}
              onToggle={() => toggle(group.id)}
              disabled={!!state.error}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const groupAnchor = (id: string) => `group-${id}`;

/** How far below the top of the editor a group header counts as reached */
const ACTIVE_OFFSET = 96;

/**
 * The group being read: the last one whose header has scrolled past the top
 * of the editor. Followed on scroll, so the table of contents keeps up with
 * the page whether it was scrolled by hand or by a jump.
 */
function useActiveGroup(groups: FieldGroup[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(undefined);
  const ids = groups.map((group) => group.id).join('|');

  useEffect(() => {
    if (!ids) {
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      let current = groups[0]?.id;

      for (const group of groups) {
        const section = document.getElementById(groupAnchor(group.id));
        if (section && section.getBoundingClientRect().top <= ACTIVE_OFFSET) {
          current = group.id;
        }
      }

      // Scrolled to the bottom, the last groups never reach the top — the
      // last one is then the one being read
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = groups[groups.length - 1]?.id;
      }

      setActive(current);
    };

    const onScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [ids]);

  return active;
}

/**
 * The parts of the layout inline styles cannot express: the narrow-editor
 * breakpoint, where the table of contents gives its width back to the
 * settings, and the hover and active states of its entries.
 */
const LAYOUT_CSS = `
.doctor-layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 32px; align-items: start; }
.doctor-toc { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto; }
.doctor-toc-item {
  display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%;
  padding: 6px 10px; border: none; border-radius: 4px; background: none; color: inherit;
  font: inherit; text-align: left; cursor: pointer; opacity: 0.85;
}
.doctor-toc-item:hover { background: var(--vscode-list-hoverBackground); opacity: 1; }
.doctor-toc-item:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.doctor-toc-item.is-active {
  background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground));
  color: var(--vscode-list-activeSelectionForeground, inherit);
  font-weight: 600; opacity: 1;
}
section[id^="group-"] { scroll-margin-top: 12px; }
@media (max-width: 720px) {
  .doctor-layout { grid-template-columns: minmax(0, 1fr); }
  .doctor-toc { display: none; }
}
`;

const Group: React.FC<{
  group: FieldGroup;
  state: ConfigStateMessage;
  revision: number;
  collapsed: boolean;
  onToggle: () => void;
  disabled: boolean;
}> = ({ group, state, revision, collapsed, onToggle, disabled }) => (
  <section id={groupAnchor(group.id)} style={styles.group}>
    <button style={styles.groupHeader} onClick={onToggle} aria-expanded={!collapsed}>
      <span style={styles.chevron}>{collapsed ? '▸' : '▾'}</span>
      <span style={styles.groupTitle}>{group.title}</span>
    </button>
    {!collapsed && (
      <div style={styles.groupBody}>
        {group.description && <p style={styles.groupDescription}>{group.description}</p>}
        {group.fields.map((field) => (
          <Field key={field.path} field={field} state={state} revision={revision} disabled={disabled} />
        ))}
      </div>
    )}
  </section>
);

const Field: React.FC<{
  field: FieldDescriptor;
  state: ConfigStateMessage;
  revision: number;
  disabled: boolean;
}> = ({ field, state, revision, disabled }) => {
  if (field.kind === 'object') {
    return (
      <fieldset style={styles.fieldset}>
        <legend style={styles.legend}>{field.label}</legend>
        {field.description && <p style={styles.description}>{field.description}</p>}
        {field.children?.map((child) => (
          <Field key={child.path} field={child} state={state} revision={revision} disabled={disabled} />
        ))}
      </fieldset>
    );
  }

  const value = state.values[field.path];
  const isSet = field.kind === 'secret' ? state.secretsSet[field.path] : value !== undefined;

  // A list of items needs the width; beside the label it would be squeezed
  // into a column of one box per line
  const wide = field.kind === 'menuItems';

  return (
    <div style={wide ? styles.rowStacked : styles.row}>
      <div style={styles.labelColumn}>
        <label style={styles.label} htmlFor={field.path}>
          {field.label}
        </label>
        <code style={styles.key}>
          {/* A dotted path has no spaces to wrap at, so it would run out of the
              label column and over the description beside it. It breaks after
              each dot instead, and anywhere as a last resort. */}
          {field.path.split('.').map((part, i, all) => (
            <React.Fragment key={i}>
              {part}
              {i < all.length - 1 && (
                <>
                  .<wbr />
                </>
              )}
            </React.Fragment>
          ))}
        </code>
      </div>
      <div style={styles.controlColumn}>
        <div style={styles.controlWithAction}>
          <div style={styles.grow}>
            <Control
              field={field}
              value={value}
              isSet={!!isSet}
              revealed={state.revealed?.[field.path]}
              revision={revision}
              disabled={disabled}
            />
          </div>
          {state.pathFields?.includes(field.path) && (
            <button
              style={styles.secondary}
              disabled={disabled}
              title="Pick it, and have it written the way doctor reads it"
              onClick={() => send({ command: 'pickPath', path: field.path })}
            >
              Browse…
            </button>
          )}
        </div>
        {field.description && <p style={styles.description}>{field.description}</p>}
      </div>
    </div>
  );
};

const Control: React.FC<{
  field: FieldDescriptor;
  value: unknown;
  isSet: boolean;
  revealed?: string;
  revision: number;
  disabled: boolean;
}> = ({ field, value, isSet, revealed, revision, disabled }) => {
  switch (field.kind) {
    case 'boolean': {
      const checked = typeof value === 'boolean' ? value : field.default === true;
      return (
        <input
          id={field.path}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => set(field.path, booleanValue(field, e.target.checked))}
        />
      );
    }

    case 'enum':
      return (
        <select
          id={field.path}
          style={styles.input}
          value={value === undefined ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => set(field.path, e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">— not set{field.default !== undefined ? ` (${String(field.default)})` : ''} —</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );

    case 'number':
      return (
        <TextInput
          id={field.path}
          type="number"
          revision={revision}
          value={value === undefined ? '' : String(value)}
          placeholder={field.default !== undefined ? String(field.default) : ''}
          disabled={disabled}
          onCommit={(text) => set(field.path, text === '' ? undefined : Number(text))}
        />
      );

    case 'secret':
      return (
        <SecretInput field={field} isSet={isSet} revealed={revealed} revision={revision} disabled={disabled} />
      );

    case 'json':
      return <JsonInput field={field} value={value} revision={revision} disabled={disabled} />;

    case 'languages':
      return <LanguagesInput field={field} value={value} disabled={disabled} />;

    case 'menuItems':
      return <MenuItemsInput field={field} value={value} revision={revision} disabled={disabled} />;

    default:
      return (
        <TextInput
          id={field.path}
          revision={revision}
          value={typeof value === 'string' ? value : ''}
          placeholder={field.default !== undefined ? String(field.default) : ''}
          disabled={disabled}
          onCommit={(text) => set(field.path, text === '' ? undefined : text)}
        />
      );
  }
};

/**
 * A text box which writes when it loses focus, not on every keystroke.
 *
 * Writing per keystroke would make each character a separate edit — a separate
 * undo step — and round-trip the whole file through the extension host while
 * the cursor is still in the box.
 */
const TextInput: React.FC<{
  id?: string;
  value: string;
  revision: number;
  type?: string;
  placeholder?: string;
  disabled: boolean;
  onCommit: (text: string) => void;
}> = ({ id, value, revision, type = 'text', placeholder, disabled, onCommit }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, revision]);

  return (
    <input
      id={id}
      type={type}
      style={styles.input}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

/**
 * A credential. The form is told whether one is set, never what it is, so the
 * box starts empty and typing replaces the stored value.
 */
const SecretInput: React.FC<{
  field: FieldDescriptor;
  isSet: boolean;
  revealed?: string;
  revision: number;
  disabled: boolean;
}> = ({ field, isSet, revealed, revision, disabled }) => {
  const [draft, setDraft] = useState('');
  useEffect(() => setDraft(''), [revision]);

  // A path to a certificate file is not a secret, so it is shown and edited as
  // text — only an inline key is masked
  if (revealed !== undefined) {
    return (
      <TextInput
        id={field.path}
        value={revealed}
        revision={revision}
        disabled={disabled}
        onCommit={(text) => set(field.path, text === '' ? undefined : text)}
      />
    );
  }

  return (
    <div style={styles.secretRow}>
      <input
        id={field.path}
        type="password"
        autoComplete="off"
        style={styles.input}
        value={draft}
        placeholder={isSet ? 'Set — type to replace' : 'Not set'}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft) {
            set(field.path, draft);
            setDraft('');
          }
        }}
      />
      {isSet && (
        <button style={styles.secondary} disabled={disabled} onClick={() => set(field.path, undefined)}>
          Clear
        </button>
      )}
    </div>
  );
};

/**
 * A setting whose shape the schema leaves open — `menu`, for one — edited as
 * JSON. It is only written once it parses, so a half-typed object cannot
 * reach the file.
 */
const JsonInput: React.FC<{
  field: FieldDescriptor;
  value: unknown;
  revision: number;
  disabled: boolean;
}> = ({ field, value, revision, disabled }) => {
  const text = value === undefined ? '' : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(text);
    setError(null);
  }, [text, revision]);

  const commit = () => {
    if (draft === text) {
      return;
    }
    if (!draft.trim()) {
      setError(null);
      set(field.path, undefined);
      return;
    }
    try {
      set(field.path, JSON.parse(draft));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <textarea
        id={field.path}
        style={{ ...styles.input, ...styles.textarea }}
        value={draft}
        rows={Math.min(14, Math.max(3, draft.split('\n').length))}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      {error && <p style={styles.inlineError}>Not saved — {error}</p>}
    </div>
  );
};


/**
 * `multilingual.languages` as a list of languages rather than an array of
 * numbers.
 *
 * The choices are what SharePoint says the site can be switched to, when it
 * can be asked, and doctor's built-in table otherwise. Anything SharePoint does
 * not list can still be added by its LCID. What is added is always written as
 * an LCID: doctor passes any LCID straight through, but only resolves a name
 * that is in its own table — so a language SharePoint offers and doctor's
 * table lacks would fail the publish if it were written by name.
 */
const LanguagesInput: React.FC<{ field: FieldDescriptor; value: unknown; disabled: boolean }> = ({
  field,
  value,
  disabled,
}) => {
  const [list, setList] = useState<LanguagesMessage | null>(null);
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: MessageEvent<LanguagesMessage>) => {
      if (event.data?.command === 'languages') {
        setList(event.data);
        setLoading(false);
      }
    };
    window.addEventListener('message', listener);
    // Without asking for a sign-in — that only happens on a click
    send({ command: 'loadLanguages', interactive: false });
    return () => window.removeEventListener('message', listener);
  }, []);

  const known = list?.languages ?? [];
  const entries = Array.isArray(value) ? value : [];
  const resolved = entries.map((entry) => resolveEntry(entry, known));
  const chosen = new Set(resolved.map((r) => r.lcid).filter((l): l is number => l !== null));
  const available = known.filter((l) => !chosen.has(l.lcid));

  const write = (next: (number | string)[]) => set(field.path, next.length > 0 ? next : undefined);

  const addCustom = () => {
    const parsed = parseCustomLcid(custom);
    if ('error' in parsed) {
      setCustomError(parsed.error);
      return;
    }
    setCustomError(null);
    setCustom('');
    write(addLanguage(entries, parsed.lcid, known));
  };

  return (
    <div style={styles.languages}>
      {resolved.length === 0 ? (
        <p style={styles.description}>No languages enabled besides the site's own.</p>
      ) : (
        <ul style={styles.chips}>
          {resolved.map((entry, i) => (
            <li key={`${entry.value}-${i}`} style={entry.problem ? styles.chipProblem : styles.chip} title={entry.problem}>
              <span>{entry.label}</span>
              <code style={styles.chipCode}>{typeof entry.value === 'string' ? entry.value : entry.lcid}</code>
              <button
                style={styles.chipRemove}
                disabled={disabled}
                aria-label={`Remove ${entry.label}`}
                onClick={() => write(entries.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {resolved.map((entry, i) =>
        entry.problem ? (
          <p key={i} style={styles.inlineError}>
            {entry.problem}{' '}
            {entry.replaceWith !== undefined && (
              <button
                style={styles.link}
                disabled={disabled}
                onClick={() => write(replaceEntry(entries, i, entry.replaceWith!))}
              >
                Use {entry.replaceWith} instead
              </button>
            )}
          </p>
        ) : null
      )}

      <div style={styles.languageAdd}>
        <select
          style={styles.input}
          value=""
          disabled={disabled || !list || available.length === 0}
          onChange={(e) => {
            const lcid = Number(e.target.value);
            if (lcid) {
              write(addLanguage(entries, lcid, known));
            }
          }}
        >
          <option value="">
            {!list ? 'Loading languages…' : available.length === 0 ? 'Every language is added' : 'Add a language…'}
          </option>
          {available.map((language) => (
            <option key={language.lcid} value={language.lcid}>
              {language.name} — {language.tag} · {language.lcid}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.languageAdd}>
        <input
          style={styles.input}
          value={custom}
          placeholder="Custom LCID, e.g. 1043"
          inputMode="numeric"
          disabled={disabled}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addCustom()}
        />
        <button style={styles.secondary} disabled={disabled || !custom.trim()} onClick={addCustom}>
          Add LCID
        </button>
      </div>
      {customError && <p style={styles.inlineError}>{customError}</p>}

      {list && (
        <p style={styles.description}>
          {list.source === 'sharepoint' ? (
            <>The languages this SharePoint offers.</>
          ) : (
            <>
              {list.note}{' '}
              <button
                style={styles.link}
                disabled={loading}
                onClick={() => {
                  setLoading(true);
                  send({ command: 'loadLanguages', interactive: true });
                }}
              >
                {loading ? 'Loading…' : 'Load from SharePoint'}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
};

/**
 * The static items of one navigation, edited as a list rather than JSON.
 *
 * These are the top of the navigation: doctor creates them first, and a page
 * whose `menu` names one of their ids as its `parent` is put underneath. Each
 * item shows what doctor would do with it that is not what it looks like —
 * skipped without a name, unreachable as a parent with an id pages cannot
 * match — next to the fix where there is one.
 */
const MenuItemsInput: React.FC<{ field: FieldDescriptor; value: unknown; revision: number; disabled: boolean }> = ({
  field,
  value,
  revision,
  disabled,
}) => {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const items = readItems(value);

  if (items === null) {
    return (
      <>
        <p style={styles.inlineError}>This is not a list, so it can only be edited as JSON.</p>
        <JsonInput field={field} value={value} revision={revision} disabled={disabled} />
      </>
    );
  }

  // An emptied list stays an empty list — see removeItem
  const write = (next: StaticMenuItem[]) => set(field.path, next);
  const problems = problemsFor(items);
  const add = () => {
    if (!name.trim()) {
      return;
    }
    write(addItem(items, name, id));
    setName('');
    setId('');
  };

  return (
    <div style={styles.languages}>
      {items.length === 0 && <p style={styles.description}>No static items. Pages can still add themselves.</p>}

      {items.map((item, index) => (
        <div key={index} style={styles.menuItem}>
          <div style={styles.menuItemGrid}>
            <MenuItemText
              label="Name"
              title="What the navigation shows. Required — doctor skips an item without one."
              value={item.name}
              placeholder="Required"
              revision={revision}
              disabled={disabled}
              onCommit={(text) => write(updateItem(items, index, 'name', text))}
            />
            <MenuItemText
              label="ID"
              title="What a page's menu parent names to sit under this item. Lowercase, no spaces."
              value={item.id}
              placeholder="So pages can sit under it"
              revision={revision}
              disabled={disabled}
              onCommit={(text) => write(updateItem(items, index, 'id', text))}
            />
            <MenuItemText
              label="URL"
              title="Where the item links to. Leave it empty for a heading that only holds the pages under it."
              value={item.url}
              placeholder="No link — a heading"
              revision={revision}
              disabled={disabled}
              onCommit={(text) => write(updateItem(items, index, 'url', text))}
            />
            <MenuItemText
              label="Weight"
              title="Items with a weight come first, lightest first. Items without one follow, alphabetically."
              value={item.weight === undefined ? undefined : String(item.weight)}
              placeholder="Alphabetical"
              type="number"
              revision={revision}
              disabled={disabled}
              onCommit={(text) =>
                write(updateItem(items, index, 'weight', text === '' ? undefined : Number(text)))
              }
            />
          </div>
          <button
            style={styles.chipRemove}
            disabled={disabled}
            aria-label={`Remove ${item.name || item.id || 'this item'}`}
            title="Remove this item"
            onClick={() => write(removeItem(items, index))}
          >
            ✕
          </button>
          {problems[index].map((problem, i) => (
            <p key={i} style={{ ...styles.inlineError, gridColumn: '1 / -1' }}>
              {problem.message}{' '}
              {problem.fix && (
                <button
                  style={styles.link}
                  disabled={disabled}
                  onClick={() => write(updateItem(items, index, problem.fix!.key, problem.fix!.value))}
                >
                  {problem.fix.label}
                </button>
              )}
            </p>
          ))}
        </div>
      ))}

      <div style={styles.menuItemAdd}>
        <input
          style={{ ...styles.input, ...styles.menuItemAddInput }}
          value={name}
          placeholder="Name of a new item"
          disabled={disabled}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input
          style={{ ...styles.input, ...styles.menuItemAddInput }}
          value={id}
          placeholder={name.trim() ? idFromName(name) : 'ID, from the name'}
          disabled={disabled}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button style={styles.secondary} disabled={disabled || !name.trim()} onClick={add}>
          Add item
        </button>
      </div>
    </div>
  );
};

const MenuItemText: React.FC<{
  label: string;
  title: string;
  value: string | undefined;
  placeholder: string;
  type?: string;
  revision: number;
  disabled: boolean;
  onCommit: (text: string) => void;
}> = ({ label, title, value, placeholder, type, revision, disabled, onCommit }) => (
  <label style={styles.menuItemField} title={title}>
    <span style={styles.menuItemLabel}>{label}</span>
    <TextInput
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      revision={revision}
      disabled={disabled}
      onCommit={onCommit}
    />
  </label>
);

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '24px 32px 64px' },
  content: { minWidth: 0 },
  tocList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  tocCount: { fontSize: '0.85em', opacity: 0.6, fontVariantNumeric: 'tabular-nums' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 },
  title: { margin: 0, fontSize: '1.6em', fontWeight: 600 },
  subtitle: { margin: '4px 0 0', opacity: 0.7 },
  error: {
    padding: '10px 14px',
    marginBottom: 20,
    borderRadius: 4,
    border: '1px solid var(--vscode-inputValidation-errorBorder)',
    background: 'var(--vscode-inputValidation-errorBackground)',
  },
  group: { borderTop: '1px solid var(--vscode-panel-border, rgba(128,128,128,.25))' },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '12px 0',
    border: 'none',
    background: 'none',
    color: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  },
  chevron: { width: 12, opacity: 0.7 },
  groupTitle: { fontSize: '1.1em', fontWeight: 600 },
  groupBody: { padding: '0 0 16px 20px' },
  groupDescription: { margin: '0 0 12px', opacity: 0.7 },
  fieldset: {
    margin: '8px 0 12px',
    padding: '8px 12px',
    border: '1px solid var(--vscode-panel-border, rgba(128,128,128,.25))',
    borderRadius: 4,
  },
  legend: { padding: '0 6px', fontWeight: 600 },
  row: { display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr', gap: 16, padding: '8px 0' },
  rowStacked: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' },
  // A grid item will not shrink below its content unless told it may
  labelColumn: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  label: { fontWeight: 500, overflowWrap: 'anywhere' },
  key: {
    fontSize: '0.85em',
    opacity: 0.6,
    fontFamily: 'var(--vscode-editor-font-family)',
    overflowWrap: 'anywhere',
  },
  controlColumn: { minWidth: 0 },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '4px 6px',
    color: 'var(--vscode-input-foreground)',
    background: 'var(--vscode-input-background)',
    border: '1px solid var(--vscode-input-border, transparent)',
    borderRadius: 2,
  },
  textarea: { fontFamily: 'var(--vscode-editor-font-family)', resize: 'vertical' },
  description: { margin: '4px 0 0', fontSize: '0.9em', opacity: 0.7 },
  secretRow: { display: 'flex', gap: 8 },
  actions: { display: 'flex', gap: 8, flexShrink: 0 },
  controlWithAction: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  grow: { flex: 1, minWidth: 0 },
  primary: {
    flexShrink: 0,
    padding: '4px 12px',
    color: 'var(--vscode-button-foreground)',
    background: 'var(--vscode-button-background)',
    border: 'none',
    borderRadius: 2,
    cursor: 'pointer',
  },
  secondary: {
    flexShrink: 0,
    padding: '4px 10px',
    color: 'var(--vscode-button-secondaryForeground)',
    background: 'var(--vscode-button-secondaryBackground)',
    border: 'none',
    borderRadius: 2,
    cursor: 'pointer',
  },
  inlineError: { margin: '4px 0 0', fontSize: '0.9em', color: 'var(--vscode-errorForeground)' },
  languages: { display: 'flex', flexDirection: 'column', gap: 8 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, margin: 0, padding: 0, listStyle: 'none' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 4px 2px 8px',
    borderRadius: 10,
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
  },
  chipProblem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 4px 2px 8px',
    borderRadius: 10,
    border: '1px solid var(--vscode-inputValidation-errorBorder)',
    background: 'var(--vscode-inputValidation-errorBackground)',
  },
  chipCode: { fontSize: '0.85em', opacity: 0.75, fontFamily: 'var(--vscode-editor-font-family)' },
  chipRemove: {
    border: 'none',
    background: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: '0 4px',
    opacity: 0.7,
  },
  languageAdd: { display: 'flex', gap: 8 },
  menuItem: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 4,
    alignItems: 'start',
    padding: '6px 4px 6px 8px',
    border: '1px solid var(--vscode-panel-border, rgba(128,128,128,.25))',
    borderRadius: 4,
  },
  menuItemGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, minWidth: 0 },
  menuItemField: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  menuItemLabel: { fontSize: '0.85em', opacity: 0.7 },
  menuItemAdd: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  menuItemAddInput: { flex: '1 1 160px', width: 'auto', minWidth: 0 },
  link: {
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--vscode-textLink-foreground)',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
