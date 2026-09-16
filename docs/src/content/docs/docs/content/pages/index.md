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
- **template**: `string` - the name of the page template to use for this page. Check: [Page templates](#page-templates).
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
- **author**: `number | string` - Sets the page author (SharePoint's `Author` column). Use the **site user ID** — the id the user has in this site's own user list — or their UPN (for example `john@contoso.com`). Check: [Author section](#author).
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

### How the page is built

`Doctor` owns one section of the page: the markdown file is the page, so that section is rewritten to
exactly what the file says on every publish.

- The **page banner** keeps the full-width section at the top of the page, on its own. A full-width
  section holds a single web part, so nothing else is ever put there.
- The **content** goes in the first ordinary one-column section. If the page has none — a page which
  is only a banner, for instance — one is created below it.
- Once a page has content, it stays in the section it is in. Re-publishing never moves it.
- Every **other** section is left untouched: a vertical section, and anything the `template` front
  matter brings along. `Doctor` has no way to describe a vertical section's contents in markdown, so
  it never writes to one.

The **banner** follows the [`header`](#front-matter) front matter the same way. Changing a setting
applies it and resets the ones you left out, and removing the `header` block altogether puts the
banner back to the default — a page never keeps a header its markdown no longer describes. The one
exception is a page built from a `template`, which keeps the template's banner.

:::caution[Do not edit a Doctor page in SharePoint]
Anything added to `Doctor`'s content section on the SharePoint side is removed on the next publish,
because that section is rebuilt from the markdown file. Edit the markdown, not the page.
:::

### Page templates

A page can be created from one of the site's own **page templates**, so every page starts with the
same sections, banner and web parts.

Set it for a single page in its front matter:

```yaml
---
title: Extensions
template: PageTemplate
---
```

Or for every page at once, with the [`pageTemplate`](../../configuration/cli-options/#--pagetemplate)
option in `doctor.json`:

```json
{
  "pageTemplate": "PageTemplate"
}
```

The value can be the template's **page title**, its **file name**, or its **page id** — whichever you
have to hand. A template saved in SharePoint lives under `SitePages/Templates/`, and its file name is
usually not the same as its title, so all three work:

```yaml
template: Documentation Template        # the page title
template: Documentation-Template.aspx   # the file name, as it appears in the URL
template: Documentation-Template        # the file name without the extension
template: 144                           # the page id
```

The page title is matched exactly first, then the rest case-insensitively. List the templates of your
site to see what it has:

```bash
m365 spo page template list --webUrl https://<tenant>.sharepoint.com/sites/<site> --output json
```

:::caution[A template is applied when the page is created]
`Doctor` builds a page from its template the first time it creates it. A page which already exists on
the site keeps the layout it has, even if you add `template` to its front matter afterwards.
`Doctor` reports this once per run when it happens.

Use [`--reapplyTemplates`](../../configuration/cli-options/#--reapplytemplates) to apply the template
to existing pages too — see below.
:::

#### Re-applying a template to existing pages

`--reapplyTemplates`, or `"reapplyTemplates": true` in `doctor.json`, lays a page out from its
template on **every** publish instead of only when the page is created:

1. the template's canvas becomes the page's layout — its sections, and any web parts it carries;
2. the page keeps **its own banner**, so it keeps its own title and header image. A banner stores the
   page title inside the web part, so taking the template's would put the template's title on every
   page using it;
3. the page's content is written into the slot the template reserves for it — the Markdown web part
   the template itself contains. A template which has none gets a new section below its own, so the
   web parts it does carry are never cleared to make room;
4. the page keeps its id, URL, history, comments and column values. Nothing is recreated.

The template is read once per run, however many pages use it.

:::caution[The page layout is rebuilt every publish]
With this on, a section somebody added to a templated page in SharePoint is gone the next time that
page is published. That is the point of the setting — the template plus the markdown file describe
the page — but it is why it is off by default.
:::

:::caution[A name that does not match does not fail the publish]
If nothing matches, `Doctor` warns — naming the templates the site does have — and creates an
ordinary page instead. The publish still succeeds, so it is worth reading the warnings at the end of
a run rather than assuming a template was applied.
:::

A page created from a template keeps the template's **banner**: the `header` front matter is not
applied to it, so the template stays in charge of how the top of the page looks. The page content
still comes from the markdown as always.

The [`doctor-sample`](https://github.com/estruyf/doctor-sample) repository shows the setting in use.

### Images and other assets

An image a page refers to is uploaded to the asset library (`--library`, `Shared Documents` by
default) and the reference in the page is rewritten to point at it.

- An image **inside** your content folder keeps the structure it has there. `guides/img/logo.png`
  is uploaded to `guides/img/logo.png` in the library.
- An image **outside** it — `../assets/logo.png`, for instance, or anything else reached with `..` —
  has no structure to mirror, so it goes in a single `assets` folder in the library.

:::note[Shared assets land together]
Because every asset from outside the content folder shares one `assets` folder, two files with the
same name from different folders end up as one. Give them distinct names, or keep them inside the
content folder where their own structure is preserved.
:::

### Author

`Doctor` can set the page's author — SharePoint's own `Author` column, which is what the page shows
as its byline and what people filter on in the pages library.

```yaml
---
title: Release notes
author: 12
---
```

The value is the user's **site user ID**: the id they have in *this* site's user list. A user only
has one once they are a member of the site or have visited it, which is why the id means nothing on
another site. The Doctor Metadata VS Code extension picks one for you, or you
can look it up at `https://<site>/_api/web/siteusers`.

A UPN works too, for front matter written by hand:

```yaml
author: john@contoso.com
```

A UPN does **not** have to belong to the site already. `Doctor` asks SharePoint to resolve it against
the tenant before it writes anything, which adds the site user when the site has not seen them
before — the same thing setting the column would have done. What it gets back is the login name
SharePoint stored, which is what ends up on the page: that matters for guests and groups, whose
claims are not the `i:0#.f|membership|` shape a UPN is assembled into.

If the id does not exist on the site, or the name does not exist in the tenant, the page is skipped —
see [below](#what-happens-when-a-value-cannot-be-set). For an id, the warning lists a few that do
exist.

:::note[Not the same as the header authors]
`author` is the SharePoint column. The `header.authors` setting is a different thing — the list of
people shown *inside* the page header — and takes UPNs. You can use both.
:::

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

When a term GUID is omitted, `Doctor` resolves the label against the column's term set, reading the
term store through the site (`_api/v2.1/termStore`). Terms are read once per term set per run.

A few things are worth knowing:

- **Anchored columns.** When the column is pinned to a sub-tree of its term set (an anchor term),
  only that sub-tree is searched — the same terms the column actually allows.
- **Synonyms work.** A term can be written by any of its labels, not only the default one.
- **Duplicate labels.** Term sets often reuse a label in different branches. Write the path to say
  which one is meant:

  ```yaml
  metadata:
    Region: "Regions > Europe"
  ```

- **An unknown or ambiguous term skips the page** — see [below](#what-happens-when-a-value-cannot-be-set).
  The warning names the term and, when it is ambiguous, the paths it matched. Give an explicit
  `termGuid` to bypass the lookup entirely.
- **Deprecated terms are ignored**, since SharePoint does not accept them on an item anyway.

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

Every name on a person column is resolved against the tenant before the page is written, and the
login name SharePoint answers with is the one that ends up on the page — so a guest or a group gets
the claim SharePoint actually matches on, rather than one assembled from the name. A name the tenant
does not have is reported and its page is skipped, and that goes for the whole column: if one of the
`Approvers` cannot be resolved, none of them are written.

Resolving a name also adds the site user when the site has not seen them before, which is what
setting the column would have done anyway. Each name costs one lookup per run however many pages use
it.

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

Empty strings in a **Choice** array are filtered out.

Every other multi-value column takes the list as a whole: if one entry cannot be read — a person
column entry which is not a user principal name, a lookup entry which is not an item id, a managed
metadata entry which is neither a label nor a `{ label, termGuid }` pair — the column is reported as
a problem and the page is skipped. `Doctor` does not write the entries it could read and leave the
rest out, because that would put a shorter list on the page than the markdown asks for, without
saying so.

#### What happens when a value cannot be set

`Doctor` works out every metadata value **before it writes anything**. If any of them cannot be
resolved — the column does not exist on the Site Pages library, a term is not in the term set, an
author is not a user of the site, a value is not one its column type accepts — the page is **skipped
whole**:

1. a warning names the page and every problem found on it;
2. **nothing on that page is touched** — its content, header and metadata stay exactly as they were,
   so it is never left with new content and stale metadata;
3. it stays out of `.doctor/state.json`, so the next run does not consider it unchanged and publishes
   it once the front matter is fixed;
4. the run carries on with the next page, and ends successfully.

Skipped pages are counted with the skipped pages in the summary. The warnings are listed at the end
of the run, and in the `warnings` array when using `--output json`.

:::caution[A typo holds back the whole page]
Because the page is skipped as a unit, a mistake in one metadata value also stops that page's
*content* changes from being published. That is deliberate — it keeps the page consistent — but it
does mean the warnings at the end of a run are worth reading.
:::

#### What gets checked

- **The column has to exist** on the Site Pages library. `Doctor` matches on its internal name, its
  static name or its display name, case insensitively. A handful of internal names cannot be set
  because the CLI underneath reads them as its own options (`webUrl`, `listId`, `id`,
  `contentType`, `output` and a few more); one of those is reported rather than sent.
- **The value has to be one its column type accepts** — an item id for a lookup column, a user
  principal name for a person column, a term which is in the set for a managed metadata one.
- **People are resolved against the tenant**, which is also what adds the site user when the site has
  not seen them before. A name the tenant does not have is a problem. If the account is not allowed
  to look users up, `doctor` says so once and carries on without the check — an unknown name then
  fails its page while it is being written, instead of being reported before.

None of this runs when the account is not allowed to set columns on the Site Pages library at all. In
that case the `metadata` and `author` front matter is skipped for every page, reported once, and the
pages themselves are published as normal — see
[available permissions](../../configuration/cli-options/#available-permissions).
- **Terms are resolved against the column's own term set**, honouring its anchor term, the term's
  other labels and a `Parent > Child` path. A label which matches more than one term is reported as
  a problem rather than guessed at.
- **SharePoint still validates on its side.** A value which passes these checks can still be refused
  by the library itself — that is a publishing error like any other, and it fails the page rather
  than skipping it.

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
