---
title: Pages
sidebar:
  order: 1
---

You start by creating pages as Markdown files (`.md`) in the source folder (`./src` is the default, but you can change this). The markdown pages should contain the following front matter.

```markdown
---
title: <title>
---

Your article content starts here.
```

- **title**: `string` - The title of the page.

:::note[Info]
Front Matter is the page its metadata.
:::

Optional Front Matter properties are:

- **slug**: `string` - If a slug is not defined, the title and current folder struture will be used. You can add the slug with our without `.aspx` file extension. The tool will automatically add it.
- **draft**: `boolean` - defines if you want to publish the article during the publishing phase. Default: if not defined, the page will always be published.
- **description**: `string` - the page description to add. _Be aware_: description is limited to 255 characters.
- **comments**: `boolean` - with this setting you can enable/disable page commenting. By default comments are enabled, unless you disabled them for the whole site with the [`disableComments`](../../configuration/cli-options/#publish-command-specific-options) option. This page level setting always wins over the global one.
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
  - **authors**: `string[]` - The UPNs (for example `john@contoso.com`) of the authors to show in the page header.
- **menu**: `Menu`- Defines where the page gets added to the navigation structure. Check: [menu section](#menu).
- **metadata**: `Metadata` - With this object you can set extra metadata for your page. Check: [Metadata section](#metadata).
- **partials**: `boolean | { header?: boolean, footer?: boolean }` - Allows you to skip the partials which are added to every page with the [`partials.header` and `partials.footer`](../partials/#adding-a-partial-to-every-page) options. Use `false` to skip them all, or disable them one by one. Default: all configured partials are added.
- **localization**: `{ [locale name]: relative path }[]` - Defines the localization pages linked to the current page. Find out more at [how to setup and use localization](../multilingual).
- **type**: `string` - Specifies the type of page. Currently it supports only `translation` and should only be configured on localization pages. Find out more at [how to setup and use localization](../multilingual).

When you want to create page to page links, you can provide the relative path from the current markdown file to the other markdown file (with or without the `.md` extension).

### Menu

The menu property allows you to create a navigation structure for you static content. The `Menu` object has the following properties:

:::note[Info]
A complete explanation of how the navigation gets created can be found on the [navigation](../navigation) page.
:::

- menu
  - `QuickLaunch` OR `TopNavigationBar` - Default is `QuickLaunch`
    - **id**: `string` (required) - Navigation id. This can be used to create a hierarchy in your navigation.
    - **name**: `string` (optional) - When this property is defined, it will be used for the navigation item title, otherwise the page title will be used.
    - **weight**: `number` (optional) - The weight of the navigation item. If you want to have it first or last.
    - **parent**: `string` (optional) - Defines the hierarchy of you page in the menu. If not provided, the items will be added to the root of the navigation. When defined, it should contain the `id` value of the parent page. You can also add multi-level navigation like: `<parent-id>/<sub-parent-id>`.

:::caution[Important 1]
During the publishing process, the navigation will be re-created each time.
:::

:::caution[Important 2]
When using `QuickLaunch` you can only have three levels of navigation: `Root/sub/sub-sub`.
:::

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

Adding metadata for a page is done by specifying the `metadata` object with corresponding SharePoint field names and their values.

```yaml
metadata:
  <field name>: <value>
```

The field names support multiple formats for lookup:
- **Internal Name** (exact case-insensitive match)
- **Static Name** (case-insensitive match)
- **Display Title** (case-insensitive match)

#### Basic Example

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

#### Supported Field Types

##### Simple Fields

The following field types are passed through unchanged:
- `Text` - Plain text values
- `Note` - Multi-line text values
- `Number` - Numeric values
- `Currency` - Currency values
- `Boolean` - Boolean values (true/false)
- `Choice` - Single choice fields (use the exact choice value)

```yaml
metadata:
  Category: "Choice 1"
  Priority: 5
  Budget: 10000
  Approved: true
```

##### Taxonomy Fields (Managed Metadata)

**Single Taxonomy Field** (`TaxonomyFieldType`):

Input can be a simple string label, or an object with label and optional term GUID:

```yaml
metadata:
  Department: "Finance"
```

Or with explicit term GUID (prevents lookup):

```yaml
metadata:
  Department:
    label: "Finance"
    termGuid: "550e8400-e29b-41d4-a716-446655440000"
```

**Multi Taxonomy Field** (`TaxonomyFieldTypeMulti`):

Input can be an array of labels or objects:

```yaml
metadata:
  Skills:
    - "C#"
    - "TypeScript"
    - label: "Azure"
      termGuid: "660e8400-e29b-41d4-a716-446655440000"
```

When a term GUID is omitted, Doctor resolves the label using Graph API against the associated term set. If resolution fails, the field is skipped and a debug message is logged. Resolution results are cached per run to avoid repeated lookups.

##### User Fields

**Single User Field** (`User`):

Input is a UPN (User Principal Name). Output is formatted as a SharePoint person claim:

```yaml
metadata:
  Owner: "john.doe@contoso.com"
```

Outputs: `[{'Key':'i:0#.f|membership|john.doe@contoso.com'}]`

**Multi User Field** (`UserMulti`):

Input is an array of UPNs:

```yaml
metadata:
  Approvers:
    - "john.doe@contoso.com"
    - "jane.smith@contoso.com"
```

Outputs: `[{'Key':'i:0#.f|membership|john.doe@contoso.com'},{'Key':'i:0#.f|membership|jane.smith@contoso.com'}]`

##### DateTime Fields

Input accepts multiple formats:
- ISO 8601: `"2024-01-15T10:30:45Z"` (converted to local time)
- Date only: `"2024-01-15"` (treated as local midnight)
- Already normalized: `"2024-01-15 10:30:45"` (passed through unchanged)

```yaml
metadata:
  PublishDate: "2024-01-15"
  ReviewDate: "2024-01-20T14:30:00Z"
  ApprovalDate: "2024-01-22 09:00:00"
```

All date-only values are normalized to `yyyy-MM-dd HH:mm:ss` format with local-midnight semantics. Invalid or ambiguous values are logged as debug messages and passed through unchanged, allowing SharePoint to handle the validation.

##### Lookup Fields

**Single Lookup Field** (`Lookup`):

Input is a numeric item ID (integer or numeric string):

```yaml
metadata:
  ParentPage: 42
  ReferencedPage: "123"
```

**Multi Lookup Field** (`LookupMulti`):

Input is an array of numeric IDs, joined with `;#` delimiter:

```yaml
metadata:
  RelatedPages:
    - 1
    - 5
    - 8
```

Non-numeric values are logged as debug messages and skipped; the field is only set if at least one valid ID is found.

##### URL Fields

Input can be a string or an object:

```yaml
metadata:
  # String format (url, description)
  CompanyWebsite: "https://contoso.com, Company Home"
  
  # Object format with url and description
  MoreInfo:
    url: "https://contoso.com/docs"
    description: "Full Documentation"
  
  # Object with url only
  Link:
    url: "https://contoso.com"
```

If an object has no `url` property, the field is skipped with a debug message.

##### Multi-Choice Fields

Input can be a pre-formatted string or an array of values, joined with `;#`:

```yaml
metadata:
  # Pre-formatted string
  Tags: "Tag1;#Tag2;#Tag3"
  
  # Array format (automatically joined)
  Features:
    - "Feature A"
    - "Feature B"
    - "Feature C"
```

Empty strings in arrays are automatically filtered out.

#### Metadata Validation

- Invalid field names (not found on the list) are logged as debug messages and skipped.
- If a field transformation returns `undefined`, that field is skipped and publishing continues.
- Non-fatal errors (e.g., taxonomy term not found) log debug messages but do not block page publishing.
- Transformed metadata is validated before being set on the page; SharePoint validation still applies.

#### Example with Multiple Field Types

```yaml
---
title: Product Documentation
slug: product-guide.aspx
description: "Complete product guide with metadata"

metadata:
  # Simple fields
  Priority: 1
  Approved: true
  
  # Taxonomy (single and multi)
  Category: "Documentation"
  Tags:
    - "Product"
    - "Guide"
  
  # User fields
  Owner: "product-team@contoso.com"
  Reviewers:
    - "alice@contoso.com"
    - "bob@contoso.com"
  
  # DateTime field
  PublishedDate: "2024-01-15"
  
  # Lookup field
  ParentPage: 42
  
  # URL field
  SourceRepository:
    url: "https://github.com/contoso/docs"
    description: "GitHub Repository"
  
  # Multi-choice field
  Features:
    - "Search"
    - "Export"
    - "Print"
---

Your page content here...
```
