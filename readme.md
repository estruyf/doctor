# Doctor (The static site generator for SharePoint)

`Doctor` is a tool created and provided by Valo. Initially, we started `doctor` as an internal tool to dogfood our products and keep documentation in one place. For our team, this is SharePoint.

As we understand that it is not the best experience for developers to write documentation on SharePoint, we created this tool to simplify the process. `Doctor` allows developers to use tools/applications they are used to, like VSCode and Markdown, and still provide the information on your SharePoint environment.

`Doctor` follows the concept of many Static Site Generators. These generators make it possible to write your articles/documentation in Markdown and convert them to HTML files. 

`Doctor` is a bit different, as instead of creating HTML files, it makes SharePoint pages instead. 

Under the hood, it makes use of the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

## Installation



## Settings

`config.json`

```json
{
  "folder": "./src",
  "url": "https://estruyfdev2.sharepoint.com/sites/StaticPages",
  ...
}
```

> **Info**: you can provide the same flags and values like in the parameters. Parameters can override what is defined in the `config.json`.

## Parameters

`--`