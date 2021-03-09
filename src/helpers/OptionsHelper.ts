import * as arg from 'arg';
import * as path from 'path';
import * as fs from 'fs';
import * as kleur from 'kleur';
import * as inquirer from 'inquirer';
import { CommandArguments } from "../models/CommandArguments";
import { Command } from '../commands/Command';

export class OptionsHelper {

  /**
   * Fetch the config stored in the current project
   */
  public static fetchConfig(): any {
    const configPath = path.join(process.cwd(), 'doctor.json');
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, { encoding: "utf-8" });
      if (config) {
        return JSON.parse(config);
      }
    }
    return {};
  }

  /**
   * Retrieve all arguments for doctor
   */
  public static getArgs() {
    return {
      '--auth': String,
      '--username': String,
      '--password': String,
      '--tenant': String,
      '--appId': String,
      '--certificateBase64Encoded': String,
      '--commandName': String,
      '--folder': String,
      '--url': String,
      '--library': String,
      '--webPartTitle': String,
      '--outputFolder': String,
      '--pageTemplate': String,

      '--overwriteImages': Boolean,
      '--skipExistingPages': Boolean,
      '--debug': Boolean,
      '--cleanStart': Boolean,
      '--cleanEnd': Boolean,
      '--cleanQuickLaunch': Boolean,
      '--cleanTopNavigation': Boolean,
      '--confirm': Boolean,
      '--skipExisting': Boolean,
      '--continueOnError': Boolean,
      '--retryWhenFailed': Boolean,
      '--disableTracking': Boolean,
      '--skipPages': Boolean,
      '--skipNavigation': Boolean,
      '--skipSiteDesign': Boolean,

      '-a': '--auth',
      '-f': '--folder',
      '-u': '--url'
    };
  }

  /**
   * Parse command arguments
   * @param options 
   * @param rawArgs 
   */
  public static parseArguments(options: any, rawArgs: string[]): CommandArguments {
    const args = arg(
      this.getArgs(),
      {
        argv: rawArgs.slice(2),
        permissive: true
      }
    );
    
    return {
      task: args._[0] ? args._[0].startsWith('--help') ? 'help' : args._[0] : null,
      auth: args["--auth"] as any || options["auth"] || "deviceCode",
      overwriteImages: args["--overwriteImages"] as any || options["overwriteImages"] || false,
      username: args["--username"] || options["username"] || null,
      password: args["--password"] || options["password"] || null,
      tenant: args["--tenant"] || options["tenant"] || null,
      appId: args["--appId"] || options["appId"] || null,
      certificateBase64Encoded: args["--certificateBase64Encoded"] || options["certificateBase64Encoded"] || null,
      commandName: args["--commandName"] || options["commandName"] || "localm365",
      webUrl: args["--url"] || options["url"] || null,
      startFolder: args["--folder"] || options["folder"] || './src',
      startFolderRel: args["--folder"] || options["folder"] || './src',
      assetLibrary: args["--library"] || options["library"] || 'Shared Documents',
      webPartTitle: args["--webPartTitle"] || options["webPartTitle"] || 'doctor-placeholder',
      skipPrecheck: args["--skipPrecheck"] as any || options["skipPrecheck"] || false,
      skipExistingPages: args["--skipExistingPages"] as any || options["skipExistingPages"] || false,
      continueOnError: args["--continueOnError"] as any || options["continueOnError"] || false,
      retryWhenFailed: args["--retryWhenFailed"] as any || options["retryWhenFailed"] || false,
      disableTracking: args["--disableTracking"] || false,
      menu: options["menu"] || null,
      debug: (process.env.DEBUG && process.env.DEBUG === "true") || args["--debug"] || false,
      cleanEnd: args["--cleanEnd"] || false,
      cleanStart: args["--cleanStart"] || false,
      confirm: args["--confirm"] || false,
      outputFolder: args["--outputFolder"] || "",
      siteDesign: options["siteDesign"] || null,
      markdown: options["markdown"] || null,
      multilingual: options["multilingual"] || null,
      shortcodesFolder: options["markdown"] && options["markdown"]["shortcodesFolder"] ? options["markdown"]["shortcodesFolder"] : "./shortcodes",
      skipPages: args["--skipPages"] || false,
      skipNavigation: args["--skipNavigation"] || false,
      skipSiteDesign: args["--skipSiteDesign"] || false,
      cleanQuickLaunch: args["--cleanQuickLaunch"] || options["cleanQuickLaunch"] || false,
      cleanTopNavigation: args["--cleanTopNavigation"] || options["cleanTopNavigation"] || false,
      pageTemplate: args["--pageTemplate"] || options["pageTemplate"] || null
    };
  }

  /**
   * Prompt for missing parameters
   * @param options 
   */
  public static async promptForMissingArgs(options: CommandArguments) {
    const questions = [];
  
    if (!options.task) {
      questions.push({
        type: 'list',
        name: 'task',
        message: 'Which command do you want to execute?',
        choices: [...Object.keys(Command)]
      });
    }
    
    if (!options.startFolder) {
      questions.push({
        type: 'input',
        name: 'startFolder',
        message: 'In which folder are your markdown files located?',
        validate: (input: any) => {
          const folderPath = path.join(process.cwd(), input);
          if (!fs.existsSync(folderPath)) {
            console.log(``);
            console.log(kleur.red(`The specified folder "${folderPath}" doesn't exist. Please specify another folder.`));
            return false;
          }
          return true;
        }
      });
    }
  
    if (options.auth && options.auth === "password" && !options.username) {
      questions.push({
        type: 'input',
        name: 'username',
        message: 'What is the username?'
      });
    }
    
    if (options.auth && options.auth === "password" && !options.password) {
      questions.push({
        type: 'password',
        name: 'password',
        message: 'What is the password?'
      });
    }

    if (options.cleanEnd && !options.confirm) {
      questions.push({
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to clean up all pages which have not been touched?',
        default: false
      });
    }

    if (options.cleanStart && !options.confirm) {
      questions.push({
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to clean up all pages and assets?',
        default: false
      });
    }
    
    try {
      const answers = await inquirer.prompt(questions);

      return {
        ...options,
        task: options.task || answers.task,
        username: options.username || answers.username,
        password: options.password || answers.password,
        startFolder: path.join(process.cwd(), options.startFolder || answers.startFolder),
        confirm: options.confirm || answers.confirm
      };
    } catch (e) {
      throw e.message;
    }
  }
}