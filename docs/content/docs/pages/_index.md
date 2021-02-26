---
title: Pages
date: 2021-02-22T10:06:07.167Z
lastmod: 2021-02-22T10:06:07.167Z
weight: 2
draft: false
keywords:
  - ''
---


You start by creating pages as Markdown files (`.md`) in the source folder (`./src` is the default, but you can change this). The markdown pages should contain the following front matter.

```markdown
---
title: <title>
---

Your article content starts here.
```

- **title**: `string` - The title of the page.

> **Info**: Front Matter is the page its metadata.

Optional Front Matter properties are:

- **slug**: `string` - If a slug is not defined, the title and current folder struture will be used. You can add the slug with our without `.aspx` file extension. The tool will automatically add it.
- **draft**: `boolean` - defines if you want to publish the article during the publishing phase. Default: if not defined, the page will always be published.
- **description**: `string` - the page description to add. *Be aware*: description is limited to 255 characters.
- **comments**: `boolean` - with this setting you can enable/disable page commenting. By default this is disabled.
- **layout**: `Article` | `Home` - defines which page layout you want to use. Default layout type is `Article`.
- **template**: `string` - specify the title of the page template which you want to use for the current page.
- **header**: `HeaderOptions` - defines how you want to render the header on the page.
  - **type**: Use one of the following values: `None|Default|Custom`. Default: `Default`.
  - **image**: Path to the image file you want to use in your page header.
  - **altText**: The image description.
  - **translateX**: X focal point of the header image.
  - **translateY**: Y focal point of the header image.
  - **layout**: Layout to use in the header. Allowed values `FullWidthImage|NoImage|ColorBlock|CutInShape`. Default: `FullWidthImage`.
  - **textAlignment**: How to align text in the header. Allowed values `Center|Left`. Default: `Left`.
  - **showTopicHeader**: Specify if you want to show the topic header above the title. Default: `false`.
  - **topicHeader**: Topic header text to show.
  - **showPublishDate**: Show the publish date in the header. Default: `false`.
- **menu**: `Menu`- defines where the page gets added to the navigation structure. Check: [menu section](#Menu).
- **metadata**: `Metadata` - with this object you can set extra metadata for your page. Check: [Metadata section](#Metadata).

When you want to create page to page links, you can provide the relative path from the current markdown file to the other markdown file (with or without the `.md` extension).

### Menu

The menu property allows you to create a navigation structure for you static content. The `Menu` object has the following properties:

- menu
  - `QuickLaunch` OR `TopNavigationBar` - Default is `QuickLaunch`
    - **id**: `string` (required) - Navigation id. This can be used to create a hierarchy in your navigation.
    - **name**: `string` (optional) - When this property is defined, it will be used for the navigation item title, otherwise the page title will be used.
    - **weight**: `number` (optional) - The weight of the navigation item. If you want to have it first or last.
    - **parent**: `string` (optional) - Defines the hierarchy of you page in the menu. If not provided, the items will be added to the root of the navigation. When defined, it should contain the `id` value of the parent page. You can also add multi-level navigation like: `<parent-id>/<sub-parent-id>`.

> **Important 1**: During the publishing process, the navigation will be re-created each time.

> **Important 2**: When using `QuickLaunch` you can only have three levels of navigation: `Root/sub/sub-sub`.

#### Example 1

The following page will be added to the root of the `QuickLaunch` after the already defined links. 

```markdown
---
title: Documentation
slug: documentation.aspx
draft: false

menu:
  QuickLaunch:
    id: documentation
    weight: 1
---

Write here the Doctor page content.
```

#### Example 2

The following page adds a subpage underneath the documentation link in the navigation.

```markdown
---
title: Tools
slug: documentation/tools.aspx
draft: false

menu:
  QuickLaunch:
    id: tools
    weight: 1
    parent: documentation
---

Write here the tools page content.
```

#### Example 3

Defines a new page under the tools section:

```markdown
---
title: Doctor
slug: documentation/doctor.aspx
draft: false

menu:
  QuickLaunch:
    id: doctor
    weight: 1
    parent: documentation/tools
---

Write here the Doctor page content.
```

### Metadata

Adding metadata for a page is fairly simple. You can do this by specifying the `metadata` object with corresponding `field name` and its `value`.

```yaml
metadata:
  <field name>: <value>
```

#### Example

```yaml
---
title: Home
slug: home.aspx
layout: Article
description: "The Doctor documentation homepage"

metadata:
  Category: "Choice 1"
  SingleLineText: "Single line of text value"
---
```