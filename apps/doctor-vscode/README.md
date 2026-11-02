# Doctor: Metadata Editor

A VS Code extension for editing [Doctor](https://getdoctor.io)/SharePoint page metadata via a sidebar panel, with taxonomy/user pickers and live validation against your site's column schema.

## Overview

**Doctor** is a tool that syncs Markdown files to SharePoint pages. It reads YAML front matter from `.md` files and maps it (plus a nested `metadata:` object) to SharePoint page column values.

This extension adds a **"Doctor Metadata" sidebar panel** in the activity bar that shows every field relevant to the Markdown file currently open in the editor, and lets you edit it with the right control for its type — a text box, a dropdown, a taxonomy term picker, a user picker, a JSON editor for structured doctor concepts (`header`, `menu`, `partials`, `localization`), etc. Edits are written straight back into the file's front matter.

## How authentication works

The extension supports two authentication modes, resolved automatically per-workspace:

### 1. Certificate auth via `doctor.json` (preferred)

If a `doctor.json` file is found in your workspace (searched upward from the currently open file, then the workspace root) and it contains certificate-auth fields, the extension uses those directly — the same way `doctor` itself authenticates:

```json
{
  "url": "https://contoso.sharepoint.com/sites/docs",
  "appId": "00000000-0000-0000-0000-000000000000",
  "tenant": "contoso.onmicrosoft.com",
  "auth": "certificate",
  "certificate": "./certs/doctor.pfx",
  "password": "optional-plaintext-password"
}
```

- `certificate` may be a path to a `.pfx`/`.p12`/`.pem` file (relative to `doctor.json`), or a raw base64-encoded certificate string.
- `password` is optional. If your certificate needs a password and you don't want to commit it to `doctor.json`:
  - Set the `doctor-metadata.certificatePassword` **User** setting instead (never commit this), **or**
  - Leave both empty — the extension will prompt you for the password the first time it's needed, verify it against the certificate, and store it securely in VS Code's `SecretStorage` (never written to disk in plaintext). It keeps re-prompting until either a working password is entered or you cancel.
  - If you rotate the certificate and the stored password stops working, the extension detects the specific "invalid password" failure from the PKCS#12 parser and automatically re-prompts — or you can run **"Doctor: Clear Stored Certificate Password"** to force a fresh prompt.
- This app registration needs **Application** permissions on the **SharePoint** API — see [Permissions](#permissions) below.

### 2. Fallback interactive sign-in

If no usable `doctor.json` is found, the extension falls back to a device-code interactive sign-in using the legacy settings:

```json
{
  "doctor-metadata.siteUrl": "https://contoso.sharepoint.com/sites/docs",
  "doctor-metadata.tenantId": "contoso.onmicrosoft.com",
  "doctor-metadata.clientId": "00000000-0000-0000-0000-000000000000"
}
```

Run **"Doctor: Configure Fallback Sign-in"** to set these interactively, then **"Doctor: Sign in to Microsoft 365 (fallback)"**. A browser window opens with a device code; after authenticating, your refresh token is stored securely in VS Code's `SecretStorage`. Run **"Doctor: Sign out (fallback)"** to clear it.

This app registration needs to be a **public client** (device code flow enabled) with **delegated** permissions on the **SharePoint** API — see [Permissions](#permissions) below.

## Permissions

This extension only calls the SharePoint site's own REST API (`_api/...`) — it has no Microsoft Graph dependency at all. Everything it needs (page column schema, taxonomy terms, and user search for Person/Group fields, including the `author` field) is site-scoped data, so it's all read straight from the site itself, authenticated against the `{siteUrl}/.default` resource. In your Entra app registration, grant these under the separate **"SharePoint"** API entry (**API Permissions → Add a permission → APIs my organization uses → SharePoint** — distinct from "Microsoft Graph" in that same list, even though some permission names look the same).

This extension only reads data, so the narrower, least-privilege application permissions are enough — you do **not** need `Sites.FullControl.All` just for this extension:

| Permission (under the **SharePoint** API) | Why it's needed |
|---|---|
| `TermStore.Read.All` | Taxonomy term store reads (`_api/v2.1/termStore/...`) |
| `Sites.Read.All` | Site page column schema (`_api/web/GetList(...)/fields`), the site user list search (`_api/web/siteusers`) used by every Person/Group field picker (including `author`), and general site access |

If your certificate/app registration is also used to run `doctor` itself (which writes/publishes pages), `Sites.ReadWrite.All` covers both this extension's reads and doctor's writes with a single grant — doctor's own docs suggest the broader `Sites.FullControl.All`, but `Sites.ReadWrite.All` has been confirmed working for doctor's actual publish/sync calls and is the least-privilege choice. Otherwise, if the two are on separate app registrations, prefer the read-only pair above for this extension.

Whichever auth mode you use, remember to **Grant admin consent for &lt;tenant&gt;** after adding these permissions — permissions with pending consent behave identically to missing ones.

Missing a permission produces a clear, non-silent error (an inline message in the relevant picker plus a `Doctor Metadata: ... failed — ...` toast naming the HTTP status and the server's own error message) rather than a picker that just hangs or silently returns nothing — see [Error handling philosophy](#error-handling-philosophy).

## Using the panel

1. Open a `.md` file that's part of a doctor-managed site.
2. Open the **Doctor Metadata** icon in the activity bar to reveal the "Page Details" panel.
3. The panel always shows the fixed set of **doctor front-matter fields** (title, description, draft, layout, header, template, type, menu, partials, localization, slug, author, comments) — these don't depend on SharePoint being reachable at all.
4. Below that, a **SharePoint metadata** section lists the site's other page columns (from the `metadata:` front matter block), fetched live via SharePoint REST. If auth isn't configured, hasn't finished loading yet, or fails, that section shows a clear status message instead of silently being empty.
5. Editing a field writes the value back into the front matter of the file that was open **when you started editing it** — even if you switch to a different file mid-edit, the write is still scoped to the original file (see [Cross-file safety](#cross-file-safety)).

### Field types and their editors

| SharePoint / doctor type | Editor |
|---|---|
| `Text`, `Note` | Text box / multi-line text box |
| `Number` | Number input |
| `Boolean` | Checkbox |
| `DateTime` | Date/time input |
| `Choice` | Dropdown, populated from the column's actual choice values |
| `TaxonomyFieldType(Multi)` | Taxonomy term picker (see below) |
| `User`, `UserMulti` | User/group picker (see below) |
| `DoctorHeader` | Structured editor matching doctor's actual header config shape (type, image, layout, …) — not a raw JSON blob |
| `DoctorJson`, `DoctorPartials`, `DoctorPageType` | Dedicated editors/dropdowns for each doctor-specific concept |

Dropdowns (Choice, DoctorPageType, header type, …) show a human-readable display name while writing the real underlying front-matter value.

### Picking taxonomy terms

Click the picker icon next to a taxonomy field to open a quick pick of that column's term set. If the field has an `anchorId` configured (restricting it to a sub-tree of the term set), only descendants of that anchor term are shown. A loading indicator appears next to the field while terms are being fetched; results are cached per term set so re-opening the picker doesn't always re-fetch from SharePoint.

### Picking users

There are two distinct user-picker flows, because SharePoint itself treats "users" differently depending on the field:

- **Custom Person/Group columns** (`User`/`UserMulti` schema fields other than `author`) search **site-scoped** users via SharePoint's own `_api/web/siteusers`, and write a **user principal name (UPN)** string (or array of UPNs) into the front matter — derived from the matched user's claims login name — doctor's own sync converts these into SharePoint claims tokens (`i:0#.f|membership|{upn}`) at publish time. Only users already granted access to this specific site show up (this extension does not search the tenant directory).
- **The `author` field** is different: it maps to SharePoint's reserved system `Author` column, which is a **lookup** into that specific site's User Information List and is only ever set via a raw **integer ID** (`AuthorId`), not a UPN — the same way SharePoint's own lookup fields work (`EditorId`, etc.). It uses the same `_api/web/siteusers` search (filtered to real users, excluding SharePoint/security groups), but writes the integer site user ID instead of a UPN.

### Editing the navigation entry

`menu` has its own editor instead of raw JSON. It writes the shape doctor expects:

```yaml
menu:
  QuickLaunch:
    id: tools
    weight: 1
    parent: documentation
```

- **Navigation** — quick launch or top navigation. A page belongs to one; switching moves the entry.
- **ID** — required, and the only field that is. It is what other pages point at as their `parent`,
  so without one the entry means nothing and the property is left out altogether.
- **Name** — shown in the menu instead of the page title.
- **Weight** — entries with a weight come first, lightest first; the rest follow alphabetically.
- **Parent** — the ID of the entry this page sits under. The box suggests the IDs the project's
  other pages already use, each with the page that defines it, so a parent can be picked rather than
  remembered. They are suggestions, not a closed list: a parent whose page has not been written yet
  is still allowed.

The suggestions come from reading the front matter of the markdown files under the content folder —
the navigation is rebuilt from those files on every publish, so they are the only place the IDs
exist before `doctor publish` runs.

## Editing doctor.json

`doctor.json` opens in a form rather than as text: every setting doctor understands, grouped by what
it is for — site, authentication, publishing, change detection, navigation, site design, markdown,
partials, multilingual, and output — each with the description from doctor's own schema.

A table of contents down the left lists those groups with the number of settings in each. It
follows along as you scroll, and a click jumps to the group, opening it if it was collapsed. In a
narrow editor it steps aside, so the settings get the full width.

It is still the same file. The form is a custom *text* editor, so each change is an ordinary edit to
`doctor.json`: undo, the unsaved-changes dot, save and Git all behave exactly as they do in the text
view. **Open as text** in the top right, or `Doctor: Open doctor.json as Text`, switches over at any
time, and `Doctor: Open doctor.json in the Config Editor` switches back. To always get the text view,
turn off `doctor-metadata.openConfigInEditor`.

A few things it does on purpose:

- **It only writes what changed.** A checkbox set back to its default removes the key rather than
  writing it out, and the file keeps its own indentation and line endings, so the diff shows the
  setting that moved and nothing else. Keys the schema does not know about are left untouched.
- **It never overwrites a file it cannot read.** If `doctor.json` is not valid JSON, the form says so
  and goes read-only until the text is fixed — otherwise the first edit would replace a half-typed
  file with a fresh object.
- **It keeps the credentials out of sight.** `password` is never shown, only whether it is set; typing
  replaces it. `certificate` is shown when it is a path to a `.pfx`, `.p12` or `.pem` file, since a
  path is not a secret, and masked when it is the base64 key itself.
- **Text is written when a box loses focus**, not per keystroke, so one change is one undo step.
- **A setting whose shape the schema leaves open** — `siteDesign.chrome`, `markdown.tocLevels` — is
  edited as JSON, and only written once it parses.

### Paths

Settings that hold a path — `folder`, `certificate`, `markdown.shortcodesFolder`, `partials.folder`,
`partials.header`, `partials.footer` and `siteDesign.logo` — get a **Browse…** button. What it writes
is the path the way doctor resolves *that* setting, which is not the same for all of them:

- most are written relative to `doctor.json` (`./src`, `../shared-docs`) — that is where doctor runs
  from, and a relative path keeps working on every machine that clones the repository;
- a certificate outside the project is written as an absolute path, since keeping the key out of the
  repository is usually the point of putting it there;
- `siteDesign.logo` is written relative to the content folder when it is inside it, because doctor
  looks there first;
- `partials.header` and `partials.footer` are written as a name when they are inside
  `partials.folder`, where doctor looks them up, and relative to `doctor.json` otherwise.

### Navigation items

`menu.QuickLaunch.items` and `menu.TopNavigationBar.items` are edited as a list of items — name, id,
URL and weight — rather than as JSON. These are the top of the navigation: doctor creates them
first, and a page whose `menu` front matter names one of their ids as its `parent` goes underneath.
Each item shows what doctor would do with it that is not what it looks like:

- **an item without a name is skipped**, and every page that sits under it with it;
- **an id with capitals or spaces cannot be a parent.** doctor lowercases a page's `parent` and drops
  its spaces before looking for it, but compares with the static ids as written — so `Getting
  Started` is never found, and doctor adds a second item called `gettingstarted`. The form offers
  the id that works;
- **`parent` on a static item is ignored** — these are always top level — and the form offers to
  remove it.

A new item gets its id from its name, already in the form a page can point at. Removing the last
item leaves an empty list rather than removing the key: an emptied `menu` would go with it, and
`menu` being there is what makes doctor build the navigation at all, page `menu` front matter
included.

The side panel's **Parent** suggestions include these ids, before the ones other pages define.

### Languages

`multilingual.languages` is edited as a list of languages rather than an array of numbers. The
choices are the languages SharePoint says the site can be switched to — fetched from
`_api/web/RegionalSettings/InstalledLanguages` — so a language Microsoft adds shows up without anyone
updating a list. Anything not on it can still be added by its LCID.

The list loads by itself when the side panel is already signed in for this project. Otherwise the
form starts from doctor's own table of 48 languages and offers **Load from SharePoint**; signing in can
mean asking for the certificate password, so that only happens when you click it.

What the form adds is always written as an LCID. doctor passes any LCID through, but only understands
a language *name* that is in its own table, so a language SharePoint offers and doctor's table lacks
would fail the publish if it were written by name. Entries already in the file keep the form they
were written in; one doctor cannot resolve is flagged, and when the language is known the form
offers to swap it for its LCID.

The form is built from doctor's own `schema/2.1.0.json`, bundled into the extension, so a setting
added to the schema appears in the form without any form changes. Anything no group names lands under **Other** rather
than being left out.

## Running doctor

**Publish** and **Status** are in the side panel's title bar and at the top of the `doctor.json`
editor, and in the palette as `Doctor: Publish`, `Doctor: Publish All Pages` (`--forceAll`) and
`Doctor: Show Publish Status`.

Each runs as a VS Code task in the folder that holds the project's `doctor.json` — that is where doctor
looks for it, rather than the workspace root — so a workspace with several doctor projects runs the
right one, and asks which when nothing open says. The task terminal takes input, so doctor can still
ask for a certificate password the way it does on the command line.

Publishing with unsaved files asks first, since doctor publishes what is on disk. That includes
`doctor.json` itself: change a setting in the editor and press Publish without saving, and doctor
would otherwise run with the old one.

Which `doctor` runs:

1. `doctor-metadata.doctorCommand`, when it is set — a local build, for instance;
2. otherwise the project's own `node_modules/.bin/doctor`, so a pinned version is the one that runs;
3. otherwise the global `doctor` (`npm i -g @estruyf/doctor`).

It never falls back to `npx doctor`: without a local install that resolves against the npm registry,
where `doctor` is an unrelated package.

### The certificate password

A password-protected certificate needs its password for doctor too, and the buttons hand doctor the
same one the panel signs in with: `password` in `doctor.json` when there is one (doctor reads that
itself), otherwise the `doctor-metadata.certificatePassword` setting, otherwise the password the
extension stored after asking you for it. With none of those, doctor asks in the task terminal.

It is passed in the `DOCTOR_CERTIFICATE_PASSWORD` environment variable, never on the command line —
there it would be printed by the task terminal and visible in the process list for the whole run.
This needs doctor 2.3.0 or later; an older doctor ignores the variable and asks for the password
itself. If a stored password has gone stale, `Doctor: Clear Stored Certificate Password` forgets it.

## Shortcode completion

In a markdown file inside a doctor project, typing `<` offers the shortcodes that project has:
`callout`, `icon`, `toc` and `mermaid`, which doctor ships, plus every shortcode in the folder
`markdown.shortcodesFolder` points at (`./shortcodes` by default). Typing a space inside the tag
offers that shortcode's attributes, leaving out the ones already written. Hovering a tag says what
it is, which kind it is, and where it came from.

A shortcode that becomes its own SharePoint web part (`kind: "webpart"`) is labelled as such and is
inserted on a line of its own, which is where doctor requires it. A shortcode that wraps content is
inserted as a pair.

### Where the attribute list comes from

A shortcode is a JavaScript module, so the extension reads it rather than running it — the file is
somebody's source and a module may do anything on import. That means the attribute list is as good
as the source is readable: it finds `attrs.count`, `attributes["path"]` and destructured parameters,
and marks those suggestions as read from the code.

To make it exact, list them on the shortcode itself:

```javascript
module.exports = {
  name: "related-pages",
  kind: "webpart",
  attributes: ["count", "path", "query"],
  render: (attributes) => ({ ... }),
};
```

`attributes` is only read by this extension; doctor ignores it.

## Front matter format

```markdown
---
title: Page Title
description: Page description
author: 5
metadata:
  department: Finance
  owner: john@contoso.com
  status: Approved
---

# Your page content
```

Complex field values:
- **Taxonomy (single)**: plain string label — `Finance`
- **Taxonomy (multi)**: list of label strings — `["Engineering", "Documentation"]`
- **User (single, custom Person field)**: UPN string — `"user@contoso.com"`
- **User (multi, custom Person field)**: array of UPNs — `["user1@contoso.com", "user2@contoso.com"]`
- **`author`**: a raw integer site user ID — `5` (not a UPN, not a claims string)

## Commands

| Command | Purpose |
|---|---|
| **Doctor: Configure Fallback Sign-in** | Set the `siteUrl`/`tenantId`/`clientId` settings for the fallback interactive auth path |
| **Doctor: Sign in to Microsoft 365 (fallback)** | Device-code sign-in when no `doctor.json` certificate auth is available |
| **Doctor: Sign out (fallback)** | Clears the stored fallback refresh token |
| **Doctor: Refresh Column Schema** | Clears the cached site column schema/taxonomy data; run this after your site schema changes |
| **Doctor: Clear Stored Certificate Password** | Forces a fresh certificate-password prompt (e.g. after rotating the certificate) |
| **Doctor: Pick Taxonomy Term** | Normally triggered from the panel's picker icon |
| **Doctor: Pick User / Group** | Normally triggered from the panel's picker icon |

## Cross-file safety

Fields are always read from, and written to, the specific `vscode.TextDocument` that was active when a field edit/picker started — not "whatever the active editor happens to be when the async operation finishes." This means quickly switching files while a term/user picker is open, or while a field write is in flight, can't cause a value meant for one file to be written into a different file.

## Error handling philosophy

**No error in this extension is ever silently swallowed.** Every failure — a failed schema fetch, a failed taxonomy/user search, a failed certificate parse, a malformed front-matter write — either recovers safely and visibly (e.g. showing a status message in the panel) or surfaces as a `vscode.window.showErrorMessage`/inline picker error describing what went wrong (including the underlying HTTP status and server error message for SharePoint REST failures), so a broken picker never just looks like "no results" or hangs indefinitely.

## Troubleshooting

### "Site not found" / 403s from SharePoint REST
- Verify the site URL (`doctor.json`'s `url`, or the `doctor-metadata.siteUrl` fallback setting) is correct.
- Confirm the app registration has been granted (and admin-consented) all the permissions listed in [Permissions](#permissions) — a 403 with "Insufficient privileges" almost always means a missing/unconsented permission, not a code bug.
- For the taxonomy picker specifically, remember `TermStore.Read.All` must be granted under the **SharePoint** API — see [Permissions](#permissions).

### Certificate auth keeps prompting for a password
- The stored password may no longer match the certificate (e.g. it was rotated). Run **"Doctor: Clear Stored Certificate Password"** and re-enter the current password.
- If you don't want to be prompted at all, set the password directly in `doctor.json` or the `doctor-metadata.certificatePassword` setting.

### No fields showing / "SharePoint metadata" section stuck
- Run **"Doctor: Refresh Column Schema"** to rebuild the cached schema.
- Check the panel for an explicit status message — auth-not-configured, still-loading, and failed states are all shown distinctly rather than an empty list.

### Sign-in not working (fallback mode)
- Ensure device code flow is enabled in your Entra app registration and it's configured as a public client.
- Verify the tenant ID and client ID are correct.

## Development

The extension lives in `apps/doctor-vscode` of the [doctor repository](https://github.com/estruyf/doctor),
next to the CLI. Install once from the repository root, then work in `apps/doctor-vscode`:

```bash
npm install          # at the repository root
npm run compile      # type check, lint and bundle
npm run watch        # bundle on every change
npm test             # vitest, once
npm run test:watch
```

### Debugging

Open the repository root in VS Code and run **Run the extension** (`F5`) to open the Extension
Development Host. Set breakpoints in the code and they will be hit.

## How it relates to Doctor

Doctor reads YAML front matter from Markdown files and syncs them to SharePoint. Fields are mapped to page column values, transformed based on type (e.g. term GUIDs, claim tokens, site user IDs), and published. This extension exists purely to help authors get those values right up front, without manual GUID/ID lookups or guessing doctor's expected value shapes.

See https://getdoctor.io for more information about Doctor and the publishing pipeline.

## License

MIT, like doctor itself.
