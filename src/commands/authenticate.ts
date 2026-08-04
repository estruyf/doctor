import { resolve } from "path";
import { Listr } from "listr2";
import { CommandArguments } from "@models";
import { Logger } from "@helpers";
import { existsAsync } from "@utils";
import { executeCommand } from "@pnp/cli-microsoft365";

const CERTIFICATE_FILE_EXTENSIONS = [".pfx", ".p12", ".pem"];

export class Authenticate {
  /**
   * Executes the M365 CLI login command and normalizes/masks potential errors.
   * @param loginOptions CLI login options passed to the login command.
   * @param toMask Sensitive values that must be masked in command output/errors.
   * @returns A promise that resolves when authentication succeeds.
   */
  private static async executeLogin(loginOptions: any, toMask: string[] = []) {
    try {
      return await executeCommand("login", loginOptions);
    } catch (e: any) {
      const message =
        typeof e === "string"
          ? e
          : e?.error?.message || e?.stderr || e?.message || JSON.stringify(e);
      throw new Error(Logger.mask(this.explain(message), toMask));
    }
  }

  /**
   * Resolves the certificate option to the login option it maps to. A path to a
   * certificate file is passed as "certificateFile", anything else is treated as
   * the base64 encoded contents of that file.
   * @param certificate Path to the certificate file, or its base64 encoded contents.
   * @returns The login options for the certificate, and the values to mask.
   */
  private static async getCertificateOptions(certificate: string) {
    const looksLikeFile = CERTIFICATE_FILE_EXTENSIONS.some((ext) =>
      certificate.toLowerCase().endsWith(ext)
    );

    if (looksLikeFile) {
      const certificatePath = resolve(certificate);

      if (!(await existsAsync(certificatePath))) {
        throw new Error(
          `The certificate file "${certificatePath}" doesn't exist. Provide the path to your certificate file, or its base64 encoded contents, with the "--certificate" option.`
        );
      }

      // The file path is not a secret, so there is nothing to mask.
      return { loginOptions: { certificateFile: certificatePath }, toMask: [] };
    }

    return {
      loginOptions: { certificateBase64Encoded: certificate },
      toMask: [certificate],
    };
  }

  /**
   * MSAL reports the OAuth error code but discards the "error_description" that
   * carries the actual AADSTS code, which leaves sign-in failures hard to act on.
   * This maps the codes we can recognise back to what needs to be changed.
   * @param message The error message reported by the CLI.
   * @returns The message, with guidance appended when the cause is recognised.
   */
  private static explain(message: string): string {
    if (/invalid_client/i.test(message)) {
      return `${message}

Microsoft Entra rejected the app registration. Make sure the certificate you sign in with is uploaded to the app registration under "Certificates & secrets".`;
    }

    if (/post_request_failed|invalid_grant|invalid_request/i.test(message)) {
      return `${message}

Doctor signs in through the CLI for Microsoft 365, which requires your own Entra app registration with the "Sites.FullControl.All" application permission granted. Check the certificate authentication documentation on https://getdoctor.io for the required setup.`;
    }

    return message;
  }

  /**
   * Authenticates against Microsoft 365 with the certificate of an Entra app
   * registration, which is the only supported authentication type.
   * @param options Command options containing authentication settings and debug mode.
   * @returns A promise that resolves when authentication completes successfully.
   */
  public static async init(options: CommandArguments) {
    const { password, tenant, appId, certificate } = options;

    const missing = [
      !appId ? "--appId" : null,
      !tenant ? "--tenant" : null,
      !certificate ? "--certificate" : null,
    ].filter((v): v is string => !!v);

    if (missing.length > 0) {
      throw new Error(
        `Doctor authenticates with the certificate of an Entra app registration. The following required ${
          missing.length === 1 ? "option is" : "options are"
        } missing: ${missing.join(
          ", "
        )}. You can also define them in the doctor.json file.`
      );
    }

    const { loginOptions, toMask } = await this.getCertificateOptions(
      certificate as string
    );

    const certificateLoginOptions: any = {
      authType: "certificate",
      appId,
      tenant,
      ...loginOptions,
    };

    if (password) {
      certificateLoginOptions.password = password;
    }

    await new Listr<object, "default", "verbose">(
      [
        {
          title: `Authenticate to M365 with certificate`,
          task: async () =>
            await this.executeLogin(
              certificateLoginOptions,
              [...toMask, password].filter((v): v is string => !!v)
            ),
        },
      ],
      {
        renderer: "default",
        fallbackRenderer: "verbose",
        fallbackRendererCondition: options.debug || options.verbose,
      }
    ).run();
  }
}
