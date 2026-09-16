# Changelog
    
## [2.3.0]


- New: a shortcode can set `kind: "control"` to become a SharePoint web part of its own instead of returning HTML. The page is cut at the tag, so one Markdown file can publish as `[markdown] [web part] [markdown]` — for instance a Highlighted content web part between two pieces of text. Besides `webPartProperties`, a control shortcode can return `webPartData` for the web parts which keep state outside their properties. Pages without a control shortcode publish exactly as before.
- A page's controls are now written in one call instead of one per web part, which also means the web parts you added on the SharePoint side keep their place on the page.
- Fix: managed metadata fields can be set from a term label again. The term lookup called the CLI without a term group, so it never resolved and the field was silently left empty — only an explicit `termGuid` worked. Labels are now resolved against the column's term set through the site term store.
- Managed metadata: a column pinned to an anchor term only resolves labels inside that sub-tree, a term can be written by any of its labels, and a duplicate label can be written as a path (`Regions > Europe`).
- Change detection now covers everything a page is built from, not only the markdown file and its partials. A changed image, a renamed page you link to, a changed custom shortcode, a changed publish setting in `doctor.json`, or an edited page template all mark the pages they affect as modified — before, those changes were published only when the page's own text happened to change too, so a renamed page left every link to it pointing at the old URL. Images and linked pages are read once per run however many pages refer to them. Because the hash covers more, the first run after upgrading republishes the whole site once.
- New `--reapplyTemplates` option, which applies a page template to pages which already exist instead of only to the ones Doctor creates. The template's sections become the page layout on every publish and the page's content is written into the slot the template reserves for it — a Markdown web part in the template itself, or a new section below it when the template has none — while the page keeps its own banner — and so its own title — along with its id, URL, history and column values. Off by default, because it also means a section added to a templated page in SharePoint does not survive the next publish.
- The `template` front matter and the `pageTemplate` option now accept a template's file name or page id as well as its page title, so the name you read off the URL works. Doctor also reports when a template is named for a page which already exists, since a template is only applied to pages it creates and that is easy to mistake for a wrong name. A template name which matches nothing is reported as a warning naming the templates the site does have, instead of a line written straight to stdout that corrupted `--output json`.
- Fix: the `author` site user is looked up in the same list the error message quotes, so a valid id is no longer reported as missing. The lookup used `siteusers/GetById()` while the suggestion listed `siteusers`, which could disagree, and the reason SharePoint gave was thrown away — it is now kept when the user list cannot be read at all.
- New: the `author` front matter sets the page author. Takes the SharePoint site user ID (what the Doctor Metadata VS Code extension writes) or a UPN.
- Fix: an image referenced from outside the content folder is uploaded to a shared `assets` folder in the asset library, instead of having the publishing machine's own directory path recreated in SharePoint. A header image at `../assets/logo.png` used to end up under `Users/<name>/repos/.../docs/assets`, which meant nothing on the site and differed per person. Images inside the content folder keep the structure they have there, as before.
- Fix: removing the `header` front matter from a page now resets its banner to the default. It used to leave whatever banner the page already had, so the page kept a header its markdown no longer described. Changing a header setting already reset the ones left out. Pages built from a `template` keep the template's banner, as before.
- Fix: a page whose checkout was left behind by an interrupted run no longer fails with a 409 save conflict. Doctor takes a fresh checkout before writing rather than reading the published page, and a refused save is retried once from the page as it then stands.
- Fix: a page's content is written to the right section again. A page whose top section is a full-width banner had the markdown web part added next to the banner — a layout SharePoint does not allow — while the original web part was left behind in the section below, so the page ended up with two. Doctor now keeps its content in the section it was already in — as long as that is an ordinary content section — otherwise the first ordinary one-column section, and otherwise a new one-column section of its own below the banner. A control an earlier run left in the banner's section is moved out rather than kept there. Full-width and vertical sections are never used for page content. That content section is also rewritten to exactly what the markdown file says — the file is the page, so a web part added there by hand does not survive a publish. Every other section is left alone.
- New: a publish starts by asking the site which permissions the account has, and prints what will and will not run before anything is written. The steps it cannot perform — the navigation and the site design — are skipped rather than attempted and failed, and the ones it can are listed so you know what you are getting. Not being able to create or update pages stops the run immediately, since that is the whole job. A site whose permissions cannot be read is published exactly as before. Skipped together with the other checks by `--skipPrecheck`.
- Fix: the site logo is set with a site scoped call instead of `spo site set`, which reaches the tenant admin site before it gets to the logo. An app registration scoped to one site with `Sites.Selected` cannot do that, and it failed with "Cannot read properties of undefined (reading 'replace')" — nothing to do with the logo.
- Fix: the site logo is found when its path is relative to `doctor.json` rather than to the content folder, which is where every other path in that file is taken from. Both are accepted, and neither matching now says which paths were tried.
- Fix: a publish no longer fails when the account is not allowed to change the site navigation, the site theme, the header and footer, or the site logo. All of these need rights on the web which an account allowed to edit pages does not necessarily have, and the failure came after every page had already been published. Doctor now reports what it left alone and finishes the run. The theme and the logo were already skipped this way, but silently, and only if the refusal happened to be worded in one particular way.
- Fix: setting a page description no longer stops the publish on a tenant which does not allow the account to run a system update. Doctor falls back to a normal update — the description is set, at the cost of the page's `Modified` date changing with it — and says so once per run instead of on every page. The description is now also written before the page is published, so that fallback cannot leave every page sitting with unpublished changes.
- A page whose metadata cannot be worked out is now skipped whole instead of being published with part of it missing. Every value is resolved before anything is written, so a missing column, a term which is not in the term set, an author who is not a user of the site, or a value its column type does not accept leaves the page untouched, reports what was wrong, and carries on with the next page. The page stays out of the publish state, so the next run publishes it once the front matter is fixed.
- Doctor can run on an app registration scoped to a single site with `Sites.Selected`, instead of `Sites.FullControl.All` across the whole tenant. The publish reports which operations the account is allowed to perform and skips the site-level ones it is not, rather than failing part way through. The documentation now covers how to grant it.
- Fix: a page which is skipped keeps its place in the site navigation. The menu is rebuilt from what a run saw, so a page skipped as unchanged in a translation run, or skipped because its metadata could not be worked out, lost its entry — the page itself was left untouched, but it disappeared from the Quick Launch.
- Fix: `--cleanEnd` no longer recycles pages which were only skipped. The cleanup pass removes every page the run did not write, which made it treat a page skipped as unchanged the same as one whose markdown file was deleted.
- Fix: the whole term set is read, not only its first page. The term store answers in pages, so in a set large enough to be split, a perfectly valid label was reported as not being in the set and its page skipped over a term that was there all along.
- Fix: a page template which carries no banner of its own no longer leaves the page with a section that is full width and twelve columns wide at the same time. Applying such a template with `--reapplyTemplates` put the page's own banner in the same zone as the template's first section.
- Fix: a timeout or a throttle while setting a page description is no longer taken as the tenant refusing a system update. One transient failure used to switch the rest of the run to ordinary updates — changing `Modified` and `Modified By` on every remaining page — and report a permission the account actually had.
- A multi-value column now takes its list as a whole: one entry which cannot be read reports the column and skips the page, instead of writing the entries which could be read and silently leaving the rest out. Empty strings in a Choice array are still filtered out.
- A control shortcode's attribute value can contain a `>` — a search query like `Size>1000`, for instance. The tag used to be read as a shortcode sitting mid-paragraph and reported as an error.
- Custom shortcodes can be written as `.mjs` files, alongside the `.js` and `.cjs` files which were already picked up.
- Every step the permissions report says will be skipped is now genuinely skipped. Besides the navigation and the site design, an account which may not set columns skips the 'metadata' and 'author' front matter — without walking the term store or looking users up for values that cannot land — and one which may not write to the asset library skips the pages which have something to upload, rather than publishing them with their pictures pointing at nothing. That covers the images in the content, a 'header.image', and the Mermaid diagrams Doctor draws during the publish, and it stops saving the publish state instead of failing on it once per page. The one line which is not a skip, the system update, says what it costs instead.
- A front matter column whose name is one the underlying CLI uses for its own options is reported instead of quietly redirecting the update somewhere else.
- The `author` front matter and person columns are now resolved against the tenant before anything is written, so a name which does not exist reports the page and skips it instead of failing it after its content has already changed. Resolving also adds the site user when the site has not seen them before — the same thing setting the column does — and uses the login name SharePoint answers with, which is what makes a guest or a group work: their claim is not the shape a principal name is assembled into. Each name is resolved once per run. An account which may not look users up is told once, and the publish carries on without the check.
- Fix: a timeout or a throttle while looking a person up is no longer reported as the name not existing. It was remembered for the rest of the run, so one dropped connection skipped every page naming a perfectly real author, with a warning saying they are not a user of the tenant. Only an answer that says the principal is not there counts as one; anything else fails that page and is asked again on the next. An account which may not look users up is also only asked once now, instead of once per name.
- Fix: a control shortcode's unquoted attribute value may contain a `/`, so `path=/sites/docs` reads as the path it is.
- Fix: a page which fails half way through is no longer removed by `--cleanEnd`. The cleanup pass removes what the run did not write, which made a page whose image would not upload, or whose column would not take its value, indistinguishable from one whose markdown file was deleted.
- Fix: an asset referenced from outside the content folder keeps its own place under the shared `assets` folder, instead of every outside folder collapsing onto it. Two images with the same file name in different folders — `../shared/brand/logo.png` and `../other/brand/logo.png` — became one upload, so whichever was published second overwrote the first or was skipped, and both pages showed the same image.
- Fix: the permission check reads the asset library by its server relative url rather than by its title. `--library` is a path — `Shared Documents` is the folder, while the list is called `Documents` — so on a default site the check learnt nothing about the library it was asked about, and reported that uploads were allowed without having looked.
- Fix: images in the content folder keep the structure they have there again. The configured folder keeps whatever was written in `doctor.json` — `./src` by default — while the paths built from it have had the `./` stripped, so the two never matched and every image was treated as one from outside the content folder. With the default configuration that meant all of them landed in the shared `assets` folder instead of alongside the structure they came from.
- Fix: a content folder written without a leading `./` no longer puts a `./` at the front of every page URL. `"folder": "src"` and `"folder": "./src"` now describe the same folder, as do an absolute path and a relative one.
- Fix: `doctor status` reports what the next publish would actually do. The publish learnt to treat a changed image, a renamed page you link to, an edited shortcode or a changed setting as a change; `status` kept comparing only the markdown and its partials, so it called a page unchanged that the publish then republished — and a pipeline gated on `doctor status --output json` skipped a publish it needed. Both now compute the hash through one entry point, and `status` reports the settings changing the same way the publish does.
- Fix: `--outputFolder` writes to the folder you named when the content folder is written without a leading `./`. It used to build a copy of the absolute output path underneath the working directory instead.

## [2.2.0]


- [#206](https://github.com/estruyf/doctor/issues/206): New: Mermaid diagrams are drawn by `Doctor` while publishing, in the Mermaid version it ships. They used to be left to a script tag the Markdown web part never executes, so SharePoint rendered them with its own older Mermaid, or not at all.

## [2.1.0]


- Fix: the first block of a page is now parsed as markdown instead of being kept as HTML when `markdown.allowHtml` is enabled.
- Fix: pages that were skipped as unchanged no longer disappear from the site navigation.
- Fix: the Azure Translator endpoint of your own resource (`<name>.cognitiveservices.azure.com`) is now called on the right path, and a trailing slash on the endpoint no longer breaks the request.
- Fix: partials are injected into machine translated pages, so their header and footer end up on the translated page in the target language.
- Fix: secrets are kept out of the `--debug` output by property name, which covers `multilingual.translator.key` and no longer mangles values which happen to contain a secret.
- The `multilingual.languages` setting now takes the same locale names as the `localization` front matter, for example `["nl-nl", "fr-fr"]`. LCIDs keep working and both styles can be mixed.
- `doctor status` reports the localized pages, and the language files which no page refers to.
- New `--removeDeleted` flag which recycles the pages whose markdown file got deleted from your sources. It uses the publish state to know which pages Doctor created, and needs to be confirmed with `--confirm`.
- [#59](https://github.com/estruyf/doctor/issues/59): The `workflow` command can now generate an Azure DevOps pipeline with the new `--provider azdo` argument. The default remains GitHub Actions.
- [#119](https://github.com/estruyf/doctor/issues/119): New `markdown.extended` setting to render emoji shortcodes, highlighted text, footnotes, definition lists and task lists. Enabled by default, and requires `markdown.allowHtml`.
- [#198](https://github.com/estruyf/doctor/issues/198): New `partials` setting to reuse markdown snippets on your pages. Include them where you need them with `<include file="..." />`, or let Doctor add them to every page with `partials.header` and `partials.footer`.
- [#198](https://github.com/estruyf/doctor/issues/198): Partials take parameters. Pass them as attributes on the include tag, like `<include file="warning" product="Doctor" />`, and use them in the partial with `{{product}}`. Their default values are set with the `params` front matter of the partial.
- [#199](https://github.com/estruyf/doctor/issues/199): Fix: multilingual pages are published again. Translations are now handled in their own phase which runs after the normal pages, so a translation is no longer skipped when its source page was unchanged. Language files are picked up by their `.lang.md` name, and a failing SharePoint or translator call reports why instead of passing silently.
- [#202](https://github.com/estruyf/doctor/issues/202): New `--output json` argument which silences the human output and writes the result of your `doctor status` or `doctor publish` run as a single JSON document to stdout, so a pipeline can gate on it or turn it into a pull request comment.

## [2.0.0]


- **Breaking**: Doctor now requires Node.js 22.13.0 or higher.
- Full refactoring to support the latest version of the CLI for Microsoft 365.
- New `doctor status` command to see which pages are new, modified, deleted, or unchanged before publishing.
- Publish state is stored on the site (`Shared Documents/.doctor/state.json` by default) and saved after each page, so a failed run can resume where it left off.
- **Breaking**: unchanged pages are skipped by default. Use `--forceAll` to reprocess all pages like in previous versions.
- **Breaking**: the `siteDesign.theme` is no longer applied automatically. Use the new `--applyTheme` flag to apply it.
- **Breaking**: the `certificateBase64Encoded` option is renamed to `certificate`, which accepts the path to your certificate file (`.pfx`, `.p12`, or `.pem`) as well as its base64 encoded contents.
- New pre-process validation which checks the markdown files for duplicate slugs, missing titles, broken localization references, and front matter parse errors before any SharePoint call is made. Can be skipped with `--skipPrecheck`.
- New `--verbose` flag for extended logging output, and `--timingDetails` to show per-page timing statistics after a publishing run.
- New `--disableStatePersistence` and `--stateFile` options to disable or relocate the state file.
- New `--skipExisting` alias for the `--skipExistingPages` option.
- New `--commandTimeout` option to configure the timeout of each command execution, which defaults to 2 minutes.
- Page processing messages now show a `[x/total]` progress counter and the total publishing time is always shown.
- Fix: navigation and link processing no longer fail on pages without a `title` or `slug` in their front matter.
- [#58](https://github.com/estruyf/doctor/issues/58): New `doctor workflow` command which generates the `.github/workflows/doctor.yml` GitHub Actions workflow to publish your documentation.
- [#104](https://github.com/estruyf/doctor/issues/104): New `mermaid` shortcode to render [Mermaid](https://mermaid.js.org/) diagrams on your pages.
- [#112](https://github.com/estruyf/doctor/issues/112): Progress, log, and error messages now show the file path relative to the current folder instead of only the file name, so pages that share a name (like `index.md`) can be told apart. Failed pages are also listed by path in the publishing summary.
- [#171](https://github.com/estruyf/doctor/issues/171): **Breaking**: certificate authentication is now the only supported authentication type. The `deviceCode` type is removed, as it signs you in as a user which does not work for all the APIs Doctor calls, and the `password` type is removed as it is no longer supported by the CLI for Microsoft 365. The `--appId`, `--tenant`, and `--certificate` options are now required.
- [#192](https://github.com/estruyf/doctor/issues/192): Fix: the site logo is now resolved relative to the configured folder instead of the current working directory.

## [1.12.1]


- [#164](https://github.com/estruyf/doctor/issues/164): Fix dependencies

## [1.12.0]


- Updates to support Node.js >= 18
- [#153](https://github.com/estruyf/doctor/issues/153): Added a new `tocLevels` option to define the heading levels to include in the table of contents. Thanks to [Bradley Goulding](https://github.com/BradleyGoulding).

## [1.11.0]


- [#89](https://github.com/estruyf/doctor/issues/89): [Enhancement]: Use Cognitive Service Translation API connection for machine translations
- [#90](https://github.com/estruyf/doctor/issues/90): [Enhancement]: Custom colors for callouts

## [1.10.0]


- [#82](https://github.com/estruyf/doctor/issues/82): [Enhancement]: Allow comments to be disabled at global level
- [#83](https://github.com/estruyf/doctor/issues/83): [Enhancement]: New implementation of the retry logic
- [#84](https://github.com/estruyf/doctor/issues/84): [BUG]: Issue with skipping pages and multilingual
- [#85](https://github.com/estruyf/doctor/issues/85): [BUG]: Fix recording video bug in Cypress during tests
- [#95](https://github.com/estruyf/doctor/issues/95): [Enhancement]: Add test results to the documentation to gain a better view on how they perform

## [1.9.0]


- [#75](https://github.com/estruyf/doctor/issues/75): [Enhancement]: Ability to define a default template in `doctor.json`
- [#76](https://github.com/estruyf/doctor/issues/76): [Enhancement]: Ability to place the table of contents at the `left` or `right` side of the markdown
- [#77](https://github.com/estruyf/doctor/issues/77): [Enhancement]: Add pages in alphabetical order to the navigation (when weight is not defined)
- [#80](https://github.com/estruyf/doctor/issues/80): [Enhancement]: Add multilingual support on site and page level

## [1.8.1]


- [#78](https://github.com/estruyf/doctor/issues/78): [BUG] Fix for fetching all list items via the library title

## [1.8.0]


- [#4](https://github.com/estruyf/doctor/issues/4): [Enhancement]: Added `skipPages`, `skipNavigation`, and `skipSiteDesign` flags
- [#45](https://github.com/estruyf/doctor/issues/45): [Enhancement]: Table of contents shortcode added
- [#63](https://github.com/estruyf/doctor/issues/63): [Enhancement]: Get to know how doctor is used
- [#64](https://github.com/estruyf/doctor/issues/64): [Enhancement]: Post clean-up of removed/untouched pages
- [#65](https://github.com/estruyf/doctor/issues/65): [Enhancement]: Add a delay in the retry mechanism
- [#66](https://github.com/estruyf/doctor/issues/66): [Enhancement]: Autocomplete functionality added for commands and its arguments
- [#70](https://github.com/estruyf/doctor/issues/70): [Enhancement]: Ability to specify to clean the `QuickLaunch` and/or `TopNavigation`
- [#71](https://github.com/estruyf/doctor/issues/71): [Enhancement]: Easier debugging with ability to attach the VSCode debugger
- [#72](https://github.com/estruyf/doctor/issues/72): [Bug]: Fix for encoding characters in codeblocks + tests

## [1.7.0]


- [#5](https://github.com/estruyf/doctor/issues/5): Documentation site created [getdoctor.io](https://getdoctor.io).
- [#6](https://github.com/estruyf/doctor/issues/6): Enhancement to allow Doctor to generate the HTML instead of the Markdown Web Part.
- [#50](https://github.com/estruyf/doctor/issues/50): Fix for skipping pages.
- [#51](https://github.com/estruyf/doctor/issues/51): Enhancement making skipping pages faster without the need to check each page.
- [#52](https://github.com/estruyf/doctor/issues/52): Enhancements to make it possible to change the look and feel of the site.
- [#54](https://github.com/estruyf/doctor/issues/54): Enhancements to set the code editor theme for Markdown.
- [#55](https://github.com/estruyf/doctor/issues/55): Enhancements to minify the CSS provided to the Markdown web part.
- [#56](https://github.com/estruyf/doctor/issues/56): Enhancements to set the site its logo.
- [#57](https://github.com/estruyf/doctor/issues/57): Fix for only retrieving the page its metadata so that encoding of the page its content would not lead to issues.
- [#62](https://github.com/estruyf/doctor/issues/62): Enhancement to specify to retry the command execution if it failed.

## [1.6.0]


- [#3](https://github.com/estruyf/doctor/issues/3): Added metadata support for pages.
- [#34](https://github.com/estruyf/doctor/issues/34): Add support for certificate authentication (provided by [Gustavo Covas](https://github.com/gustavocovas)).
- [#44](https://github.com/estruyf/doctor/issues/44): Enhancement: Be able to specify which version of CLI for Microsoft 365 you want to use.
- [#47](https://github.com/estruyf/doctor/issues/47): Fix for issue with encoding `<` and `>` in the markdown.
- [#48](https://github.com/estruyf/doctor/issues/48): Enhancement: Masking the password and certificate Base64 string in the console.
- [#49](https://github.com/estruyf/doctor/issues/49): Enhancement: Debug configuration for `vscode` added to the project.

## [1.5.0]


- [#33](https://github.com/estruyf/doctor/issues/33): Page template support added.
- [#36](https://github.com/estruyf/doctor/issues/36): Enhancement: Added `--skipExistingPages` support.
- [#37](https://github.com/estruyf/doctor/issues/37): Fix issue with encoding special characters.
- [#38](https://github.com/estruyf/doctor/issues/38): Enhancement: Added `--continueOnError` support.
- [#39](https://github.com/estruyf/doctor/issues/39): Fix for navigation command execution.
- [#40](https://github.com/estruyf/doctor/issues/40): Fix issue with multiple images on pages.
- [#41](https://github.com/estruyf/doctor/issues/41): Fix issue with 2nd level navigation items.

## [1.4.0]


- [#17](https://github.com/estruyf/doctor/issues/17): Enhancement: Add support for page description.
- [#18](https://github.com/estruyf/doctor/issues/18): Enhancement: Support for setting header image of the page.
- [#20](https://github.com/estruyf/doctor/issues/20): Enhancement: Add support for title area layout.
- [#25](https://github.com/estruyf/doctor/issues/25): Make `draft` optional.
- [#26](https://github.com/estruyf/doctor/issues/26): Include folder name for slug when not set in front matter.
- [#27](https://github.com/estruyf/doctor/issues/27): Add support in Front Matter to enable or disable page comments. By default they are disabled.
- [#32](https://github.com/estruyf/doctor/issues/32): Added MIT license to the project.

## [1.3.1]


- [#28](https://github.com/estruyf/doctor/issues/28): Fix for `cleanStart` when comfirm flag is not provided. Thanks to [Mark Heptinstall](https://github.com/mheptinstall).

## [1.3.0]


- [#7](https://github.com/estruyf/doctor/issues/7): Added parameter to clean up all pages and assets before publishing.
- [#19](https://github.com/estruyf/doctor/issues/19): Added support for specifying the `layoutType` from within the front matter.
- [#21](https://github.com/estruyf/doctor/issues/21): Implemented easier command execution from within the tool.
- [#22](https://github.com/estruyf/doctor/issues/22): Enhanced the test actions with screenshots.
- [#23](https://github.com/estruyf/doctor/issues/23): Added process exit codes to make sure it correctly outputs a success or failure status.

## [1.2.1] 2020-12-18


- [#16](https://github.com/estruyf/doctor/issues/16): Fix for specified webPartData is not a valid JSON string.

## [1.2.0] 2020-12-18


- Updated the CLI for Microsoft 365 to 3.4.0 as this has huge performance improvements
- [#9](https://github.com/estruyf/doctor/issues/9): Removed the `jq` dependency with a fallback to JSON parsing in the tool itself.
- [#11](https://github.com/estruyf/doctor/issues/11): Unknown arguments do not blow up the command execution + `--help` added to the main command.
- [#12](https://github.com/estruyf/doctor/issues/12): Added cross-platform support.
- [#14](https://github.com/estruyf/doctor/issues/14): Cross-platform builds and publishing setup on GitHub Actions.

## [1.1.0] 2020-12-16


- Added `outputFolder` argument which when provided, will ouput the processed Markdown files with updated image and page links.
- [#2](https://github.com/estruyf/doctor/issues/2): Added support for linking pages in Markdown.

## [1.0.1] 2020-12-15


- [#1](https://github.com/estruyf/doctor/issues/1): Fix for when `m365` tool is not globally available

## [1.0.0] 2020-12-15


- Initial release
