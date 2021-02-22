---
title: Options
date: 2021-02-22T10:06:07.167Z
lastmod: 2021-02-22T10:06:07.167Z
weight: 4
draft: false
keywords:
  - ''
---

Options are specified via command arguments, or within a `doctor.json` file (automatically gets created on initialization `doctor init`).

`-a, --auth <auth>`
: Specify the authentication type to use. Values can be `deviceCode` (default) or `password` or `certificate`.

> **Info**: Check out the [Certificate Authentication](../certificate-authentication) section for more information about using the `certificate` approach.


`--username <username>`
: When using `password` authentication, you need to pass the `username` and `password`.


`--password <password>`
: When using `password` authentication, you need to pass the `username` and `password`.


`-f, --folder <folder>`
: The folder location in where you will create your markdown files.


`-u, --url <url>`
: The URL of the site collection to use.


`--library <library>`
: Specified the library which you want to use in SharePoint to store your referenced images.


`--webPartTitle <webPartTitle>`
: This defined the title of the markdown web part to be created/updated on the page. Default value is: `doctor-placeholder`.

> **Important**: if you would change this value, be sure to keep this in the `doctor.json` file. 

`--overwriteImages`
: Specifies if you allow `doctor` to overwrite the images in the SharePoint library that are referenced in the markdown files.

`--debug`
: Provides more information of what is happening during command execution.

`--outputFolder <outputFolder>`
: When providing this option, the processed markdown files will be generated in this folder.

`--cleanStart`
: Removes all pages before creation. This ensures that you that all changes made to your documentation get removed.

`--confirm`
: Don't prompt for confirming removing the files when you specified to clean up pages and assets before publishing.

`--skipExistingPages`
: Will not overwrite pages if they already existed on the site.

`--continueOnError`
: Continue when an error occurs during the publishing process.

`--commandName <commandName>`
: In case you want to use the locally installed `CLI for Microsoft 365`, you can use this flag. By default, it uses the version specified in the `doctor` tool. You can use the a locally installed version as follows: `--commandName m365`.

### `doctor.json`

You can provide the same flags and values like in the parameters. Parameters can override what is defined in the `doctor.json`. Be sure to use the whole argument names, and not the shortcodes.

```json
{
  "folder": "./src",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  ...
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

Example:

```json
{
  "markdown": {
    "allowHtml": true,
    "theme": "light",
    "shortcodesFolder": "./shortcodes"
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
      "items": [{
        "id": "documentation",
        "name": "Documentation",
        "url": ""
      }]
    }
  }
}
```

The menu property can contain a `QuickLaunch` and/or `TopNavigationBar` elment with their corresponding static navigation links under the `items` property. More information about navigation items can be found in the [menu section](../pages/#Menu).

> **Important**: If you specify arguments during command execution, they will be used instead of the values defined in the `doctor.json` file.

### Markdown shortcodes

Shortcodes are HTML snippets inside your content files calling built-in or custom templates. You can use these shortcodes like custom HTML elements. Similar like custom web components. More information about these shortcodes can be found at our [markdown shortcodes](../shortcodes)