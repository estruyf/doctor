import * as fs from 'fs';
import * as forge from 'node-forge';
import { ConfidentialClientApplication, LogLevel } from '@azure/msal-node';

/**
 * Certificate-based (application-only) authentication — the primary auth path
 * for this extension. It mirrors how `doctor` itself authenticates: an Entra ID
 * app registration with the "Sites.FullControl.All" application permission,
 * using a client certificate (see the `certificate-authentication` docs on
 * https://getdoctor.io). All settings (appId, tenant, certificate) are read
 * straight from the project's doctor.json — see `utils/doctorConfig.ts`.
 *
 * Since this uses application permissions (client credentials flow), tokens are
 * always requested with the `{resource}/.default` scope, and there is no
 * interactive user sign-in involved.
 */
export class CertificateAuthProvider {
  private constructor(private readonly cca: ConfidentialClientApplication) {}

  static async create(
    appId: string,
    tenant: string,
    certificatePath: string | undefined,
    certificateBase64: string | undefined,
    password?: string
  ): Promise<CertificateAuthProvider> {
    const raw = certificatePath
      ? fs.readFileSync(certificatePath)
      : Buffer.from(certificateBase64 ?? '', 'base64');

    const { thumbprint, privateKey } = CertificateAuthProvider.parseCertificate(raw, password);

    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: appId,
        authority: `https://login.microsoftonline.com/${tenant}`,
        clientCertificate: { thumbprint, privateKey }
      },
      system: {
        loggerOptions: {
          loggerCallback(level, message) {
            if (level === LogLevel.Error) {
              console.error('[CertificateAuth]', message);
            }
          },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Error
        }
      }
    });

    return new CertificateAuthProvider(cca);
  }

  /**
   * Parses a PEM or PKCS#12 (.pfx/.p12) certificate file and extracts the SHA-1
   * thumbprint and private key (as PEM) that MSAL needs for `clientCertificate`.
   * Mirrors the parsing `@pnp/cli-microsoft365` (used by `doctor` itself) performs
   * with `node-forge`, so any certificate that works with `doctor` works here too.
   */
  private static parseCertificate(
    buf: Buffer,
    password?: string
  ): { thumbprint: string; privateKey: string } {
    const asUtf8 = buf.toString('utf8');

    if (asUtf8.includes('-----BEGIN CERTIFICATE-----')) {
      // PEM file — expects both a CERTIFICATE and a PRIVATE KEY block
      const pemObjs = forge.pem.decode(asUtf8);

      const certPemObj = pemObjs.find((o) => o.type === 'CERTIFICATE');
      if (!certPemObj) {
        throw new Error('No CERTIFICATE block found in the PEM file.');
      }
      const cert = forge.pki.certificateFromPem(forge.pem.encode(certPemObj));
      const thumbprint = CertificateAuthProvider.thumbprint(cert);

      const keyPemObj = pemObjs.find((o) => o.type.includes('PRIVATE KEY'));
      if (!keyPemObj) {
        throw new Error(
          'No PRIVATE KEY block found in the PEM file. Use a PEM that contains both the certificate and its private key.'
        );
      }
      const privateKey = forge.pem.encode(keyPemObj);

      return { thumbprint, privateKey };
    }

    // Otherwise treat as PKCS#12 (.pfx / .p12)
    const p12Asn1 = forge.asn1.fromDer(buf.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password ?? '');

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
    if (!keyBag?.key) {
      throw new Error(
        'No private key found in the certificate file. If it is password protected, set doctor-metadata.certificatePassword.'
      );
    }
    const rsaPrivateKey = forge.pki.privateKeyToAsn1(keyBag.key);
    const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaPrivateKey);
    const privateKey = forge.pki.privateKeyInfoToPem(privateKeyInfo);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    if (!certBag?.cert) {
      throw new Error('No certificate found in the certificate file.');
    }
    const thumbprint = CertificateAuthProvider.thumbprint(certBag.cert);

    return { thumbprint, privateKey };
  }

  private static thumbprint(cert: forge.pki.Certificate): string {
    const messageDigest = forge.md.sha1.create();
    messageDigest.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
    return messageDigest.digest().toHex();
  }

  async getSharePointToken(siteUrl: string): Promise<string> {
    const host = new URL(siteUrl).origin;
    const result = await this.cca.acquireTokenByClientCredential({
      scopes: [`${host}/.default`]
    });
    if (!result?.accessToken) {
      throw new Error('Failed to acquire a SharePoint token via certificate authentication.');
    }
    return result.accessToken;
  }
}
