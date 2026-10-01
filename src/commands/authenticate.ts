import { resolve } from "path";
import { Listr } from "listr2";
import inquirer from "inquirer";
import { CommandArguments } from "@models";
import { CERTIFICATE_PASSWORD_ENV, Logger, OutputHelper } from "@helpers";
import { checkCertificatePassword, existsAsync, readFileAsync } from "@utils";
import { executeCommand } from "@pnp/cli-microsoft365";

const CERTIFICATE_FILE_EXTENSIONS = [".pfx", ".p12", ".pem"];
/** How often a certificate password is asked for before giving up */
const PASSWORD_ATTEMPTS = 3;

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
      return {
        loginOptions: { certificateFile: certificatePath },
        toMask: [],
        contents: async () => (await readFileAsync(certificatePath)) as Buffer,
      };
    }

    return {
      loginOptions: { certificateBase64Encoded: certificate },
      toMask: [certificate],
      contents: async () => Buffer.from(certificate, "base64"),
    };
  }

  /**
   * The password of a certificate that needs one and was not given one.
   *
   * Asked for in the terminal, masked, and checked against the certificate
   * before it is used — so a typo is caught here, in a second, rather than by
   * Entra after a round trip, in an error about the sign-in. It is never
   * echoed, never written anywhere, and lives only as long as this run.
   *
   * Without a terminal to ask in — a pipeline, `--output json`, input piped in —
   * it says what is missing and where to put it, instead of the error the
   * sign-in would end with.
   *
   * @returns the password, or `null` when the certificate needs none or this
   * cannot tell
   */
  private static async askForPassword(
    contents: Buffer
  ): Promise<string | null> {
    if (checkCertificatePassword(contents) !== "wrong") {
      return null;
    }

    const canAsk =
      !!process.stdin.isTTY && !!process.stdout.isTTY && !OutputHelper.isJson();

    if (!canAsk) {
      throw new Error(
        `The certificate is protected with a password, and none was given. Set it in the ${CERTIFICATE_PASSWORD_ENV} environment variable, or pass it with the "--password" option.`
      );
    }

    // Asked again from an empty field rather than through the prompt's own
    // validation, which keeps the rejected text in the box: with every
    // character shown as a dot, there is no telling how much to delete
    for (let attempt = 1; attempt <= PASSWORD_ATTEMPTS; attempt++) {
      const { password } = await inquirer.prompt([
        {
          type: "password",
          name: "password",
          message:
            attempt === 1
              ? "The certificate is protected with a password. Password:"
              : "That password does not open the certificate. Try again:",
          mask: "•",
        },
      ]);

      if (checkCertificatePassword(contents, password) !== "wrong") {
        return password;
      }
    }

    throw new Error(
      `None of the ${PASSWORD_ATTEMPTS} passwords opened the certificate.`
    );
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

    const { loginOptions, toMask, contents } = await this.getCertificateOptions(
      certificate as string
    );

    // `--password`, doctor.json and the environment variable all count as
    // given; only a certificate that needs a password and has none is asked
    // for one
    const secret =
      password ||
      (await this.askForPassword(await contents()).catch((e) => {
        throw new Error(Logger.mask(e?.message || `${e}`, toMask));
      }));

    const certificateLoginOptions: any = {
      authType: "certificate",
      appId,
      tenant,
      ...loginOptions,
    };

    if (secret) {
      certificateLoginOptions.password = secret;
    }

    await new Listr<object, "default", "verbose">(
      [
        {
          title: `Authenticate to M365 with certificate`,
          task: async () =>
            await this.executeLogin(
              certificateLoginOptions,
              [...toMask, secret].filter((v): v is string => !!v)
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
