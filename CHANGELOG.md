# Changelog

## [1.4.0]

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