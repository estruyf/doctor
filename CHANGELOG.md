# Changelog

## [1.2.0] 2020-12-16

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