import { GraphClient } from './GraphClient';
import { SiteUserInfo } from '../types';

export class UserService {
  constructor(private graphClient: GraphClient) {}

  /** Site-scoped user search (see GraphClient.searchSiteUsers for details). */
  async searchSiteUsers(siteUrl: string, query: string): Promise<SiteUserInfo[]> {
    if (!query || query.length < 2) {
      return [];
    }

    const results = await this.graphClient.searchSiteUsers(siteUrl, query);
    return results.map((user) => ({
      id: user.Id,
      displayName: user.Title,
      email: user.Email || undefined,
      loginName: user.LoginName
    }));
  }
}
