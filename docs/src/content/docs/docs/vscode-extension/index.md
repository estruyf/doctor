---
title: VS Code extension
description: Edit a page's front matter and doctor.json in VS Code, with pickers for your SharePoint columns, and run doctor from the editor.
---

**Doctor — Markdown to SharePoint Pages** is a VS Code extension for writing what `doctor` reads. It knows the front
matter `doctor` understands and the columns of your SharePoint site, so you pick values instead of looking
up term ids and user names by hand.

## What it does

- **A side panel for the open page.** The **Doctor** icon in the activity bar shows the front
  matter of the markdown file you have open: `doctor`'s own fields (title, description, draft, homepage,
  layout, header, template, menu, partials, localization, slug, author, comments) and, under
  **SharePoint metadata**, the other columns of your Site Pages library. Each gets the right control: a
  text box, a choice list, a term picker for managed metadata, a people picker for person columns. Edits
  are written straight into the file's front matter.
- **A form for `doctor.json`.** `doctor.json` opens as a form with every setting from the
  [doctor.json schema](/docs/configuration/doctor-json/), grouped and described. It is still the same
  file: undo, save and Git work as usual, and **Open as text** switches back to the JSON at any time.
- **Shortcode completion.** Typing `<` in a markdown file offers the [shortcodes](/docs/content/shortcodes/)
  `doctor` ships and the ones in your `markdown.shortcodesFolder`, with their attributes.
- **Publish and status.** **Publish**, **Publish All Pages** (`--forceAll`) and **Show Publish Status**
  run `doctor` as a VS Code task in the folder that holds your `doctor.json`.

## Install

Install [Doctor — Markdown to SharePoint Pages](https://marketplace.visualstudio.com/items?itemName=eliostruyf.vscode-doctor)
from the Visual Studio Marketplace, or search for `eliostruyf.vscode-doctor` in the Extensions view of
VS Code. From a terminal:

```bash
code --install-extension eliostruyf.vscode-doctor
```

### From source

To try changes that are not released yet, build the `.vsix` from the
[doctor repository](https://github.com/estruyf/doctor):

```bash
git clone https://github.com/estruyf/doctor
cd doctor
npm install
cd apps/doctor-vscode
npm run package
```

Then, in VS Code, open the Extensions view, choose **…** > **Install from VSIX…** and pick the
`vscode-doctor-<version>.vsix` it created.

## Sign in

The extension reads the site and its columns with the same app registration `doctor` uses. When it finds a
`doctor.json` with [certificate authentication](/docs/getting-started/certificate-authentication/) (`url`,
`appId`, `tenant`, `certificate`), it signs in with that. A certificate that needs a password and has none
in `doctor.json` asks for it once and keeps it in VS Code's secret storage.

The app registration needs `Sites.Read.All` and `TermStore.Read.All` on the **SharePoint** API. The
`Sites.FullControl.All` or `Sites.ReadWrite.All` you gave `doctor` already covers both.

Without a usable `doctor.json`, run **Doctor: Configure Fallback Sign-in** to sign in with a device code
instead.

## Which doctor it runs

1. the `doctor.doctorCommand` setting, when it is set
2. otherwise the project's own `node_modules/.bin/doctor`, so a pinned version is the one that runs
3. otherwise the global `doctor` (`npm i -g @estruyf/doctor`)

## Settings

| Setting | What it does |
| --- | --- |
| `doctor.doctorCommand` | The command that runs `doctor`, for instance a local build |
| `doctor.openConfigInEditor` | Open `doctor.json` in the form (default) or as text |
| `doctor.certificatePassword` | The certificate password, when `doctor.json` has none. Set it in your user settings, never commit it |
| `doctor.siteUrl`, `doctor.tenantId`, `doctor.clientId` | The fallback sign-in, only used without a usable `doctor.json` |

The extension's [README](https://github.com/estruyf/doctor/tree/dev/apps/doctor-vscode#readme) goes into
every field type, the permissions and troubleshooting in more detail.
