---
title: Changelog
date: 2021-02-22T10:10:32.941Z
icon: ti-bolt
description: The changelog of Doctor
type: docs-main
---

## [1.8.0]


- [#4](https://github.com/estruyf/doctor/issues/4): [Enhancement]: Added `skipPages`, `skipNavigation`, and `skipSiteDesign` flags
- [#45](https://github.com/estruyf/doctor/issues/45): [Enhancement]: Table of contents shortcode added
- [#63](https://github.com/estruyf/doctor/issues/63): [Enhancement]: Get to know how doctor is used
- [#65](https://github.com/estruyf/doctor/issues/65): [Enhancement]: Add a delay in the retry mechanism
- [#66](https://github.com/estruyf/doctor/issues/66): [Enhancement]: Autocomplete functionality added for commands and its arguments
- [#71](https://github.com/estruyf/doctor/issues/71): [Enhancement]: Easier debugging with ability to attach the VSCode debugger

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
