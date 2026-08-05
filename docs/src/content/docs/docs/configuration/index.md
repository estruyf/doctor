---
title: Configuration
sidebar:
  order: 0
---

Everything you can configure for `doctor` lives in two places: the **arguments** you pass to a command, and the **`doctor.json`** file in the root of your project. Both use the same names, so an option you know from the command line can be moved to the configuration file, and the other way around.

## Where do settings live?

| | Command arguments | `doctor.json` |
| --- | --- | --- |
| Example | `doctor publish --url <url>` | `{ "url": "<url>" }` |
| Best for | Secrets and one-off runs | Everything which stays the same on every run |
| Scope | The command you are running | All commands in the project |

`doctor init` creates the `doctor.json` file for you, so you usually only need to pass the certificate (and its password) on each run.

:::caution[Important]
Arguments always win over the values defined in the `doctor.json` file. A couple of flags can **only** be passed as an argument. These are marked in the [CLI options](./cli-options) reference.
:::

## Sections

- [CLI options](./cli-options): every argument you can pass to a `doctor` command, grouped per authentication, all commands, and the publish command.
- [doctor.json](./doctor-json): the settings which are configured as objects in the configuration file, like multilingual, site design, markdown rendering, partials, and the static navigation.

## Minimal configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/estruyf/doctor/dev/schema/2.1.0.json",
  "url": "https://<tenant>.sharepoint.com/sites/<documentation>",
  "appId": "<appId>",
  "tenant": "<tenant>",
  "folder": "./src"
}
```

:::note[Info]
Add the `$schema` property to get autocompletion and validation of the configuration file in editors like Visual Studio Code.
:::
