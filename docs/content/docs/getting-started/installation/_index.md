---
title: Installation
date: 2021-02-22T10:06:07.167Z
lastmod: 2026-08-04T00:00:00.000Z
weight: 1
draft: false
aliases:
  - /docs/installation/
keywords:
  - ""
---

Thank you for your interest in the `doctor`. The following information will help you install `doctor`.

## Prerequisites

`doctor` requires **Node.js 22.13.0 or higher**.

> **Important**: Since v2.0.0, `doctor` no longer runs on older Node.js versions. If you are using `doctor` in a CI/CD pipeline, make sure the pipeline uses a supported Node.js version.

Next to Node.js, you also need an **Azure Entra ID app registration** with a certificate to authenticate against your tenant. Check the [certificate authentication](../certificate-authentication) section for the required setup.

## Install

Start by installing `doctor` as follows via npm:

{{< main >}}

```
npm i -g @estruyf/doctor
```

{{< /main >}}
{{< dev >}}

```
npm i -g @estruyf/doctor@next
```

{{< /dev >}}

If you are using `yarn`, you can do it as follows:

{{< main >}}

```
yarn global add @estruyf/doctor
```

{{< /main >}}
{{< dev >}}

```
yarn global add @estruyf/doctor@next
```

{{< /dev >}}

To quickly get started, we provided a [sample repository](https://github.com/estruyf/doctor-sample) which allows you to test out all the functionalities of `Doctor`.
