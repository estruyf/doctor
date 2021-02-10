# Changelog

## [1.6.0]

- [#3](https://github.com/ValoIntranet/doctor/issues/3): Added metadata support for pages
- [#34](https://github.com/ValoIntranet/doctor/issues/34): Add support for certificate authentication (provided by [Gustavo Covas](https://github.com/gustavocovas))
- [#44](https://github.com/ValoIntranet/doctor/issues/44): Enhancement: Be able to specify which version of CLI for Microsoft 365 you want to use
- [#47](https://github.com/ValoIntranet/doctor/issues/47): Fix for issue with encoding `<` and `>` in the markdown

## [1.5.0]

- [#33](https://github.com/ValoIntranet/doctor/issues/33): Page template support added
- [#36](https://github.com/ValoIntranet/doctor/issues/36): Enhancement: Added `--skipExistingPages` support
- [#37](https://github.com/ValoIntranet/doctor/issues/37): Fix issue with encoding special characters
- [#38](https://github.com/ValoIntranet/doctor/issues/38): Enhancement: Added `--continueOnError` support
- [#39](https://github.com/ValoIntranet/doctor/issues/39): Fix for navigation command execution
- [#40](https://github.com/ValoIntranet/doctor/issues/40): Fix issue with multiple images on pages
- [#41](https://github.com/ValoIntranet/doctor/issues/41): Fix issue with 2nd level navigation items

## [1.4.0]

- [#17](https://github.com/ValoIntranet/doctor/issues/17): Enhancement: Add support for page description.
- [#18](https://github.com/ValoIntranet/doctor/issues/18): Enhancement: Support for setting header image of the page.
- [#20](https://github.com/ValoIntranet/doctor/issues/20): Enhancement: Add support for title area layout.
- [#25](https://github.com/ValoIntranet/doctor/issues/25): Make `draft` optional.
- [#26](https://github.com/ValoIntranet/doctor/issues/26): Include folder name for slug when not set in front matter.
- [#27](https://github.com/ValoIntranet/doctor/issues/27): Add support in Front Matter to enable or disable page comments. By default they are disabled.
- [#32](https://github.com/ValoIntranet/doctor/issues/32): Added MIT license to the project

## [1.3.1]

- [#28](https://github.com/ValoIntranet/doctor/issues/28): Fix for `cleanStart` when comfirm flag is not provided. Thanks to [Mark Heptinstall](https://github.com/mheptinstall).

## [1.3.0]

- [#7](https://github.com/ValoIntranet/doctor/issues/21): Added parameter to clean up all pages and assets before publishing
- [#19](https://github.com/ValoIntranet/doctor/issues/19): Added support for specifying the `layoutType` from within the front matter
- [#21](https://github.com/ValoIntranet/doctor/issues/21): Implemented easier command execution from within the tool
- [#22](https://github.com/ValoIntranet/doctor/issues/22): Enhanced the test actions with screenshots
- [#23](https://github.com/ValoIntranet/doctor/issues/23): Added process exit codes to make sure it correctly outputs a success or failure status

## [1.2.1] 2020-12-18

- [#16](https://github.com/ValoIntranet/doctor/issues/16): Fix for specified webPartData is not a valid JSON string.

## [1.2.0] 2020-12-18

- [#9](https://github.com/ValoIntranet/doctor/issues/9): Removed the `jq` dependency with a fallback to JSON parsing in the tool itself.
- [#11](https://github.com/ValoIntranet/doctor/issues/11): Unknown arguments do not blow up the command execution + `--help` added to the main command.
- [#12](https://github.com/ValoIntranet/doctor/issues/12): Added cross-platform support.
- [#14](https://github.com/ValoIntranet/doctor/issues/14): Cross-platform builds and publishing setup on GitHub Actions.
- Updated the CLI for Microsoft 365 to 3.4.0 as this has huge performance improvements

## [1.1.0] 2020-12-16

- [#2](https://github.com/ValoIntranet/doctor/issues/2): Added support for linking pages in Markdown.
- Added `outputFolder` argument which when provided, will ouput the processed Markdown files with updated image and page links.

## [1.0.1] 2020-12-15

- [#1](https://github.com/ValoIntranet/doctor/issues/1): Fix for when `m365` tool is not globally available

## [1.0.0] 2020-12-15

- Initial release