---
title: doctor.json
description: Every setting of the doctor.json file — what it does, its default, and what to know before you change it.
sidebar:
  order: 2
---

The `doctor.json` file sits in the root of your project and holds the settings which stay the same on every run. It gets created for you when you initialize your project with [`doctor init`](../../cli/#init).

This page describes every setting the file can hold. The [JSON schema](#editor-support) describes the same settings in one line each; this page is where they are explained.

## How settings are read

`doctor` reads `doctor.json` from the folder you run it in, and every setting is merged in this order:

1. the **argument** on the command execution, like `--folder ./docs`;
2. the value in **`doctor.json`**;
3. the **default**.

An argument always wins, so a pipeline can override a single setting without touching the file. Use the whole argument names in `doctor.json` (`skipExistingPages`, not `--skipExisting`).

:::caution[Important]
An on/off flag on the command execution can only switch a setting **on**. When `doctor.json` sets `forceAll` to `true`, leaving out `--forceAll` does not turn it off — change the file instead.
:::

Paths in `doctor.json` (`folder`, `certificate`, `markdown.shortcodesFolder`, `partials.folder`) are taken relative to the folder `doctor` runs in, which is the one holding the `doctor.json` file. Exceptions are called out with the setting.

Some options only exist on the command execution — `--debug`, `--confirm`, `--cleanStart`, `--cleanEnd`, `--outputFolder`, `--skipPages`, `--skipNavigation` and `--skipSiteDesign`. They are ignored when you put them in `doctor.json`. The [CLI options](../cli-options) page lists them.

### Editor support

Point `$schema` at the schema of the version you run to get autocompletion and the short description of every setting in your editor:

```json
{
  "$schema": "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/2.1.0.json"
}
```

### A complete example

```json
{
  "$schema": "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/2.1.0.json",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  "appId": "<appId>",
  "tenant": "<tenant>",
  "certificate": "./cert.pfx",
  "folder": "./src",
  "library": "Shared Documents",
  "webPartTitle": "doctor-placeholder",
  "pageTemplate": "",
  "reapplyTemplates": false,
  "skipExistingPages": false,
  "overwriteImages": false,
  "disableComments": false,
  "continueOnError": false,
  "retryWhenFailed": false,
  "skipPrecheck": false,
  "applyTheme": false,
  "forceAll": false,
  "removeDeleted": false,
  "disableStatePersistence": false,
  "stateFile": ".doctor/state.json",
  "cleanQuickLaunch": false,
  "cleanTopNavigation": false,
  "commandTimeout": 120000,
  "verbose": false,
  "timingDetails": false,
  "markdown": { "allowHtml": true },
  "menu": { "QuickLaunch": { "items": [] } }
}
```

### All settings at a glance

| Setting | Default | Section |
| --- | --- | --- |
| `url` | — | [Site and content](#url) |
| `folder` | `./src` | [Site and content](#folder) |
| `library` | `Shared Documents` | [Site and content](#library) |
| `webPartTitle` | `doctor-placeholder` | [Site and content](#webparttitle) |
| `auth`, `appId`, `tenant`, `certificate`, `password` | — | [Authentication](#authentication) |
| `pageTemplate`, `reapplyTemplates` | none, `false` | [Pages](#pagetemplate) |
| `skipExistingPages` | `false` | [Pages](#skipexistingpages) |
| `overwriteImages` | `false` | [Pages](#overwriteimages) |
| `disableComments` | `false` | [Pages](#disablecomments) |
| `continueOnError`, `retryWhenFailed`, `skipPrecheck` | `false` | [Running a publish](#running-a-publish) |
| `forceAll`, `removeDeleted`, `disableStatePersistence`, `stateFile` | `false`, `false`, `false`, `.doctor/state.json` | [Change detection](#change-detection) |
| `output`, `verbose`, `timingDetails` | `default`, `false`, `false` | [Output](#output-and-diagnostics) |
| `commandName`, `commandTimeout` | `m365`, `120000` | [Output](#commandname) |
| `multilingual` | — | [Multilingual](#multilingual) |
| `siteDesign`, `applyTheme` | —, `false` | [Site look and feel](#site-look-and-feel) |
| `markdown` | — | [Markdown publishing settings](#markdown-publishing-settings) |
| `partials` | — | [Reusable content partials](#reusable-content-partials) |
| `menu`, `cleanQuickLaunch`, `cleanTopNavigation` | —, `false`, `false` | [Global navigation structure](#global-navigation-structure) |

## Site and content

### `url`

`string` · flag `-u, --url`

The site collection the pages are published to, like `https://contoso.sharepoint.com/sites/documentation`. Required for every command which talks to SharePoint.

### `folder`

`string` · default `./src` · flag `-f, --folder`

The folder holding your markdown files. Everything under it is published, and its structure decides where pages and images end up:

- a page's URL is its folder inside this one plus its title — `src/guides/setup.md` with the title *Set up* becomes `sitepages/guides/set-up.aspx` — unless it sets a [`slug`](../../content/pages/);
- referenced images are uploaded to the same folders inside the [`library`](#library).

Moving this folder, or pointing it somewhere else, changes the URL of every page.

### `library`

`string` · default `Shared Documents` · flag `--library`

The document library on the site where `doctor` keeps everything that is not a page:

| What | Where in the library |
| --- | --- |
| Images your pages reference | the same folders as in [`folder`](#folder) — `src/guides/img/a.png` goes to `guides/img/a.png` |
| The site logo | `site/` |
| Rendered [Mermaid](../../content/shortcodes/mermaid/) diagrams | `mermaid/` |
| The [publish state](#change-detection) | [`stateFile`](#statefile), `.doctor/state.json` by default |

Changing it on an existing site means the next run uploads the images again to the new library, and starts without the publish state it kept in the old one — so every page is published again.

### `webPartTitle`

`string` · default `doctor-placeholder` · flag `--webPartTitle`

The title `doctor` gives the Markdown web part it puts on each page. It is not a heading on the page: it is a property of the web part itself, stored with the page's web parts.

`doctor` uses it to recognise its own web part. On a page it published before, it normally knows its web parts by the ids it recorded in the [publish state](#change-detection), but when there is no recorded id — a page published by a version of `doctor` from before the ids were recorded, a state file that was removed, or a run with [`disableStatePersistence`](#disablestatepersistence) — it falls back to finding the web part with this title. A page cut into several web parts by [web part shortcodes](../../content/shortcodes/webpart/) gets numbered titles after the first: `doctor-placeholder (2)`, `doctor-placeholder (3)`.

:::caution[Important]
Pick it once. Changing it marks every page as changed, and on a page where `doctor` has no recorded id to go on, it no longer recognises the web part with the old title: it adds a new one and leaves the old one where it is.
:::

A web part added on the SharePoint side with the same title is left alone once `doctor` has recorded the ids of its own.

## Authentication

`doctor` signs in with the certificate of your own Entra app registration. The [CLI options](../cli-options/#authentication) page describes each of these in full, and the [certificate authentication](../../getting-started/certificate-authentication) guide covers setting up the app registration.

| Setting | What it holds |
| --- | --- |
| `auth` | The authentication type. `certificate` is the only one, so it can be left out. |
| `appId` | The ID of the Entra app registration. Required. |
| `tenant` | The ID of the tenant. Required. |
| `certificate` | A path to a `.pfx`, `.p12` or `.pem` file, relative to the `doctor.json` folder — or the base64 contents of the certificate. Anything not ending in one of those extensions is read as base64. |
| `password` | The password of the certificate, when it has one. |

:::caution[Important]
`doctor.json` is usually committed. Keep the password out of it: `doctor` reads it from the `DOCTOR_CERTIFICATE_PASSWORD` environment variable when neither `--password` nor `doctor.json` has one. A certificate file is better kept outside the repository, too — an absolute path works.
:::

## Pages

### `pageTemplate`

`string` · default none · flag `--pageTemplate`

The [page template](../../content/pages/#page-templates) new pages are created from: the template's page title, its file name or its page id. A page can name another one with its `template` front matter. Without a template, pages start blank.

### `reapplyTemplates`

`boolean` · default `false` · flag `--reapplyTemplates`

Also applies the page template to pages which already exist, not only to the ones `doctor` creates. The template's sections become the page layout on every publish, with the page's own content and banner kept. The template is then part of what a page is [tracked by](#change-detection), so a changed template publishes its pages again.

### `skipExistingPages`

`boolean` · default `false` · flag `--skipExistingPages`, `--skipExisting`

Only creates pages which do not exist yet. A page which is already on the site is not updated at all — not its content, its metadata nor its web parts — even when its markdown changed. Translations are still processed.

Useful for seeding a site once and handing the pages over to their owners afterwards; for a site published from markdown on every change, leave it off.

### `overwriteImages`

`boolean` · default `false` · flag `--overwriteImages`

Uploads every referenced image again, replacing the file in the [`library`](#library). The same goes for the site logo and the Mermaid diagrams.

When it is off, an image whose file name already exists in its folder in the library is not uploaded again. Editing an image while keeping its name then publishes the pages using it again, but they keep showing the old image until you turn this on for a run, or give the image a new name.

### `disableComments`

`boolean` · default `false` · flag `--disableComments`

Turns comments off on every page. A page's own `comments` front matter wins over it, in both directions. It is applied whenever a page is published, so it also changes pages which already exist.

## Running a publish

### `continueOnError`

`boolean` · default `false` · flag `--continueOnError`

Carries on with the next page when one fails, instead of stopping the run. The failing files are listed at the end, and they are not recorded as published, so the next run tries them again.

:::caution[Important]
A run which continued past a failure still exits with code `0`. In a pipeline, use [`--output json`](../cli-options/#json-output) and check `success`, which is `false` when any page failed.
:::

### `retryWhenFailed`

`boolean` · default `false` · flag `--retryWhenFailed`

Retries a SharePoint command which failed, once, after five seconds. SharePoint occasionally refuses a request it accepts a moment later; this saves running the whole publish again for that.

### `skipPrecheck`

`boolean` · default `false` · flag `--skipPrecheck`

Skips the [checks](../cli-options/#pre-process-checks) which run before anything is written: unreadable files, broken front matter, missing titles, duplicate slugs and missing translation files, plus the check that the app has the permissions the run needs. Leaving them on is what keeps a run from failing halfway through.

## Change detection

`doctor` keeps a state file in the [`library`](#library) with a fingerprint of everything each page was built from, so a publish only processes pages which are new or changed. The [change detection](../cli-options/#change-detection--publish-state) section lists what counts as a change.

### `forceAll`

`boolean` · default `false` · flag `--forceAll`

Publishes every page, whether it changed or not. Meant for a single run — after changing something outside the markdown that `doctor` does not track, for instance. Set in `doctor.json`, it turns change detection off for every run.

### `removeDeleted`

`boolean` · default `false` · flag `--removeDeleted`

Recycles the pages `doctor` published before whose markdown file no longer exists. They go to the site's recycle bin. Even when it is set here, the removal still needs `--confirm` on the command execution, or `doctor` asks. See [removing deleted pages](../cli-options/#removing-deleted-pages).

### `disableStatePersistence`

`boolean` · default `false` · flag `--disableStatePersistence`

Neither reads nor writes the state file. Every page is published on every run, `removeDeleted` has nothing to go on, and `doctor` recognises its own web parts by [`webPartTitle`](#webparttitle) only.

### `stateFile`

`string` · default `.doctor/state.json` · flag `--stateFile`

Where the state file is kept, as a path inside the [`library`](#library) — so `Shared Documents/.doctor/state.json` by default. It is a SharePoint path, not one on your disk. Two projects publishing to the same site and library need a state file each.

## Output and diagnostics

### `output`

`default` | `json` · default `default` · flag `--output`

With `json`, the readable output is silenced and the run writes one [JSON document](../cli-options/#json-output) to stdout. Best passed on the command execution: set here, every local run reports JSON as well.

### `verbose`

`boolean` · default `false` · flag `--verbose`

Keeps every task and its output visible instead of collapsing the task list, and makes `doctor status` list the unchanged files as well.

### `timingDetails`

`boolean` · default `false` · flag `--timingDetails`

Adds the average, fastest and slowest page to the summary at the end of a publish. The total time is always shown.

### `commandName`

`string` · default `m365` · flag `--commandName`

How the CLI for Microsoft 365 is run. `m365` and `localm365` use the copy bundled with `doctor`, in the same process. Any other value is run as a program on your `PATH` — only needed when you deliberately want a different installation.

### `commandTimeout`

`number` · default `120000` · flag `--commandTimeout`

How long, in milliseconds, a single SharePoint command may take before `doctor` gives up on it. Raise it when you see `Command timed out after 120000ms` on a large site or a slow connection. An invalid value logs a warning and uses the default.

## Multilingual

`doctor` can create the translations of your pages. Turn it on with the `multilingual` setting:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": [1043, "fr-fr"],
    "overwriteTranslationsOnChange": true
  }
}
```

`enableTranslations`
: `boolean`, default `false`. Turns the multilingual feature of the site on when it is off, enables the `languages`, and publishes the translations your pages link to in their [`localization`](../../content/multilingual) front matter. When it is off, `localization` is ignored. Turning it off does not switch the feature off on the site.

`languages`
: The languages to enable on the site, as LCIDs (`1043`) or locale names (`"nl-nl"`) — the same names the `localization` front matter uses. An overview of the LCIDs is in [Supported LCIDs by SharePoint](https://github.com/pnp/PnP-PowerShell/wiki/Supported-LCIDs-by-SharePoint).

  This is the complete list: `doctor` enables exactly these on the site, so a language you remove here is removed from the site as well. A page translating into a language that is not in the list is skipped with a warning. A name `doctor` cannot resolve stops the run; an LCID is passed to SharePoint as it is.

`overwriteTranslationsOnChange`
: `boolean`. The SharePoint site setting of the same name: whether a change to the text of a default-language page overwrites the existing translations. When you leave it out, `doctor` does not change it.

`translator`
: The [Azure Translator](../../content/multilingual/#using-azure-translator-service) service to machine translate with — `key`, `endpoint` and `region`. It translates the locales a page lists in `localization` without linking a file to them. A page which only links its own translation files does not need it.

  The key is a secret. When `doctor.json` is committed, keep the key out of it and have your pipeline write it in from a secret before `doctor` runs.

Machine translation example:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": [1043],
    "overwriteTranslationsOnChange": true,
    "translator": {
      "key": "<subscription key>",
      "endpoint": "https://api.cognitive.microsofttranslator.com/",
      "region": "<region name, example: westeurope>"
    }
  }
}
```

:::note[Info]
Check out the [multilingual](../../content/multilingual) section to see how the pages themselves are linked to each other.
:::

## Site look and feel

The `siteDesign` setting changes the site itself rather than the pages. `logo`, `theme` and `chrome` are each optional, and one you leave out is not touched.

```json
{
  "siteDesign": {
    "logo": "./assets/doctor.png",
    "theme": "Red",
    "chrome": {
      "headerLayout": "Compact",
      "headerEmphasis": "Darkest",
      "disableMegaMenu": false,
      "disableFooter": false
    }
  }
}
```

`logo`
: The image to use as the site logo. It is looked for relative to [`folder`](#folder) first, and then relative to the `doctor.json` folder. It is uploaded to `site/` in the [`library`](#library); see [`overwriteImages`](#overwriteimages) for replacing it under the same name. An empty value, `""`, removes the site's logo.

`theme`
: The name of a theme to apply: a custom theme of your tenant, or one of the themes SharePoint ships with. Only applied when [`applyTheme`](#applytheme) is on.

`chrome`
: The header and footer:

  - `headerLayout` — `Standard`, `Compact`, `Minimal` or `Extended`.
  - `headerEmphasis` — the header background: `Lightest`, `Light`, `Dark` or `Darkest`.
  - `logoAlignment` — `Left`, `Center` or `Right`. Only used with the `Extended` header.
  - `footerLayout` — `Simple` or `Extended`.
  - `footerEmphasis` — the footer background: `Lightest`, `Light`, `Dark` or `Darkest`.
  - `disableMegaMenu` — use the cascading (classic) navigation instead of the mega menu.
  - `hideTitleInHeader` — hide the site title in the header.
  - `disableFooter` — hide the footer.

  `doctor` only sends the last three when they are `true`, so `false` is the same as leaving them out.

### `applyTheme`

`boolean` · default `false` · flag `--applyTheme`

Applies `siteDesign.theme`. It is separate because SharePoint rejects a theme name the tenant does not know, which used to fail the whole run; since v2.0.0 a theme is only applied when you ask for it. The logo and chrome are applied without it.

:::note[Info]
The site design is applied by an account that needs rights to change the site. When it does not have them, `doctor` reports it and the pages are still published.
:::

## Markdown publishing settings

The `markdown` setting decides who turns your markdown into HTML. By default SharePoint's Markdown web part does; `allowHtml` lets `doctor` do it, which is what makes [shortcodes](../../content/shortcodes), the extended syntax and the table of contents possible.

```json
{
  "markdown": {
    "allowHtml": true,
    "theme": "light",
    "shortcodesFolder": "./shortcodes",
    "tocLevels": [1, 2, 3, 4],
    "extended": true
  }
}
```

`allowHtml`
: `boolean`, default `false`. Renders the HTML with `doctor` instead of SharePoint. The web part still holds your markdown, next to the HTML `doctor` rendered from it. Most of the settings below only apply with this on.

`theme`
: `Dark` or `Light`, default `Dark`. The colours of the code blocks, and of the Markdown web part's editor. Case does not matter.

`shortcodesFolder`
: Default `./shortcodes`, relative to the `doctor.json` folder. Where your own [shortcodes](../../content/shortcodes/#provide-your-own-shortcodes) are loaded from. A missing folder simply means no custom shortcodes. Changing a shortcode publishes every page again, as `doctor` cannot know which pages it changes.

`tocLevels`
: Default `[1, 2, 3, 4]`. The heading levels the [table of contents](../../content/shortcodes/toc/) lists.

`extended`
: `boolean`, default `true`. Renders the [extended markdown syntax](../../content/markdown-syntax): emoji shortcodes, highlighted text, footnotes, definition lists and task lists. Set it to `false` for the basic syntax only.

:::caution[Important]
Without `allowHtml`, SharePoint renders your markdown, and its web part only supports the basic markdown syntax — `extended`, `tocLevels` and shortcodes do nothing.
:::

:::caution[Important]
When `doctor` renders the HTML, edit the pages in markdown only. An edit to the web part on SharePoint is overwritten on the next publish.
:::

## Reusable content partials

The `partials` setting configures the markdown snippets you reuse across pages. More information can be found on the [partials](../../content/partials) page.

```json
{
  "partials": {
    "folder": "./partials",
    "header": "banner",
    "footer": "navigation"
  }
}
```

`folder`
: Default `./partials`, relative to the `doctor.json` folder. Where a partial named without a path — `<include file="banner" />` — is looked up.

`header`
: The partial added at the top of every page. A name, like `banner`, is looked up in `folder`, with `.md` added when there is no extension. A path starting with `./` or `../` is taken from the `doctor.json` folder — unlike an `<include>`, which is taken from the page's folder — and one starting with `/` from [`folder`](#folder), your sources folder.

`footer`
: The partial added at the bottom of every page, found the same way as `header`.

:::note[Info]
Pages can skip the automatically added partials with the `partials` front matter property. A changed partial publishes every page using it again.
:::

## Global navigation structure

The `menu` setting turns on the site navigation, and holds the items `doctor` puts at the top of it. Pages add themselves under those items with their own [`menu` front matter](../../content/pages/#menu).

```json
{
  "menu": {
    "QuickLaunch": {
      "items": [
        {
          "id": "documentation",
          "name": "Documentation",
          "url": ""
        }
      ]
    }
  }
}
```

:::caution[Important]
The `menu` property is what enables the navigation. When it is not defined in the `doctor.json` file, the page level `menu` front matter is ignored. To have only pages in the navigation, keep it with empty `items`.
:::

`QuickLaunch` is the navigation on the left of the site, `TopNavigationBar` the one at the top. Each holds an `items` list of static items:

`name`
: What the navigation shows. **Required**: an item without a name is skipped, and so is every page under it.

`id`
: What a page's `menu.parent` names to sit under this item. Write it in **lowercase without spaces**: `doctor` lowercases a page's `parent` and drops its spaces before it looks for the item, but compares with the id exactly as you wrote it. With `"id": "Getting Started"`, a page with `parent: Getting Started` looks for `gettingstarted`, does not find it, and `doctor` adds a second item named `gettingstarted`.

`url`
: Where the item links to. Leave it empty for a heading which only holds the pages under it.

`weight`
: The order. Items with a weight come first, lowest first; items without one follow, alphabetically by name. `0` counts as no weight.

A static item is always at the top level, so `parent` on one is ignored. A page whose `menu` uses the `id` of a static item, without a `parent`, takes that item over — its name and link become the page's — which is how a heading can link to an overview page.

How the navigation is updated on SharePoint:

- `doctor` replaces the top-level nodes it is about to create: an existing node with the same title is removed first, with everything under it. Other nodes are left alone — including ones `doctor` created on an earlier run for an item you have since removed.
- `QuickLaunch` holds up to three levels: a static item and two levels of pages below it. Deeper pages are not added.
- Draft pages are never added to the navigation.
- Changing the navigation needs more rights than publishing pages. When the account does not have them, `doctor` reports it and leaves the navigation as it is; the pages are still published.

### `cleanQuickLaunch`

`boolean` · default `false` · flag `--cleanQuickLaunch`

Removes **every** node from the quick launch before the navigation is created — also the ones somebody added on SharePoint by hand. Use it when `doctor` owns the whole navigation, so items you removed from your markdown or `doctor.json` disappear from the site as well.

### `cleanTopNavigation`

`boolean` · default `false` · flag `--cleanTopNavigation`

The same, for the top navigation.
