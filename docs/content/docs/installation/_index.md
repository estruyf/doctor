---
title: Installation
date: 2021-02-22T10:06:07.167Z
lastmod: 2021-02-22T10:06:07.167Z
weight: 1
draft: false
keywords:
  - ""
---

Thank you for your interest in the `doctor`. The following information will help you install `doctor`.

## Prerequisites

`doctor` requires **Node.js 22.13.0 or higher**.

> **Important**: Since v2.0.0, `doctor` no longer runs on older Node.js versions. If you are using `doctor` in a CI/CD pipeline, make sure the pipeline uses a supported Node.js version.

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
