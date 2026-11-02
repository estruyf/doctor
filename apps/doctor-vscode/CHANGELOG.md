# Change Log

## [0.1.0] - 2026-xx-xx

The first release on the Visual Studio Marketplace.

- A **Page Details** side panel for the open markdown file, with doctor's own front matter fields (title, description, draft, homepage, layout, header, template, menu, partials, localization, slug, author, comments) and the other columns of your Site Pages library under **SharePoint metadata**
- A term picker for managed metadata columns and a people picker for person columns, which read the terms and users from your SharePoint site
- `doctor.json` opens as a form with every setting from the doctor.json schema, grouped and described. **Doctor: Open doctor.json as Text** switches back to the JSON, and the `doctor.openConfigInEditor` setting makes text the default
- Completion for doctor's shortcodes and the ones in your `markdown.shortcodesFolder`, with their attributes
- **Doctor: Publish**, **Doctor: Publish All Pages** and **Doctor: Show Publish Status** run doctor as a VS Code task in the folder that holds your `doctor.json`. The project's own `node_modules/.bin/doctor` runs when it has one, otherwise the global `doctor`, or the command in the `doctor.doctorCommand` setting
- Signs in with the certificate authentication in your `doctor.json`. A certificate password that is not in `doctor.json` is asked for once and kept in VS Code's secret storage. Without a usable `doctor.json`, **Doctor: Configure Fallback Sign-in** signs in with a device code
