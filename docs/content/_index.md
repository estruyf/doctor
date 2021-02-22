---
title: Doctor
description: Maintain your documentation on SharePoint without pain
lead: Doctor is a tool to manage your documentation on SharePoint without pain
date: 2021-02-22T09:04:52.937Z
draft: false
images: []
---

`Doctor` was originally created for having a uniformal way of providing the documentation internally at Valo Solutions. The main driver for `doctor` was to dogfood the Valo products and make it easier for users to maintain documentation on SharePoint.

As we understand that it is not the best experience for developers to write documentation on SharePoint, we created this tool to simplify the process. `Doctor` allows developers to use tools/applications they are used to, like VSCode and Markdown, and still provide the information on your SharePoint environment.

`Doctor` follows the concept of many Static Site Generators. These generators make it possible to write your articles/documentation in Markdown and convert them to HTML files. 

`Doctor` is a bit different, as instead of creating HTML files, it makes SharePoint pages instead. 

Under the hood, it makes use of the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

> Today `doctor` is maintained by `Elio Struyf`. Feel free to join the project if you have interest in.