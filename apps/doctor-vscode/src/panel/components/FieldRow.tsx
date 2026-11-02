import React, { useState, useEffect } from 'react';
import { EnumOption, FieldState } from '../messages';
import { TagIcon, PersonIcon, SpinnerIcon } from './Icons';

interface Props {
  field: FieldState;
  onChange: (value: any) => void;
  onPickTerm: () => void;
  onPickUser: () => void;
}

export const FieldRow: React.FC<Props> = ({ field, onChange, onPickTerm, onPickUser }) => {
  // Taxonomy/User fields need a live SharePoint connection to resolve/search
  // values via their picker UI. When SharePoint is unavailable, degrade them
  // to a plain text input (holding the raw stored value) instead of a picker
  // button that can never be clicked successfully — e.g. the Author field
  // should still be hand-editable without auth, just without name/term
  // lookup.
  const spAvailable = !field.spUnavailable;
  const isTax = spAvailable && (field.typeAsString === 'TaxonomyFieldType' || field.typeAsString === 'TaxonomyFieldTypeMulti');
  const isUser = spAvailable && (field.typeAsString === 'User' || field.typeAsString === 'UserMulti');
  // Safety net: any field whose value is a plain object/array but doesn't have
  // a dedicated renderer would otherwise fall through to TextField and show
  // up as the unhelpful "[object Object]" — render it as editable JSON instead.
  const isPlainObject = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const hasUnhandledObjectValue =
    !isTax && !isUser &&
    field.typeAsString !== 'DoctorHeader' &&
    field.typeAsString !== 'DoctorPartials' &&
    field.typeAsString !== 'DoctorMenu' &&
    (isPlainObject(field.value) || Array.isArray(field.value));

  return (
    <div className="doctor-field-row" style={styles.row}>
      <label style={styles.label} title={field.description ?? field.internalName}>
        <span>
          {field.title}
          {field.required && <span style={styles.required}>*</span>}
        </span>
        <span style={styles.labelStatus}>
          {field.loading && (
            <span style={styles.spinnerWrap} title="Loading field metadata…">
              <SpinnerIcon />
            </span>
          )}
          {field.spUnavailable && (
            <span style={styles.unavailableBadge} title="SharePoint is not available — type/choices for this field could not be resolved, but the raw value is still shown below.">
              SharePoint unavailable
            </span>
          )}
        </span>
      </label>
      <div style={styles.control}>
        {isTax ? (
          <TaxField field={field} onPick={onPickTerm} />
        ) : isUser ? (
          <UserField field={field} onPick={onPickUser} />
        ) : field.typeAsString === 'Boolean' ? (
          <BoolField field={field} onChange={onChange} />
        ) : field.typeAsString === 'DateTime' ? (
          <DateField field={field} onChange={onChange} />
        ) : field.typeAsString === 'Choice' || field.typeAsString === 'DoctorPageType' ? (
          <ChoiceField field={field} onChange={onChange} />
        ) : field.typeAsString === 'DoctorHeader' ? (
          <HeaderField field={field} onChange={onChange} />
        ) : field.typeAsString === 'DoctorPartials' ? (
          <PartialsField field={field} onChange={onChange} />
        ) : field.typeAsString === 'DoctorMenu' ? (
          <MenuField field={field} onChange={onChange} />
        ) : field.typeAsString === 'DoctorJson' || hasUnhandledObjectValue ? (
          <JsonField field={field} onChange={onChange} />
        ) : (
          <TextField field={field} onChange={onChange} />
        )}
      </div>
    </div>
  );
};

const TaxField: React.FC<{ field: FieldState; onPick: () => void }> = ({ field, onPick }) => {
  const isMulti = field.typeAsString === 'TaxonomyFieldTypeMulti';
  const value = field.value;

  const renderValue = () => {
    if (!value) { return <span style={styles.empty}>Not set</span>; }
    if (isMulti && Array.isArray(value)) {
      if (value.length === 0) { return <span style={styles.empty}>Not set</span>; }
      return (
        <div style={styles.tagList}>
          {value.map((v: any, i: number) => (
            <span key={i} style={styles.tag}>{v?.label ?? v}</span>
          ))}
        </div>
      );
    }
    if (typeof value === 'object' && value?.label) {
      return <span style={styles.tag}>{value.label}</span>;
    }
    return <span style={styles.tagValue}>{String(value)}</span>;
  };

  return (
    <div style={styles.pickRow}>
      <div style={styles.pickValue}>{renderValue()}</div>
      <button type="button" style={styles.pickBtn} onClick={onPick} title="Pick term">
        <TagIcon />
      </button>
    </div>
  );
};

const UserField: React.FC<{ field: FieldState; onPick: () => void }> = ({ field, onPick }) => {
  const value = field.value;
  const isMulti = field.typeAsString === 'UserMulti';

  const renderValue = () => {
    if (!value) { return <span style={styles.empty}>Not set</span>; }
    if (isMulti && Array.isArray(value)) {
      if (value.length === 0) { return <span style={styles.empty}>Not set</span>; }
      return (
        <div style={styles.tagList}>
          {value.map((v: any, i: number) => (
            <span key={i} style={styles.tag}>{v?.displayName ?? v?.userPrincipalName ?? v}</span>
          ))}
        </div>
      );
    }
    if (typeof value === 'object') {
      return <span style={styles.tag}>{value?.displayName ?? value?.userPrincipalName}</span>;
    }
    return <span style={styles.tagValue}>{String(value)}</span>;
  };

  return (
    <div style={styles.pickRow}>
      <div style={styles.pickValue}>{renderValue()}</div>
      <button type="button" style={styles.pickBtn} onClick={onPick} title="Pick user">
        <PersonIcon />
      </button>
    </div>
  );
};

const TextField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const [val, setVal] = useState(field.value ?? '');
  useEffect(() => setVal(field.value ?? ''), [field.value]);

  return (
    <input
      style={styles.input}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onChange(val)}
      onKeyDown={(e) => e.key === 'Enter' && onChange(val)}
    />
  );
};

const DateField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const toDateStr = (v: any) => {
    if (!v) { return ''; }
    try { return new Date(v).toISOString().slice(0, 10); } catch { return ''; }
  };
  const [val, setVal] = useState(toDateStr(field.value));
  useEffect(() => setVal(toDateStr(field.value)), [field.value]);

  return (
    <input
      style={styles.input}
      type="date"
      value={val}
      onChange={(e) => { setVal(e.target.value); onChange(e.target.value); }}
    />
  );
};

const BoolField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const val = field.value === true || field.value === 'true';
  return (
    <label style={styles.toggleLabel}>
      <input
        type="checkbox"
        checked={val}
        onChange={(e) => onChange(e.target.checked)}
        style={styles.checkbox}
      />
      <span>{val ? 'Yes' : 'No'}</span>
    </label>
  );
};

/**
 * Renders a dropdown from value/label pairs — `value` is written to front
 * matter as-is, `label` is only ever shown in the UI. Real SharePoint Choice
 * columns use the same string for both; doctor's own hardcoded enums (header
 * type/layout/alignment, page layout, …) get human-friendly labels.
 */
const ChoiceField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const options = field.choices ?? [];
  return (
    <select
      style={styles.select}
      value={field.value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">— select —</option>
      {options.filter((o) => o.value !== '').map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
};

/**
 * Doctor's `partials` front matter key is `boolean | { header?: boolean, footer?: boolean }`.
 * `true`/absent means both partials are injected; `false` disables both;
 * an object lets header/footer be toggled independently.
 */
const PartialsField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const value = field.value;
  const isObjectForm = value !== null && typeof value === 'object';
  const allEnabled = value === undefined || value === null || value === true;

  return (
    <div style={styles.subFieldGroupFlush}>
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            style={styles.checkbox}
            checked={isObjectForm ? true : allEnabled}
            onChange={(e) => onChange(e.target.checked ? null : false)}
          />
          <span>Inject partials on this page</span>
        </label>
        {(allEnabled || isObjectForm) && (
          <>
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={isObjectForm ? value.header !== false : true}
                onChange={(e) => onChange({ ...(isObjectForm ? value : {}), header: e.target.checked, footer: isObjectForm ? value.footer !== false : true })}
              />
              <span>Header partial</span>
            </label>
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                style={styles.checkbox}
                checked={isObjectForm ? value.footer !== false : true}
                onChange={(e) => onChange({ header: isObjectForm ? value.header !== false : true, ...(isObjectForm ? value : {}), footer: e.target.checked })}
              />
              <span>Footer partial</span>
            </label>
          </>
        )}
      </div>
  );
};

/**
 * Generic fallback for structured doctor concepts we don't have a dedicated
 * editor for yet (e.g. `menu`, `localization`) and for any other unexpected
 * object/array field value — edits as raw JSON rather than silently
 * stringifying to "[object Object]".
 */
const JsonField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const stringify = (v: any) => (v === null || v === undefined ? '' : JSON.stringify(v, null, 2));
  const [text, setText] = useState(stringify(field.value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(stringify(field.value)), [field.value]);

  const commit = () => {
    if (text.trim() === '') {
      setError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onChange(parsed);
    } catch {
      setError('Invalid JSON — change was not saved');
    }
  };

  return (
    <div>
      <textarea
        style={{ ...styles.input, ...styles.jsonTextarea } as React.CSSProperties}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={Math.min(10, Math.max(3, text.split('\n').length))}
      />
      {error && <div style={styles.jsonError}>{error}</div>}
    </div>
  );
};

/**
 * Doctor's `header` front matter key holds a structured object (see
 * doctor's `HeaderOptions` model), not a plain string — render its known
 * sub-fields individually instead of falling back to a raw text input
 * (which used to show up as the unhelpful "[object Object]").
 */
interface HeaderOptions {
  type?: 'None' | 'Default' | 'Custom';
  image?: string;
  altText?: string;
  translateX?: number;
  translateY?: number;
  layout?: 'FullWidthImage' | 'NoImage' | 'ColorBlock' | 'CutInShape';
  textAlignment?: 'Center' | 'Left';
  showTopicHeader?: boolean;
  topicHeader?: string;
  showPublishDate?: boolean;
  authors?: string[];
}

/**
 * Where a page sits in the site navigation.
 *
 * The front matter nests the entry under the navigation it belongs to:
 *
 *     menu:
 *       QuickLaunch:
 *         id: tools
 *         weight: 1
 *         parent: documentation
 *
 * Doctor rebuilds the navigation from every page on each publish, so `id` is
 * what other pages point at with `parent` — which is why it is the one field
 * here that cannot be left empty.
 */
const MENU_LOCATIONS: EnumOption[] = [
  { value: 'QuickLaunch', label: 'Quick launch' },
  { value: 'TopNavigationBar', label: 'Top navigation' },
];

interface MenuEntry {
  id?: string;
  name?: string;
  weight?: number;
  parent?: string;
  [key: string]: unknown;
}

const MenuField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const value = field.value && typeof field.value === 'object' ? (field.value as Record<string, MenuEntry>) : {};

  // A page belongs to one navigation. The first key wins when the front matter
  // names more than one, rather than silently dropping the others — the raw
  // value is still there and switching location rewrites it.
  const location = Object.keys(value).find((k) => MENU_LOCATIONS.some((o) => o.value === k)) ?? 'QuickLaunch';
  const toEntry = (v: unknown): MenuEntry => (v && typeof v === 'object' ? { ...(v as MenuEntry) } : {});

  const [entry, setEntry] = useState<MenuEntry>(toEntry(value[location]));
  useEffect(() => setEntry(toEntry(value[location])), [field.value, location]);

  const commit = (patch: Partial<MenuEntry>, nextLocation = location) => {
    const next: MenuEntry = { ...entry, ...patch };

    for (const key of Object.keys(next)) {
      const v = next[key];
      if (v === '' || v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) {
        delete next[key];
      }
    }

    setEntry(next);
    // Without an id the entry means nothing to doctor, so the whole property
    // goes rather than being written half-formed
    onChange(next.id ? { [nextLocation]: next } : null);
  };

  const inNavigation = !!entry.id;

  return (
    <div style={styles.subFieldGroupFlush}>
      <div style={styles.subFieldRow}>
        <label style={styles.subLabel} title="Which navigation this page is added to">Navigation</label>
        <select
          style={styles.select}
          value={location}
          onChange={(e) => commit({}, e.target.value)}
        >
          {MENU_LOCATIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div style={styles.subFieldRow}>
        <label style={styles.subLabel} title="Identifies this entry, so other pages can point at it as their parent. Required.">
          ID
        </label>
        <input
          style={styles.input}
          value={entry.id ?? ''}
          placeholder="e.g. tools"
          onChange={(e) => setEntry({ ...entry, id: e.target.value })}
          onBlur={(e) => commit({ id: e.target.value })}
        />
      </div>
      <div style={styles.subFieldRow}>
        <label style={styles.subLabel} title="Shown in the menu instead of the page title">Name</label>
        <input
          style={styles.input}
          value={entry.name ?? ''}
          placeholder="Page title is used when empty"
          disabled={!inNavigation}
          onChange={(e) => setEntry({ ...entry, name: e.target.value })}
          onBlur={(e) => commit({ name: e.target.value })}
        />
      </div>
      <div style={styles.subFieldRow}>
        <label style={styles.subLabel} title="Entries with a weight come first, lightest first. Entries without one follow, alphabetically.">
          Weight
        </label>
        <input
          style={styles.input}
          type="number"
          value={entry.weight ?? ''}
          placeholder="Unweighted — sorted alphabetically"
          disabled={!inNavigation}
          onChange={(e) => setEntry({ ...entry, weight: e.target.value === '' ? undefined : Number(e.target.value) })}
          onBlur={(e) => commit({ weight: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </div>
      <div style={styles.subFieldRow}>
        <label style={styles.subLabel} title="The ID of the entry this page sits under. Nest deeper with parent/sub-parent.">
          Parent
        </label>
        <input
          style={styles.input}
          value={entry.parent ?? ''}
          placeholder="Top level when empty"
          disabled={!inNavigation}
          list="doctor-menu-parents"
          onChange={(e) => setEntry({ ...entry, parent: e.target.value })}
          onBlur={(e) => commit({ parent: e.target.value })}
        />
        {/* The ids used by the other pages in the project, so a parent can be
            picked rather than remembered. Suggestions only — a parent that
            does not exist yet is still allowed, because the page defining it
            may not be written yet. */}
        <datalist id="doctor-menu-parents">
          {(field.choices ?? []).map((choice) => (
            <option key={choice.value} value={choice.value} label={choice.label} />
          ))}
        </datalist>
      </div>
      {!inNavigation && (
        <div style={styles.subFieldRow}>
          <span style={styles.empty}>Give the entry an ID to add this page to the navigation.</span>
        </div>
      )}
    </div>
  );
};

const HEADER_TYPE_OPTIONS: EnumOption[] = [
  { value: 'None', label: 'None' },
  { value: 'Default', label: 'Default' },
  { value: 'Custom', label: 'Custom' },
];
const HEADER_LAYOUT_OPTIONS: EnumOption[] = [
  { value: 'FullWidthImage', label: 'Full-width image' },
  { value: 'NoImage', label: 'No image' },
  { value: 'ColorBlock', label: 'Color block' },
  { value: 'CutInShape', label: 'Cut-in shape' },
];
const HEADER_TEXT_ALIGNMENT_OPTIONS: EnumOption[] = [
  { value: 'Left', label: 'Left' },
  { value: 'Center', label: 'Center' },
];

const HeaderField: React.FC<{ field: FieldState; onChange: (v: any) => void }> = ({ field, onChange }) => {
  const toHeader = (v: any): HeaderOptions => (v && typeof v === 'object' ? v : {});
  const [header, setHeader] = useState<HeaderOptions>(toHeader(field.value));
  useEffect(() => setHeader(toHeader(field.value)), [field.value]);

  const commit = (patch: Partial<HeaderOptions>) => {
    const next: HeaderOptions = { ...header, ...patch };
    // Drop keys that are empty/undefined so we don't clutter the front matter.
    for (const key of Object.keys(next) as (keyof HeaderOptions)[]) {
      const v = next[key];
      if (v === '' || v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
        delete next[key];
      }
    }
    setHeader(next);
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  const authorsText = (header.authors ?? []).join(', ');
  const [authorsVal, setAuthorsVal] = useState(authorsText);
  useEffect(() => setAuthorsVal(authorsText), [authorsText]);
  const commitAuthors = () => {
    const authors = authorsVal.split(',').map((a) => a.trim()).filter(Boolean);
    commit({ authors });
  };

  return (
      <div style={styles.subFieldGroupFlush}>
        <div style={styles.subFieldRow}>
          <label style={styles.subLabel}>Type</label>
          <select style={styles.select} value={header.type ?? 'Default'} onChange={(e) => commit({ type: e.target.value as HeaderOptions['type'] })}>
            {HEADER_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.subFieldRow}>
          <label style={styles.subLabel}>Layout</label>
          <select style={styles.select} value={header.layout ?? 'FullWidthImage'} onChange={(e) => commit({ layout: e.target.value as HeaderOptions['layout'] })}>
            {HEADER_LAYOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.subFieldRow}>
          <label style={styles.subLabel}>Image URL</label>
          <input
            style={styles.input}
            value={header.image ?? ''}
            onChange={(e) => setHeader({ ...header, image: e.target.value })}
            onBlur={(e) => commit({ image: e.target.value })}
          />
        </div>
        <div style={styles.subFieldRow}>
          <label style={styles.subLabel}>Alt text</label>
          <input
            style={styles.input}
            value={header.altText ?? ''}
            onChange={(e) => setHeader({ ...header, altText: e.target.value })}
            onBlur={(e) => commit({ altText: e.target.value })}
          />
        </div>
        <div style={styles.subFieldRowSplit}>
          <div style={styles.subFieldRowHalf}>
            <label style={styles.subLabel}>Translate X</label>
            <input
              style={styles.input}
              type="number"
              value={header.translateX ?? ''}
              onChange={(e) => setHeader({ ...header, translateX: e.target.value === '' ? undefined : Number(e.target.value) })}
              onBlur={(e) => commit({ translateX: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
          <div style={styles.subFieldRowHalf}>
            <label style={styles.subLabel}>Translate Y</label>
            <input
              style={styles.input}
              type="number"
              value={header.translateY ?? ''}
              onChange={(e) => setHeader({ ...header, translateY: e.target.value === '' ? undefined : Number(e.target.value) })}
              onBlur={(e) => commit({ translateY: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </div>
        </div>
        <div style={styles.subFieldRow}>
          <label style={styles.subLabel}>Text alignment</label>
          <select style={styles.select} value={header.textAlignment ?? 'Left'} onChange={(e) => commit({ textAlignment: e.target.value as HeaderOptions['textAlignment'] })}>
            {HEADER_TEXT_ALIGNMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            style={styles.checkbox}
            checked={header.showTopicHeader === true}
            onChange={(e) => commit({ showTopicHeader: e.target.checked })}
          />
          <span>Show topic header</span>
        </label>
        {header.showTopicHeader && (
          <div style={styles.subFieldRow}>
            <label style={styles.subLabel}>Topic header</label>
            <input
              style={styles.input}
              value={header.topicHeader ?? ''}
              onChange={(e) => setHeader({ ...header, topicHeader: e.target.value })}
              onBlur={(e) => commit({ topicHeader: e.target.value })}
            />
          </div>
        )}
        <label style={styles.toggleLabel}>
          <input
            type="checkbox"
            style={styles.checkbox}
            checked={header.showPublishDate === true}
            onChange={(e) => commit({ showPublishDate: e.target.checked })}
          />
          <span>Show publish date</span>
        </label>
        <div style={styles.subFieldRow}>
          <label style={styles.subLabel}>Authors (comma separated UPNs)</label>
          <input
            style={styles.input}
            value={authorsVal}
            onChange={(e) => setAuthorsVal(e.target.value)}
            onBlur={commitAuthors}
          />
        </div>
      </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  row: {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--vscode-foreground)',
    opacity: 0.75,
    userSelect: 'none',
  },
  required: {
    color: 'var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground))',
    marginLeft: '3px',
  },
  spinnerWrap: {
    display: 'inline-flex',
    opacity: 0.7,
  },
  labelStatus: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  unavailableBadge: {
    fontSize: '9px',
    fontWeight: 500,
    opacity: 0.55,
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  control: {
    width: '100%',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border, transparent)',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '12px',
    outline: 'none',
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    background: 'var(--vscode-dropdown-background)',
    color: 'var(--vscode-dropdown-foreground)',
    border: '1px solid var(--vscode-dropdown-border)',
    borderRadius: '4px',
    padding: '6px 8px',
    fontSize: '12px',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  checkbox: {
    cursor: 'pointer',
    margin: 0,
  },
  pickRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  pickValue: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    minHeight: '24px',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
  },
  tag: {
    display: 'inline-block',
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
    borderRadius: '12px',
    padding: '3px 10px',
    fontSize: '11px',
  },
  tagValue: {
    fontSize: '12px',
    opacity: 0.8,
  },
  empty: {
    opacity: 0.45,
    fontSize: '12px',
    fontStyle: 'italic',
  },
  // No padding/border of its own — used when the sub-fields sit directly
  // under the parent field's own label row (e.g. `header`, `partials`)
  // instead of inside a separate inset card.
  subFieldGroupFlush: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  subFieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  subFieldRowSplit: {
    display: 'flex',
    gap: '8px',
  },
  subFieldRowHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    minWidth: 0,
  },
  subLabel: {
    fontSize: '10px',
    opacity: 0.65,
    userSelect: 'none',
  },
  jsonTextarea: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    resize: 'vertical',
    whiteSpace: 'pre',
  },
  jsonError: {
    color: 'var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground))',
    fontSize: '10px',
    marginTop: '2px',
  },
  pickBtn: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: 'var(--vscode-button-secondaryBackground)',
    color: 'var(--vscode-button-secondaryForeground)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
