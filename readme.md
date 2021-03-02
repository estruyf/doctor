<h1 align="center">
  <a href="https://github.com/estruyf/doctor">
    <img alt="Doctor" src="./assets/doctor.svg" height="200">
  </a>
</h1>

<h2 align="center">Maintain your documentation on SharePoint without pain</h2>

<p align="center">
  <a href="https://www.npmjs.com/package/@estruyf/doctor" title="Check why it fails">
    <img src="https://github.com/estruyf/doctor/actions/workflows/release.yml/badge.svg"
        alt="Does it build and publish?" style="display: inline-block" />
  </a>

  <a href="https://www.npmjs.com/package/@estruyf/doctor" title="Go to npm">
    <img src="https://img.shields.io/npm/v/@estruyf/doctor/latest?style=flat-square"
      alt="npm @estruyf/doctor@latest" />
  </a>
  
  <a href="https://www.npmjs.com/package/@estruyf/doctor" title="Go to npm">
    <img src="https://img.shields.io/npm/v/@estruyf/doctor/next?style=flat-square"
      alt="npm @estruyf/doctor@next" />
  </a>
</p>

`Doctor` was originally created for having a uniformal way of providing the documentation internally at Valo Solutions. The main driver for `doctor` was to dogfood the Valo products and make it easier for users to maintain documentation on SharePoint.

As we understand that it is not the best experience for developers to write documentation on SharePoint, we created this tool to simplify the process. `Doctor` allows developers to use tools/applications they are used to, like VSCode and Markdown, and still provide the information on your SharePoint environment.

`Doctor` follows the concept of many Static Site Generators. These generators make it possible to write your articles/documentation in Markdown and convert them to HTML files. 

`Doctor` is a bit different, as instead of creating HTML files, it makes SharePoint pages instead. 

Under the hood, it makes use of the [CLI for Microsoft 365](https://pnp.github.io/cli-microsoft365/).

> Today `doctor` is maintained by `Elio Struyf`.

## Installation

Thank you for your interest in the `doctor`. The following information will help you install `doctor`.

Start by installing `doctor` as follows via npm:

```
npm i -g @estruyf/doctor
```

If you are using `yarn`, you can do it as follows:

```
yarn global add @estruyf/doctor
```

To quickly get started, we provided a [sample repository](https://github.com/estruyf/doctor-sample) which allows you to test out all the functionalities of `Doctor`.

## Usage

More information about how you can use `doctor` can be found in our documentation: [getdoctor.io](https://getdoctor.io).

## Todo

All ideas can be found in our [issue list](https://github.com/estruyf/doctor/issues) tagged with [enhancement](https://github.com/estruyf/doctor/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement).

## Found an issue?

Please add all your issues to the project [issue list](https://github.com/estruyf/doctor/issues).

## Feedback / Contribute

If you want to contribute to the project, feel free to do so. Best is to start a discussion in the [discussion list](https://github.com/estruyf/doctor/discussions) and let us know what you want to implement.

Feedback can also be provided to the [discussion list](https://github.com/estruyf/doctor/discussions).

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

<p align="center">
  <a href="#">
      <img src="http://estruyf-github.azurewebsites.net/api/VisitorHit?user=estruyf&repo=doctor&countColor=%2324BAA4" />
   </a>
</p>
