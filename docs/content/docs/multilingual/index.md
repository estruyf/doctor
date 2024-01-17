---
title: Multilingual
date: 2021-03-10T14:33:47.481Z
lastmod: 2021-03-10T14:33:47.852Z
weight: 3
draft: false
keywords:
  - ''
---


If you need to build yourself a multilingual knowledge base, documentation site, or intranet. `doctor` is here to help you out with that.

<video height="500" width="100%" controls>
  <source src="./assets/multilingual.mp4" type="video/mp4">
</video>

`doctor` allows you to configure multilingual on site- and page-level. To make use of `doctor` its multilingual features, you have to follow this guide.

## Configure `doctor` in a multilingual site

The first step is to configure `doctor` for multilingual site usage. You need to do this in the `doctor.json` file.

Example setup:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": [
      1043
    ],
    "overwriteTranslationsOnChange": true,
    "translator:" null
  } 
}
```

More information about the setup can be found on the [options page under the multilingual section](../options/#Multilingual).

## Required configuration on page level

When creating multilingual pages, you will need to link each of the language pages to the source page.

### Localization source page

On your source page, you add the `localization` property to its front matter. You can do this as follows:

```yaml
localization: 
  "nl-nl": ./home.nl.lang.md
```

The localization property contains the following. `locale name` and `relative path` to the linked language page.

> **Info**: An overview of the supported LCIDs for SharePoint can be found on [Supported LCIDs by SharePoint](https://github.com/pnp/PnP-PowerShell/wiki/Supported-LCIDs-by-SharePoint).

> **Important**: Make sure you use an LCID name that you enabled on site-level.

### Localization translation page

For the translation page, `home.nl.lang.md` in the above example, you should set its page `type` to `translation`. This property makes sure the page will not get process during the standard page processing.

> **Info**: If you want the transpiler to run faster. You can add `.lang.md` at the end. This way, `doctor` will exclude these files and only use them when referenced on the source page.

By default, SharePoint will copy the header settings from the source page. If you want to override these settings, you can add the same options as all other pages as long as you make sure `type: translation` is set for these pages.

> **Info**: Sample of how you can use multilingual with `doctor` has been provided in [https://github.com/estruyf/doctor-sample](https://github.com/estruyf/doctor-sample).

## Using Azure Translator service

If you want to make use of the Azure Translator service which is part of the [Azure Cognitive Services](https://azure.microsoft.com/en-us/services/cognitive-services/) family. You will first need to create the translator service in your Azure tenant and provide the following config:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": [
      1043
    ],
    "overwriteTranslationsOnChange": true,
    "translator:" {
      "key": "<subscription key>",
      "endpoint": "https://api.cognitive.microsofttranslator.com/",
      "region": "<region name, example: westeurope>"
    }
  } 
}
```

### Automatically translate pages

When you want to make use of this APIs for page translations. All you need to do is specifying the `localization` property to its front matter of the page. In this case, you do not need to specify the path to the page. As the page will be translated on the fly.

```yaml
localization: 
  "nl-nl":
```

> **Info**: When you are going to run `doctor`. There will be `*.machinetranslated.md` pages created next to the parent page. This is done to not create any conflicts with the referenced pages and images. At the end of the process, `doctor` will remove these generated pages. During a `debug` run, they will not be removed.
