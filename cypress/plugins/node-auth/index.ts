import * as spauth from 'node-sp-auth';

/**
 * SharePoint authentication via npm dependency
 */
export async function NodeAuth (options: any = {}) {

  // Check if the required options are provided
  if (!options.username || !options.password) {
    throw new Error('Username or password missing.');
  }
  if (!options.siteUrl) {
    throw new Error('Login Url missing')
  }

  // Authenticate
  const data  = await spauth.getAuth(options.siteUrl, {
    username: options.username,
    password: options.password
  });

  return data;
}