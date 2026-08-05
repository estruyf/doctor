---
title: Documentation
description: Jump into the documentation of Doctor
tableOfContents: false
---

<p align="center">
  <a href="https://www.npmjs.com/package/@estruyf/doctor" title="Check why it fails">
    <img src="https://github.com/estruyf/doctor/actions/workflows/release.yml/badge.svg"
        alt="Does it build and publish?" style="display: inline-block" />
  </a>

  <a href="https://www.npmjs.com/package/@estruyf/doctor" title="Go to npm">
    <img src="https://img.shields.io/npm/v/@estruyf/doctor/latest?style=flat-square"
      alt="npm @estruyf/doctor@latest" style="display: inline-block" />
  </a>
  
  <a href="https://www.npmjs.com/package/@estruyf/doctor" title="Go to npm">
    <img src="https://img.shields.io/npm/v/@estruyf/doctor/next?style=flat-square"
      alt="npm @estruyf/doctor@next" style="display: inline-block" />
  </a>
</p>

`Doctor` was originally created for having a uniformal way of providing the documentation internally at Valo Solutions. The main driver for `doctor` was to dogfood the Valo products and make it easier for users to maintain documentation on SharePoint.

As we understand that it is not the best experience for developers to write documentation on SharePoint, we created this tool to simplify the process. `Doctor` allows developers to use tools/applications they are used to, like VSCode and Markdown, and still provide the information on your SharePoint environment.

`Doctor` follows the concept of many Static Site Generators. These generators make it possible to write your articles/documentation in Markdown and convert them to HTML files.

`Doctor` is a bit different, as instead of creating HTML files, it makes SharePoint pages instead.

Under the hood, it makes use of the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

> Today `doctor` is maintained by `Elio Struyf` and `Dmitriy Van der Elst`. Feel free to join the project if you have interest in.

## Where to find what

| Section | What you find there |
| --- | --- |
| [Getting started](./getting-started) | Installing `doctor`, setting up the Entra app registration with its certificate, and publishing your first page. |
| [Content](./content) | Everything about your Markdown source: page front matter, navigation, markdown syntax, shortcodes, partials, and multilingual pages. |
| [CLI](./cli) | The commands you can run: `init`, `publish`, `status`, `cleanup`, `workflow`, and `setup`. |
| [Configuration](./configuration) | Every option you can pass as a command argument, and every setting you can define in the `doctor.json` file. |
| [CI/CD](./ci-cd) | Running `doctor` on Azure DevOps or GitHub Actions, so your documentation gets published automatically. |
| [About](./about) | Feedback, contributing, the disclaimer, and the license. |

:::note[Info]
New to `doctor`? Start with the [getting started](./getting-started) section, it walks you through the whole flow from installation to your first published page.
:::
