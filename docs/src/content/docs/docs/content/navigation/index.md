---
title: Navigation
sidebar:
  order: 2
---

Next to creating pages, `doctor` can also maintain the navigation of your SharePoint site. It manages the **Quick Launch** (the left-hand navigation) and the **Top Navigation Bar** (the horizontal navigation/mega menu).

The navigation is not something you configure in SharePoint itself. `doctor` builds the whole structure while it processes your Markdown files, and applies it to the site at the end of the publishing run.

## How it works

During a `doctor publish` run, the navigation is built up in memory from two sources:

1. The **static structure** you define with the `menu` property in your `doctor.json` file. This is the starting point of the navigation.
2. The **`menu` front matter** of every page which gets processed. Each page adds itself to that structure, in the location and hierarchy you define.

Once all Markdown files are processed, the `Updating navigation` step takes the resulting structure and writes it to SharePoint.

```txt
doctor.json (menu)  ─┐
                     ├─► navigation structure ─► SharePoint (QuickLaunch / TopNavigationBar)
page front matter   ─┘
```

:::caution[Important]
The `menu` property in the `doctor.json` file is what enables the navigation. When it is not present, the page level `menu` front matter is ignored and no navigation is created. If you only want a page-driven navigation, add an empty definition to your `doctor.json` file:

```json
{
  "menu": {
    "QuickLaunch": {
      "items": []
    }
  }
}
```
:::

## Navigation locations

There are two supported locations, and you can use both at the same time:

- **`QuickLaunch`**: the navigation on the left side of your site. `doctor` creates a maximum of three levels here (`root/sub/sub-sub`), as that is what SharePoint supports. Deeper items are ignored.
- **`TopNavigationBar`**: the horizontal navigation at the top of your site. How many levels are visible depends on the site its header configuration. The mega menu shows three levels, the cascading navigation shows two. Check the [`disableMegaMenu`](../../configuration/doctor-json/#site-look-and-feel) option to switch between both.

Any other key you add under `menu` is ignored.

## Adding a page to the navigation

A page adds itself to the navigation with the `menu` property in its front matter. Underneath the location you specify **one** item definition:

```markdown
---
title: Documentation
slug: documentation.aspx

menu:
  QuickLaunch:
    id: documentation
    weight: 1
---

Write here the Doctor page content.
```

The item supports the following properties:

- **id**: `string` (required) - The identifier of the navigation item. Other pages use this value to place themselves underneath this page. The value is lowercased and spaces are removed, so `Getting Started` and `gettingstarted` refer to the same item.
- **name**: `string` (optional) - The title of the navigation item. When it is not defined, the page its `title` is used.
- **weight**: `number` (optional) - Defines the position of the item within its level. Check the [ordering](#ordering) section.
- **parent**: `string` (optional) - The `id` of the item underneath which this page needs to be placed. When it is not defined, the page ends up at the root of the navigation. Check the [hierarchy](#hierarchy) section.

The URL of the item is created automatically. It always points to the page itself: `<your site URL>/sitepages/<slug>`. That is also why the page level definition has no `url` property.

:::note[Info]
Pages with `draft: true` are never added to the navigation.
:::

### Hierarchy

The `parent` property defines where the page ends up. It refers to the `id` of another item, and you can nest deeper by separating the ids with a `/`.

Take the following three pages:

```yaml
# documentation.md
menu:
  QuickLaunch:
    id: documentation
    weight: 1
```

```yaml
# documentation/tools.md
menu:
  QuickLaunch:
    id: tools
    parent: documentation
```

```yaml
# documentation/doctor.md
menu:
  QuickLaunch:
    id: doctor
    parent: documentation/tools
```

Which results in the following Quick Launch structure:

```txt
Documentation
└── Tools
    └── Doctor
```

The order in which the pages are processed does not matter. When a child page refers to a parent which does not exist yet, `doctor` creates a placeholder for it and completes it once the parent page itself is processed.

:::caution[Important]
When the parent page is never processed - it does not exist, it is a draft, or it has no `menu` front matter - the placeholder stays as it is. You end up with a navigation item which uses the `parent` id as its title (in lowercase) and which does not link to a page. If you want such a grouping label on purpose, define it as a [static item](#static-navigation-items) with a `name` in your `doctor.json` file.
:::

### Ordering

Within each level of the navigation, the items are sorted as follows:

1. First all items **with** a `weight`, sorted from low to high.
2. Then all items **without** a `weight`, sorted alphabetically on their name.

This sorting happens per level, so a weight of `1` only makes the item first within its own parent.

## Static navigation items

Not everything in your navigation has to come from a page. Links to a list, an external site, or a grouping label are defined with the `menu` property in the `doctor.json` file:

```json
{
  "menu": {
    "QuickLaunch": {
      "items": [
        {
          "id": "home",
          "name": "Home",
          "url": "https://contoso.sharepoint.com/sites/docs",
          "weight": 1
        },
        {
          "id": "resources",
          "name": "Resources",
          "url": "",
          "weight": 10,
          "items": [
            {
              "id": "github",
              "name": "GitHub",
              "url": "https://github.com/estruyf/doctor"
            }
          ]
        }
      ]
    },
    "TopNavigationBar": {
      "items": []
    }
  }
}
```

Static items use the same `id`, `name`, and `weight` properties as the page level ones, plus:

- **url**: `string` - The link of the item. Use an empty value when you want a grouping label which is not clickable.
- **items**: `array` - The child items of this item. Static items define their children inline, instead of using the `parent` property.

Pages can hook into a static item by using its `id` as their `parent`.

:::note[Note]
The page level definition takes a **single item** underneath the location, the `doctor.json` definition takes an **array of items** underneath the `items` property. That difference is easy to overlook when you copy an example from one to the other.
:::

## What happens on the site

The `Updating navigation` step does not merge with what is already on the site. For every **root** item in the structure it built, `doctor` looks for an existing navigation node with the exact same title. When it finds one, that node and all its children are removed, and the branch is created again from scratch.

This means:

- Navigation nodes which `doctor` does not know about are left alone. Links you added manually in SharePoint stay where they are, as long as they do not have the same title as one of the `doctor` items.
- The matching happens on the title and is case sensitive. When you rename a navigation item, the old node stays behind and needs to be removed manually, or with one of the clean options below.

If you want `doctor` to be the only owner of the navigation, wipe it before the structure gets created:

- [`--cleanQuickLaunch`](../../configuration/cli-options/#publish-command-specific-options): removes all Quick Launch nodes first.
- [`--cleanTopNavigation`](../../configuration/cli-options/#publish-command-specific-options): removes all top navigation nodes first.

With [`--skipNavigation`](../../configuration/cli-options/#publish-command-specific-options) you skip the navigation step completely. Handy when you only want to push content changes, as it also saves you a couple of calls to SharePoint.

## Navigation and change detection

Since `v2.0.0`, `doctor` only processes pages which are new or changed. A page which is skipped does not add itself to the navigation structure, as its front matter is never processed.

For most runs this is not a problem, because untouched branches of the navigation are not rebuilt either. It does matter as soon as a page in the **same branch** changed: that root item gets recreated from what `doctor` knows in this run, which does not include the skipped pages.

So when you changed something about your navigation - a new `parent`, other weights, a renamed item - publish everything once:

```sh
doctor publish --forceAll
```

Combine it with `--cleanQuickLaunch` and/or `--cleanTopNavigation` when you also want to get rid of items which are no longer defined:

```sh
doctor publish --forceAll --cleanQuickLaunch
```

Check the [change detection](../../configuration/cli-options/#change-detection--publish-state) section for more information about the publish state.

## Full example

The following structure:

```txt
src/
├── home.md
├── documentation.md
└── documentation/
    ├── tools.md
    └── doctor.md
```

With this `doctor.json` file:

```json
{
  "menu": {
    "QuickLaunch": {
      "items": [
        {
          "id": "support",
          "name": "Support",
          "url": "https://github.com/estruyf/doctor/issues",
          "weight": 99
        }
      ]
    }
  }
}
```

And these front matter definitions:

```yaml
# home.md
menu:
  QuickLaunch:
    id: home
    name: Home
    weight: 1
```

```yaml
# documentation.md
menu:
  QuickLaunch:
    id: documentation
    weight: 2
```

```yaml
# documentation/tools.md
menu:
  QuickLaunch:
    id: tools
    parent: documentation
```

```yaml
# documentation/doctor.md
menu:
  QuickLaunch:
    id: doctor
    parent: documentation/tools
```

Results in the following Quick Launch:

```txt
Home                 -> /sitepages/home.aspx
Documentation        -> /sitepages/documentation.aspx
└── Tools            -> /sitepages/documentation/tools.aspx
    └── Doctor       -> /sitepages/documentation/doctor.aspx
Support              -> https://github.com/estruyf/doctor/issues
```

## Troubleshooting

**Nothing gets added to the navigation**
: Verify that your `doctor.json` file contains the `menu` property, and that you did not use the `--skipNavigation` flag. Without the `menu` property, the page level definitions are ignored.

**A page is missing from the navigation**
: The page is probably a draft (`draft: true`), or it was skipped because it did not change. Run `doctor publish --forceAll` to rebuild the complete structure.

**An item shows up in lowercase and does not link anywhere**
: This is a placeholder for a `parent` which was never processed. Check the [hierarchy](#hierarchy) section.

**An old item stays in the navigation after a rename**
: `doctor` matches existing nodes on their title, so the old node is not recognized anymore. Use `--cleanQuickLaunch` or `--cleanTopNavigation` to start from a clean navigation.

**Third level items are missing in the Quick Launch**
: SharePoint supports three levels in the Quick Launch. Anything deeper is ignored.

**Nothing seems to happen, but no errors are shown**
: Run the publish command with the `--debug` flag. The navigation structure which `doctor` created is written to the output, which makes it easier to see which items were picked up.
