# Changelog
    
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
