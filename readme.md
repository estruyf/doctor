# Doctor (The static site generator for SharePoint)

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

## Commands

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

### `doctor.json`

You can provide the same flags and values like in the parameters. Parameters can override what is defined in the `doctor.json`. Be sure to use the whole argument names, and not the shortcodes.

```json
{
  "folder": "./src",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  ...
}
```

> **Important**: If you specify arguments during command execution, they will be used instead of the values defined in the `doctor.json` file.

## Todo

- []: Easier command usage
- []: Support for metadata in Front Matter
- []: Create static build output of the updated markdown files

## Found an issue?

Please add all your issues to the project [issue list](https://github.com/ValoIntranet/doctor/issues).

## Feedback / Contribute

If you want to contribute to the project, feel free to do so. Best is to start a discussion in the [discussion list](https://github.com/ValoIntranet/doctor/discussions) and let us know what you want to implement.

Feedback can also be provided to the [discussion list](https://github.com/ValoIntranet/doctor/discussions). 