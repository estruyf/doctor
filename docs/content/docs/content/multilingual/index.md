---
title: Multilingual
date: 2021-03-10T14:33:47.481Z
lastmod: 2021-03-10T14:33:47.852Z
weight: 6
draft: false
keywords:
  - ""
aliases:
  - /docs/multilingual/
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
    "translator": null
  }
}
```

More information about the setup can be found on the [doctor.json page under the multilingual section](../../configuration/doctor-json/#multilingual).

## Required configuration on page level

When creating multilingual pages, you will need to link each of the language pages to the source page.

### Localization source page

On your source page, you add the `localization` property to its front matter. You can do this as follows:

```yaml
localization:
  "nl-nl": ./home.nl.lang.md
```

The localization property contains the following. `locale name` and `relative path` to the linked language page.

The `languages` setting takes the same locale names as the `localization` front matter, so both sides use one vocabulary:

```json
{
  "multilingual": {
    "enableTranslations": true,
    "languages": ["nl-nl", "fr-fr", "es-es"]
  }
}
```

LCIDs keep working as well, and the two styles can be mixed: `["nl-nl", 1036]` is the same as `["nl-nl", "fr-fr"]`. An entry which is neither stops the run instead of quietly changing the languages of your site.

> **Info**: An overview of the supported LCIDs for SharePoint can be found on [Supported LCIDs by SharePoint](https://github.com/pnp/PnP-PowerShell/wiki/Supported-LCIDs-by-SharePoint).

> **Warning**: `languages` is applied to the site as-is, it replaces the languages which were enabled on it. Any locale you use in a `localization` front matter has to be in this list, otherwise SharePoint refuses to create the translation. Doctor reports the locales which are missing from it.

### Localization translation page

Name the translation page with a `.lang.md` suffix, `home.nl.lang.md` in the above example. That suffix is what tells `doctor` the file holds the content of a localized page: it is left out of the standard page processing and published in the localization phase instead, under the URL SharePoint issues for the translation.

> **Info**: Setting `type: translation` on the page is still supported, but no longer needed. A file which does not end on `.lang.md` does need it.

Because a translation never gets a slug of its own, a `slug` in its front matter is ignored.

By default, SharePoint will copy the header settings from the source page. If you want to override these settings, you can add the same options as all other pages.

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
    "translator": {
      "key": "<subscription key>",
      "endpoint": "https://api.cognitive.microsofttranslator.com/",
      "region": "<region name, example: westeurope>"
    }
  }
}
```

Both endpoint forms Azure hands out are supported:

- The global endpoint: `https://api.cognitive.microsofttranslator.com`
- The endpoint of your own resource: `https://<your-resource>.cognitiveservices.azure.com`

> **Info**: A trailing slash on the endpoint is fine, `doctor` normalizes it. If the run reports `Resource Not Found`, the endpoint is reachable but the key or region does not match the resource.

### Automatically translate pages

When you want to make use of these APIs for page translations. All you need to do is specifying the `localization` property to its front matter of the page. In this case, you do not need to specify the path to the page. As the page will be translated on the fly.

```yaml
localization:
  "nl-nl":
```

> **Info**: When you are going to run `doctor`. There will be `*.machinetranslated.md` pages created next to the parent page. This is done to not create any conflicts with the referenced pages and images. At the end of the process, `doctor` will remove these generated pages. During a `debug` run, they will not be removed.
