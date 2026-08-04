---
title: Commands
date: 2021-02-22T10:06:07.167Z
lastmod: 2026-08-04T00:00:00.000Z
weight: 4
draft: false
keywords:
  - ""
---

### Cleanup

The `doctor cleanup` command is there to uninstall the autocomplete functionality from `doctor`.

> **Important**: You do not need to use it if you never ran the `doctor setup` command.

### Version

This command returns the installed version number of the tool.

```sh
doctor version
```

### Init

This command creates the initial folder structure for your documentation project (Check [#Options](../options) to see which arguments you can pass to the command).

#### Examples

Initialize a standard project:

```sh
doctor init
```

Initialize a project using certificate authentication:

```sh
doctor init --auth certificate --certificateBase64Encoded <certificateBase64Encoded> --appId <appId> --tenant <tenant>
```

### Publish

The publish command starts the creation process of your static content in SharePoint. It will upload all referenced images and creates the navigation structure if provided (Check [#Options](../options) to see which arguments you can pass to the command).

#### Examples

When using a `doctor.json` file, you can just run the doctor publishing command:

```sh
doctor publish
```

If you want to manually pass your arguments, you can do this as follows:

```sh
doctor publish --url https://<tenant>.sharepoint.com/sites/<documentation>
```

### Status

The `doctor status` command is a read-only command which compares your local markdown files against the publish state stored in SharePoint. It tells you what the next `doctor publish` run will do, without making any changes to your site.

```sh
doctor status
```

> **Important**: The command requires the `--url` option (either passed as an argument, or defined in the `doctor.json` file), as it needs to download the state file from your site.

The output groups your pages in the following categories:

- **New**: files which are not yet tracked in the state, and will be created.
- **Modified**: files whose content changed since the last publish, and will be updated.
- **Deleted**: pages which are tracked in the state, but no longer exist locally.
- **Unchanged**: files which are up to date. These are only listed when you pass the `--verbose` flag.

At the end, you get a summary telling you how many pages will be published on the next run:

```
 ⚡ 4 pages will be published on next run
```

> **Info**: When state persistence is disabled with `--disableStatePersistence`, no state gets loaded and all pages are reported as **New**.

### Setup

The `doctor setup` command allows you to initialize the autocomplete functionality (`<tab>` completion) for `doctor`.

#### Example

```
doctor setup
```

When you now type, `doctor <tab>` you will get a list of available commands and/or related arguments.

![autocomplete](./assets/autocomplete.png)
