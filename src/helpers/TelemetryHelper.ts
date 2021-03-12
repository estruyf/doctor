import { CommandArguments } from '../models';
import { CliCommand } from '.';
import appInsights from './AppInsights';

export class TelemetryHelper {

  /**
   * Get information about how doctor is used
   * @param options 
   */
  public static trackTask(options: CommandArguments): void {
    if (!options.disableTracking) {
      appInsights.trackEvent({
        name: options.task,
        properties: {
          debug: options.debug,
          auth: options.auth,
          commandName: options.commandName,
          confirm: options.confirm,
          continueOnError: options.continueOnError,
          markdown: !!options.markdown,
          markdown_allowHtml: options.markdown ? !!options.markdown.allowHtml : false,
          markdown_theme: options.markdown ? !!options.markdown.theme : false,
          siteDesign: !!options.siteDesign,
          siteDesign_chrome: options.siteDesign ? !!options.siteDesign.chrome : false,
          siteDesign_logo: options.siteDesign ? !!options.siteDesign.logo : false,
          siteDesign_theme: options.siteDesign ? !!options.siteDesign.theme : false,
          skipExistingPages: !!options.skipExistingPages,
          skipPages: !!options.skipPages,
          skipNavigation: !!options.skipNavigation,
          skipSiteDesign: !!options.skipSiteDesign,
          cleanStart: !!options.cleanStart,
          cleanEnd: !!options.cleanEnd,
          cleanQuickLaunch: !!options.cleanQuickLaunch,
          cleanTopNavigation: !!options.cleanTopNavigation,
          webPartTitle: !!options.webPartTitle
        }
      });
      appInsights.flush();
    }
  }

  /**
   * Get information about if custom shortcodes are used
   * @param options 
   */
  public static trackCustomShortcodes(scLength: number): void {
    if (!CliCommand.getDisableTracking()) {
      appInsights.trackEvent({
        name: `shortcode-register`,
        properties: {
          nrOfShortcodes: scLength
        }
      });
      appInsights.flush();
    }
  }

  /**
   * Get information about the usage of shortcodes in markdown
   * @param options 
   */
  public static trackShortcodeUsage(scLength: number): void {
    if (!CliCommand.getDisableTracking()) {
      appInsights.trackEvent({
        name: `shortcode-usage`,
        properties: {
          nrOfShortcodes: scLength
        }
      });
      appInsights.flush();
    }
  }
}