---
title: doctor.json
sidebar:
  order: 2
---

The `doctor.json` file sits in the root of your project and holds the settings which stay the same on every run. It gets created for you when you initialize your project with [`doctor init`](../../cli/#init).

## Simple options

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
  "appId": "<appId>",
  "tenant": "<tenant>",
  "certificate": "./cert.pfx",
  "folder": "./src",
  "library": "Shared Documents",
  "commandTimeout": 120000,
  "stateFile": ".doctor/state.json",
  "disableStatePersistence": false,
  "forceAll": false,
  "skipPrecheck": false,
  "applyTheme": false,
  "verbose": false,
  "timingDetails": false
}
```

Options which got added in a later version, like `removeDeleted`, work the same way. Point the `$schema` value to the version you are running to get autocompletion for them in your editor.

:::note[Info]
The `output` option can be defined here as well, but it is best passed on the command execution (`--output json`). Setting it in the `doctor.json` file makes every local run report [JSON](../cli-options/#json-output) instead of the readable task list.
:::

:::caution[Important]
The flags which are marked with *"This flag can only be added to the command execution"* in the [CLI options](../cli-options) are the exception. These are ignored when you define them in the `doctor.json` file.
:::

:::caution[Important]
The `removeDeleted` option removes pages from your site. It only runs when you confirm it, which means you still need to pass the `--confirm` flag on the command execution when you enabled it in the `doctor.json` file.
:::

The next sections describe the settings which are objects, and can only be configured in the `doctor.json` file.

## Multilingual

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
    "translator": null
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

If you want, you can define the site its look and feel. This needs to be done on global level in the `doctor.json` file.

- **siteDesign**: `SiteDesign` - Allows you to set the theme and header/footer chrome
  - **logo**: `string` - The path to your logo you want to use for the site, relative to the folder defined with `-f, --folder` (`./src` by default). The logo gets uploaded to a `site` folder in the library defined with `--library`. If the value is empty `""` it will be used to unset the site its logo.
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

:::note[Info]
All properties you define in the `siteDesign` object are optional.
:::

:::caution[Important]
The `theme` is only applied when you pass the [`--applyTheme`](../cli-options/#publish-command-specific-options) flag to the publish command.
:::

## Markdown publishing settings

The `markdown` property allows you to define how you want to render the HTML in SharePoint. By default, `Doctor` lets the HTML being rendered by the Markdown web part. This property allows you to override these settings, and define to let `Doctor` take over for the HTML rendering.

- **markdown**
  - **allowHtml**: `boolean` - By default SharePoint renders the HTML. If you set this to `true`, it will allow Doctor to generate the HTML and allows you to make use of all HTML capabilities the tool has to offer. When you enable this, you can also make use of [shortcodes](../../content/shortcodes) in markdown to make more HTML rich pages.
  - **theme**: `string` - Specify the theme to use for the code blocks. You can use `Dark` or `Light`. Default is `Dark`.
  - **shortcodesFolder**: `string` - Specifies where custom shortcodes can be retrieved. Check [shortcodes](../../content/shortcodes) section to learn more about how shortcodes can be used. Default folder location `Doctor` expects is `./shortcodes`. If you want to change this, you can use the `shortcodesFolder` property and update it appropriate.
  - **tocLevels**: `number` - Specifies the number of levels to show in the table of contents. Default is `[1, 2, 3, 4]`.
  - **extended**: `boolean` - Renders the extended markdown syntax: emoji shortcodes, highlighted text, footnotes, definition lists and task lists. Default is `true`. Set this to `false` to only render the basic markdown syntax. Check the [markdown syntax](../../content/markdown-syntax) section to learn more.

Example:

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

:::caution[Important]
The `extended` setting only applies when `allowHtml` is enabled. Without it, SharePoint renders your markdown, and its web part only supports the basic markdown syntax.
:::

:::caution[Important]
When allowing `Doctor` to take over for rendering the HTML, be aware that the pages can best not be modified on SharePoint. Otherwise the web part will override the HTML completly.
:::

## Reusable content partials

The `partials` property allows you to reuse markdown snippets on your pages. More information can be found on the [partials](../../content/partials) page.

- **partials**
  - **folder**: `string` - Specifies where the partials can be retrieved. Default folder location `Doctor` expects is `./partials`.
  - **header**: `string` - The partial which gets added at the top of every page.
  - **footer**: `string` - The partial which gets added at the bottom of every page.

Example:

```json
{
  "partials": {
    "folder": "./partials",
    "header": "banner",
    "footer": "navigation"
  }
}
```

:::note[Info]
Pages can skip the automatically added partials with the `partials` front matter property.
:::

## Global navigation structure

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

The menu property can contain a `QuickLaunch` and/or `TopNavigationBar` elment with their corresponding static navigation links under the `items` property. More information about navigation items can be found in the [menu section](../../content/pages/#menu) and on the [navigation](../../content/navigation) page.

:::caution[Important]
The `menu` property is what enables the navigation. When it is not defined in the `doctor.json` file, the page level `menu` front matter is ignored.
:::

:::caution[Important]
If you specify arguments during command execution, they will be used instead of the values defined in the `doctor.json` file.
:::
