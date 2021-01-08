<h1 align="center">
  <a href="hhttps://github.com/ValoIntranet/doctor">
    <img alt="Doctor" src="./assets/valo-doctor.svg" height="200">
  </a>
</h1>

<h2 align="center">The static site generator for SharePoint</h2>

<p align="center">
  <img src="https://github.com/ValoIntranet/doctor/workflows/Does%20it%20build%20and%20publish%3F/badge.svg?branch=dev"
      alt="Does it build and publish?" />

  <a href="https://www.npmjs.com/package/@valo/doctor">
    <img src="https://img.shields.io/npm/v/@valo/doctor/latest?style=flat-square"
      alt="npm @valo/doctor@latest" />
  </a>
  
  <a href="https://www.npmjs.com/package/@valointranet/doctor">
    <img src="https://img.shields.io/npm/v/@valo/doctor/next?style=flat-square"
      alt="npm @valo/doctor@next" />
  </a>
</p>

`Doctor` is a tool created and provided by Valo. Initially, we started `doctor` as an internal tool to dogfood our products and keep documentation in one place. For our team, this is SharePoint.

As we understand that it is not the best experience for developers to write documentation on SharePoint, we created this tool to simplify the process. `Doctor` allows developers to use tools/applications they are used to, like VSCode and Markdown, and still provide the information on your SharePoint environment.

`Doctor` follows the concept of many Static Site Generators. These generators make it possible to write your articles/documentation in Markdown and convert them to HTML files. 

`Doctor` is a bit different, as instead of creating HTML files, it makes SharePoint pages instead. 

Under the hood, it makes use of the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

## Installation

Thank you for your interest in the `doctor`. The following information will help you install `doctor`.

Start by installing `doctor` as follows via npm:

```
npm i -g @valo/doctor
```

If you are using `yarn`, you can do it as follows:

```
yarn global add @valo/doctor
```

To quickly get started, we provided a [sample repository](https://github.com/ValoIntranet/doctor-sample) which allows you to test out all the functionalities of `Doctor`.

## Pages

You start by creating pages as Markdown files (`.md`) in the source folder (`./src` is the default, but you can change this). The markdown pages should contain the following front matter.

```
---
title: <title>
---

Your article content starts here.
```

- **title**: `string` - The title of the page.

> **Info**: Front Matter is the page its metadata.

Optional Front Matter properties are:

- **slug**: `string` - If a slug is not defined, the title and current folder struture will be used. You can add the slug with our without `.aspx` file extension. The tool will automatically add it.
- **draft**: `boolean` - defines if you want to publish the article during the publishing phase.
- **comments**: `boolean` - with this setting you can enable/disable page commenting. By default this is disabled.
- **layout**: `Article` | `Home` - defines which page layout you want to use. Default layout type is `Article`.
- **header**: `HeaderOptions` - defines how you want to render the header on the page.
  - **type**: Use one of the following values: `None|Default|Custom`. Default: `Default`.
  - **image**: Path to the image file you want to use in your page header.
  - **altText**: The image description.
  - **translateX**: X focal point of the header image.
  - **translateY**: Y focal point of the header image.
  - **layout**: Layout to use in the header. Allowed values `FullWidthImage|NoImage|ColorBlock|CutInShape`. Default: `FullWidthImage`.
  - **textAlignment**: How to align text in the header. Allowed values `Center|Left`. Default: `Left`.
  - **showTopicHeader**: Specify if you want to show the topic header above the title. Default: `false`.
  - **topicHeader**: Topic header text to show.
  - **showPublishDate**: Show the publish date in the header. Default: `false`.
- **menu**: `Menu`- defines where the page gets added to the navigation structure. Check: [menu section](#Menu).

When you want to create page to page links, you can provide the relative path from the current markdown file to the other markdown file (with or without the `.md` extension).

### Menu

The menu property allows you to create a navigation structure for you static content. The `Menu` object has the following properties:

- menu
  - `QuickLaunch` OR `TopNavigationBar` - Default is `QuickLaunch`
    - **id**: `string` (required) - Navigation id. This can be used to create a hierarchy in your navigation.
    - **name**: `string` (optional) - When this property is defined, it will be used for the navigation item title, otherwise the page title will be used.
    - **weight**: `number` (optional) - The weight of the navigation item. If you want to have it first or last.
    - **parent**: `string` (optional) - Defines the hierarchy of you page in the menu. If not provided, the items will be added to the root of the navigation. When defined, it should contain the `id` value of the parent page. You can also add multi-level navigation like: `<parent-id>/<sub-parent-id>`.

> **Important 1**: During the publishing process, the navigation will be re-created each time.

> **Important 2**: When using `QuickLaunch` you can only have three levels of navigation: `Root/sub/sub-sub`.

#### Example 1

The following page will be added to the root of the `QuickLaunch` after the already defined links. 

```markdown
---
title: Documentation
slug: documentation.aspx
draft: false

menu:
  QuickLaunch:
    id: documentation
    weight: 1
---

Write here the Doctor page content.
```

#### Example 2

The following page adds a subpage underneath the documentation link in the navigation.

```markdown
---
title: Tools
slug: documentation/tools.aspx
draft: false

menu:
  QuickLaunch:
    id: tools
    weight: 1
    parent: documentation
---

Write here the tools page content.
```

#### Example 3

Defines a new page under the tools section:

```markdown
---
title: Doctor
slug: documentation/doctor.aspx
draft: false

menu:
  QuickLaunch:
    id: doctor
    weight: 1
    parent: documentation/tools
---

Write here the Doctor page content.
```

## Commands

### Version

This command returns the installed version number of the tool.

```sh
doctor version
```

### Init

This command creates the initial folder structure for your documentation project (Check [#Options](#Options) to see which arguments you can pass to the command).

#### Examples

Initialize a standard project:

```sh
doctor init
```

Initialize a project with your own options:

```sh
doctor init --auth password --username <username> --password <password>
```

### Publish

The publish command starts the creation process of your static content in SharePoint. It will upload all referenced images and creates the navigation structure if provided (Check [#Options](#Options) to see which arguments you can pass to the command).

#### Examples

When using a `doctor.json` file, you can just run the doctor publishing command:

```sh
doctor publish
```

If you want to manually pass your arguments, you can do this as follows:

```sh
doctor publish --url https://<tenant>.sharepoint.com/sites/<documentation>
```

## Options

Options are specified via command arguments, or within a `doctor.json` file (automatically gets created on initialization `doctor init`).

`-a, --auth <auth>`
: Specify the authentication type to use. Values can be `deviceCode` (default) or `password`.


`--username`
: When using `password` authentication, you need to pass the `username` and `password`.


`--password`
: When using `password` authentication, you need to pass the `username` and `password`.


`-f, --folder <folder>`
: The folder location in where you will create your markdown files.


`-u, --url <url>`
: The URL of the site collection to use.


`--library`
: Specified the library which you want to use in SharePoint to store your referenced images.


`--webPartTitle`
: This defined the title of the markdown web part to be created/updated on the page. Default value is: `doctor-placeholder`.

> **Important**: if you would change this value, be sure to keep this in the `doctor.json` file. 

`--overwriteImages`
: Specifies if you allow `doctor` to overwrite the images in the SharePoint library that are referenced in the markdown files.

`--skipPrecheck`
: Skips the pre-checks when running the commands. This validates if you have the right dependencies installed in your environment.

`--debug`
: Provides more information of what is happening during command execution.

`--outputFolder`
: When providing this option, the processed markdown files will be generated in this folder.

`--cleanStart`
: Removes all pages before creation. This ensures that you that all changes made to your documentation get removed.

`--confirm`
: Don't prompt for confirming removing the files when you specified to clean up pages and assets before publishing.

### `doctor.json`

You can provide the same flags and values like in the parameters. Parameters can override what is defined in the `doctor.json`. Be sure to use the whole argument names, and not the shortcodes.

```json
{
  "folder": "./src",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  ...
}
```

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

The menu property can contain a `QuickLaunch` and/or `TopNavigationBar` elment with their corresponding static navigation links under the `items` property. More information about navigation items can be found in the [menu section](#Menu).

> **Important**: If you specify arguments during command execution, they will be used instead of the values defined in the `doctor.json` file.

## Todo

- [x]: Update links to the actual pages in SharePoint
- [x]: Create static build output of the updated markdown files
- [x]: Cross-platform support

- [ ]: Support for metadata in Front Matter
- [ ]: Support for page description
- [ ]: Support for setting header image
- [ ]: Specify which parts of the publish process needs to run (`skipAuth`, `skipPages`, `skipNavigation`)

## Found an issue?

Please add all your issues to the project [issue list](https://github.com/ValoIntranet/doctor/issues).

## Feedback / Contribute

If you want to contribute to the project, feel free to do so. Best is to start a discussion in the [discussion list](https://github.com/ValoIntranet/doctor/discussions) and let us know what you want to implement.

Feedback can also be provided to the [discussion list](https://github.com/ValoIntranet/doctor/discussions).

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

<p align="center">
  <a href="#">
      <img src="http://estruyf-github.azurewebsites.net/api/VisitorHit?user=valointranet&repo=doctor&countColor=%23ffc100" />
   </a>
</p>
