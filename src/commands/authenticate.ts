import { Listr } from "listr2";
import { CommandArguments } from "@models";
import { Logger } from "@helpers";
import { executeCommand } from "@pnp/cli-microsoft365";

export class Authenticate {
  /**
   * Executes the M365 CLI login command and normalizes/masks potential errors.
   * Optionally streams command output for interactive authentication flows.
   * @param loginOptions CLI login options passed to the login command.
   * @param toMask Sensitive values that must be masked in command output/errors.
   * @param shouldStreamOutput Indicates whether stdout/stderr should be streamed in real time.
   * @returns A promise that resolves when authentication succeeds.
   */
  private static async executeLogin(
    loginOptions: any,
    toMask: string[] = [],
    shouldStreamOutput: boolean = false
  ) {
    try {
      const result = await executeCommand(
        "login",
        loginOptions,
        shouldStreamOutput
          ? {
              stdout: (message: any) => {
                console.log(`${message}`);
              },
              stderr: (message: any) => {
                console.error(`${Logger.mask(`${message}`, toMask)}`);
              },
            }
          : undefined
      );

      if (result.stderr) {
        throw new Error(Logger.mask(result.stderr, toMask));
      }
    } catch (e: any) {
      const message =
        typeof e === "string"
          ? e
          : e?.error?.message || e?.stderr || e?.message || JSON.stringify(e);
      throw new Error(Logger.mask(message, toMask));
    }
  }

  /**
   * Authenticates against Microsoft 365 using the configured auth mode.
   * Supports device code, certificate-based, and username/password flows.
   * @param options Command options containing authentication settings and debug mode.
   * @returns A promise that resolves when authentication completes successfully.
   */
  public static async init(options: CommandArguments) {
    const {
      auth,
      username,
      password,
      tenant,
      appId,
      certificateBase64Encoded,
    } = options;

    await new Listr<object, "default", "verbose">(
      [
        {
          title: `Authenticate to M365 with ${auth}`,
          task: async () => {
          if (auth === "deviceCode") {
            await this.executeLogin({}, [], true);
          } else if (auth === "certificate") {
            const certificateLoginOptions: any = {
              authType: "certificate",
              appId,
              tenant,
              certificateBase64Encoded,
            };

            if (password) {
              certificateLoginOptions.password = password;
            }

            await this.executeLogin(certificateLoginOptions, [
              certificateBase64Encoded,
              password,
            ]);
          } else {
            await this.executeLogin(
              {
                authType: "password",
                userName: username,
                password,
              },
              [password]
            );
          }
        },
      },
    ],
    {
      renderer: "default",
      fallbackRenderer: "verbose",
      fallbackRendererCondition: options.debug,
    }
    ).run();
  }
}
