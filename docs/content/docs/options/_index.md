---
title: Options
date: 2021-02-22T10:06:07.167Z
lastmod: 2026-08-04T00:00:00.000Z
weight: 4
draft: false
keywords:
  - ""
---

Options are specified via command arguments, or within a `doctor.json` file (automatically gets created on initialization `doctor init`).

## For all commands

`-a, --auth <auth>`
: Specify the authentication type to use. Values can be `deviceCode` (default) or `certificate`.

> **Info**: Check out the [Certificate Authentication](../certificate-authentication) section for more information about using the `certificate` approach.

`-u, --url <url>`
: The URL of the site collection to use.

`--library <library>`
: Specified the library which you want to use in SharePoint to store your referenced images.

`-f, --folder <folder>`
: The folder location in where you will create your markdown files.

`--webPartTitle <webPartTitle>`
: This defined the title of the markdown web part to be created/updated on the page. Default value is: `doctor-placeholder`.

`--overwriteImages`
: Specifies if you allow `doctor` to overwrite the images in the SharePoint library that are referenced in the markdown files.

`--debug`
: Provides more information of what is happening during command execution.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--verbose`
: Provides extended logging output. When enabled, the task list is rendered with the verbose renderer, so every task and its output stays visible instead of being collapsed. For the `doctor status` command, this flag also lists the unchanged files.

`--continueOnError`
: Continue when an error occurs during the publishing process.

## Publish command specific options

`--outputFolder <outputFolder>`
: When providing this option, the processed markdown files will be generated in this folder.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--cleanEnd`
: Removes the pages which have not been touched during the publishing run. This will happen at the end of the whole process.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--cleanStart`
: Removes all pages before creation. This ensures that you that all changes made to your documentation get removed.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--confirm`
: Don't prompt for confirming removing the files when you specified to clean up pages and assets before publishing.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--commandName <commandName>`
: Override the command used to execute `CLI for Microsoft 365`. By default, `doctor` executes commands through the bundled `@pnp/cli-microsoft365` API directly. Use this option only when you explicitly want to run a different command binary.

`--skipExistingPages`
: Will not overwrite pages if they already existed on the site. The shorter `--skipExisting` alias can be used as well.

`--forceAll`
: Reprocess all pages, ignoring the saved publish state. By default `doctor` only publishes pages which are new or whose content changed since the last run. Check the [change detection](#change-detection--publish-state) section for more information.

`--skipPrecheck`
: Skips the pre-process validation which runs before any SharePoint calls are made. Check the [pre-process checks](#pre-process-checks) section for more information.

`--timingDetails`
: Shows additional per-page timing statistics (average, fastest and slowest page) after the publishing run. The total publishing time is always shown, also without this flag.

`--applyTheme`
: Applies the theme defined in the `siteDesign.theme` property of your `doctor.json` file.

> **Important**: Since v2.0.0 the theme is no longer applied automatically. SharePoint returns an error when the theme name is not known on the tenant, which would fail the whole publishing run. When you defined a theme but did not pass this flag, `doctor` logs that it skipped applying it. All other `siteDesign` settings (logo and chrome) are still applied without this flag.

`--retryWhenFailed`
: Specifying this flag will retry the command if it failed. In some cases it can be that SharePoint failes to process your request, and this allows you to try again without running the whole flow from scratch.

`--skipPages`:
: This flag allows you to skip the pages provisioning in the publish flow.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--skipNavigation`:
: This flag allows you to skip setting the navigation in the publish flow.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--skipSiteDesign`:
: This flag allows you to skip setting the site its look and feel in the publish flow.

> **Important**: This flag can only be added to the command execution. Using it in the `doctor.json` fill will be ignored.

`--cleanQuickLaunch`
: Allows you to specify if you want to remove all the navigation elements defined in the `QuickLaunch` navigation before adding the new navigation structure.

`--cleanTopNavigation`
: Allows you to specify if you want to remove all the navigation elements defined in the `TopNavigation` navigation before adding the new navigation structure.

`--pageTemplate`
: Name of the default page template to use for all the pages which will be created.

`--disableComments`
: Disable comments for all pages. By default the comments are enabled on the pages.

> **Important**: You can override this by specifying the `comments` option on page level.

`--disableStatePersistence`
: Disables loading and saving of the publish state file. When you use this flag, `doctor` cannot detect changes, so all pages are processed on every run.

`--stateFile <stateFile>`
: The path of the state file within the library defined by `--library`. Default value is: `.doctor/state.json`, which results in `Shared Documents/.doctor/state.json` when the default library is used.

### Change detection / publish state

`doctor` keeps track of what it published in a state file which is stored on your SharePoint site. For every page it stores a hash of the source markdown file, together with the timestamp of when it got published.

On the next run, `doctor` compares the hash of each local file with the one in the state file:

- Pages which are **new** or **modified** get published.
- Pages which are **unchanged** get skipped.

> **Important**: This is a behavior change since v2.0.0. Previously all pages were processed on every run. If you want the old behavior, use the `--forceAll` flag.

The state is saved after each page, so when a publishing run fails halfway, the already published pages do not need to be processed again on the next run.

The following options influence this behavior:

- `--forceAll`: reprocess everything, ignoring the state.
- `--disableStatePersistence`: do not load or save the state at all.
- `--stateFile`: store the state on another location.
- `--library`: the library in which the state file is stored.

Use the [`doctor status`](../commands/#status) command to see which pages will be published on the next run.

> **Info**: The state gets skipped when you use the `--skipPages` flag, as no pages are processed in that case.

### Pre-process checks

Before any call to SharePoint is made, `doctor` validates your markdown files and stops the publishing run when it finds issues. This prevents a run from failing halfway through. The following checks are performed:

- Files which cannot be read.
- Front matter which cannot be parsed.
- Pages without a `title` in their front matter.
- Duplicate slugs, as these pages would overwrite each other on the site.
- Localization references in the front matter pointing to a file which does not exist on disk.

When one or more issues are found, the run stops and all issues are listed at once (up to a maximum of 20, followed by the number of remaining issues). Pages of the `translation` type are skipped during this validation.

Use the `--skipPrecheck` flag when you want to skip this validation.

### `doctor.json`

You can provide the same flags and values like in the parameters. Parameters can override what is defined in the `doctor.json`. Be sure to use the whole argument names, and not the shortcodes.

```json
{
  "folder": "./src",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  ...
}
```

The options which got introduced in v2.0.0 can be defined in the `doctor.json` file as well, so you do not need to repeat them on every run:

```json
{
  "$schema": "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/2.0.0.json",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  "folder": "./src",
  "library": "Shared Documents",
  "stateFile": ".doctor/state.json",
  "disableStatePersistence": false,
  "forceAll": false,
  "skipPrecheck": false,
  "applyTheme": false,
  "verbose": false,
  "timingDetails": false
}
```

> **Important**: The flags which are marked with *"This flag can only be added to the command execution"* are the exception. These are ignored when you define them in the `doctor.json` file.

#### Multilingual

`doctor` can be configured to automatically create multilingual pages. To accomplish this, you will need to configure the `multilingual` option in the `doctor.json` file with the following settings:

- **multilingual**: `MultilingualSettings` - Setting to specify if multilingual is enabled on the site and which languages are supported.
  - **enableTranslations**: `boolean` - Specifies if you want to enable or disable multilingual features on the site. Default: `false`.
  - **languages**: `number[]` - Locale IDs (or LCIDs) to enable on the site. An overview of the supported LCIDs for SharePoint can be found on [Supported LCIDs by SharePoint](https://github.com/pnp/PnP-PowerShell/wiki/Supported-LCIDs-by-SharePoint).
  - **overwriteTranslationsOnChange**: `boolean` - Specify whether the changes made to user-specified text in the default language should automatically overwrite the existing translations made in all alternate languages.
  - **translator**: `Translator` - This property allows you to specify the Azure Translator Cognitive Service. When Specified, you allow `doctor` to use the translator APIs to machine translate your pages.

Manual translation example:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": [
      1043
    ],
    "overwriteTranslationsOnChange": true,
    "translator:" null
  }
}
```

Machine translation example:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": [
      1043
    ],
    "overwriteTranslationsOnChange": true,
    "translator:" {
      "key": "<subscription key>",
      "endpoint": "https://api.cognitive.microsofttranslator.com/",
      "region": "<region name, example: westeurope>"
    }
  }
}
```

#### Site look and feel

If you want, you can define the site its look and feel. This needs to be done on global level in the `doctor.json` file.

- **siteDesign**: `SiteDesign` - Allows you to set the theme and header/footer chrome
  - **logo**: `string` - The path to your logo you want to use for the site. If the value is empty `""` it will be used to unset the site its logo.
  - **theme**: `string` - The name of the theme to set
  - **chrome**: `Chrome` - Settings for the header/footer chrome
    - **headerLayout**: `string` - Specifies the header layout to set on the site. Options: `Standard|Compact|Minimal|Extended`.
    - **headerEmphasis**: `string` - Specifies the header its background color to set. Options: `Lightest|Light|Dark|Darkest`.
    - **logoAlignment**: `string` - When using the `Extended` header, you can set the logo its position. Otherwise this setting will be ignored. Options: `Left|Center|Right`.
    - **footerLayout**: `string` - Specifies the footer layout to set on the site. Options: `Simple|Extended`.
    - **footerEmphasis**: `string` - Specifies the footer its background color to set. Options: `Lightest|Light|Dark|Darkest`.
    - **disableMegaMenu**: `boolean` - Specify to disable the mega menu. This results in using the cascading navigation (classic experience).
    - **hideTitleInHeader**: `boolean` - Specify to hide the site title in the header.
    - **disableFooter**: `boolean` - Specify to disable the footer on the site.

Example:

```json
{
  "siteDesign": {
    "logo: "./assets/doctor.png",
    "theme": "Red",
    "chrome": {
      "headerLayout": "Compact",
      "headerEmphasis": "Darkest",
      "disableMegaMenu": false,
      "footerEnabled": true
    }
  }
}
```

> **Info**: All properties you define in the `siteDesign` object are optional.

#### Markdown publishing settings

The `markdown` property allows you to define how you want to render the HTML in SharePoint. By default, `Doctor` lets the HTML being rendered by the Markdown web part. This property allows you to override these settings, and define to let `Doctor` take over for the HTML rendering.

- **markdown**
  - **allowHtml**: `boolean` - By default SharePoint renders the HTML. If you set this to `true`, it will allow Doctor to generate the HTML and allows you to make use of all HTML capabilities the tool has to offer. When you enable this, you can also make use of [shortcodes](../shortcodes) in markdown to make more HTML rich pages.
  - **theme**: `string` - Specify the theme to use for the code blocks. You can use `Dark` or `Light`. Default is `Dark`.
  - **shortcodesFolder**: `string` - Specifies where custom shortcodes can be retrieved. Check [shortcodes](../shortcodes) section to learn more about how shortcodes can be used. Default folder location `Doctor` expects is `./shortcodes`. If you want to change this, you can use the `shortcodesFolder` property and update it appropriate.
  - **tocLevels**: `number` - Specifies the number of levels to show in the table of contents. Default is `[1, 2, 3, 4]`.

Example:

```json
{
  "markdown": {
    "allowHtml": true,
    "theme": "light",
    "shortcodesFolder": "./shortcodes",
    "tocLevels": [1, 2, 3, 4]
  }
}
```

> **Important**: When allowing `Doctor` to take over for rendering the HTML, be aware that the pages can best not be modified on SharePoint. Otherwise the web part will override the HTML completly.

#### Global navigation structure

You can also define a static navigation structure in the `doctor.json` file. Example:

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

The menu property can contain a `QuickLaunch` and/or `TopNavigationBar` elment with their corresponding static navigation links under the `items` property. More information about navigation items can be found in the [menu section](../pages/#Menu).

> **Important**: If you specify arguments during command execution, they will be used instead of the values defined in the `doctor.json` file.

### Markdown shortcodes

Shortcodes are HTML snippets inside your content files calling built-in or custom templates. You can use these shortcodes like custom HTML elements. Similar like custom web components. More information about these shortcodes can be found at our [markdown shortcodes](../shortcodes)
