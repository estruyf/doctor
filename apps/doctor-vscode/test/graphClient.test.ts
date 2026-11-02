import axios from 'axios';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GraphClient } from '../src/graph/GraphClient';

vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

const SITE = 'https://contoso.sharepoint.com/sites/docs';

const claim = (upn: string) => `i:0#.f|membership|${upn}`;

const siteUser = (id: number, title: string, upn: string, email?: string) => ({
  Id: id,
  Title: title,
  Email: email ?? '',
  LoginName: claim(upn)
});

const urlOf = () => decodeURIComponent(vi.mocked(axios.get).mock.calls[0][0] as string);

describe('GraphClient.searchSiteUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks only for operators SharePoint implements', async () => {
    // SharePoint's OData has no tolower/toupper. Asking for one does not
    // degrade to a case-sensitive match — it fails the whole request with
    // "The function operator 'tolower' is not supported or its usage is
    // invalid", so the picker returns nothing at all.
    vi.mocked(axios.get).mockResolvedValue({ data: { value: [] } });
    const client = new GraphClient(async () => 'sharepoint-token');

    await client.searchSiteUsers(SITE, 'John');

    expect(urlOf()).not.toMatch(/tolower\(|toupper\(/);
  });

  it('matches the display name and the login name', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { value: [] } });
    const client = new GraphClient(async () => 'sharepoint-token');

    await client.searchSiteUsers(SITE, 'John@Con');

    const url = urlOf();
    // The term is sent as typed: SharePoint compares with a case-insensitive
    // collation, so folding it buys nothing
    expect(url).toContain("substringof('John@Con',Title)");
    expect(url).toContain("substringof('John@Con',LoginName)");
    expect(url).toContain('PrincipalType eq 1');
  });

  it('does not match on Email, which is a profile value rather than a sign-in address', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { value: [] } });
    const client = new GraphClient(async () => 'sharepoint-token');

    await client.searchSiteUsers(SITE, 'john');

    expect(urlOf()).not.toContain(',Email)');
  });

  it('escapes a quote in the search term rather than breaking the filter', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { value: [] } });
    const client = new GraphClient(async () => 'sharepoint-token');

    await client.searchSiteUsers(SITE, "O'Brien");

    expect(urlOf()).toContain("substringof('O''Brien',Title)");
  });

  it('drops the users who only matched inside the claims prefix', async () => {
    // Every login name contains `i:0#.f|membership|`, so a short term like
    // `me` matches every user on the site and buries the real one
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        value: [
          siteUser(1, 'Anna Jansen', 'anna@contoso.com'),
          siteUser(2, 'Bert Peeters', 'bert@contoso.com'),
          siteUser(3, 'Mehdi Karimi', 'mehdi@contoso.com')
        ]
      }
    });
    const client = new GraphClient(async () => 'sharepoint-token');

    const results = await client.searchSiteUsers(SITE, 'me');

    expect(results.map((u) => u.Title)).toEqual(['Mehdi Karimi']);
  });

  it('keeps a match on the sign-in address itself', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        value: [
          siteUser(1, 'Anna Jansen', 'anna@contoso.com'),
          siteUser(2, 'Tommy Peeters', 'tommy@contoso.com')
        ]
      }
    });
    const client = new GraphClient(async () => 'sharepoint-token');

    const results = await client.searchSiteUsers(SITE, 'tommy@');

    expect(results.map((u) => u.Title)).toEqual(['Tommy Peeters']);
  });

  it('narrows case insensitively, so the term does not have to match the stored casing', async () => {
    // Only doctor's own narrowing is under test here. Whether SharePoint's
    // substringof is case insensitive is SharePoint's business and a mocked
    // response cannot say anything about it.
    vi.mocked(axios.get).mockResolvedValue({
      data: { value: [siteUser(1, 'Tommy Peeters', 'tp@contoso.com')] }
    });
    const client = new GraphClient(async () => 'sharepoint-token');

    expect((await client.searchSiteUsers(SITE, 'tommy')).length).toBe(1);
    vi.clearAllMocks();
    vi.mocked(axios.get).mockResolvedValue({
      data: { value: [siteUser(1, 'Tommy Peeters', 'tp@contoso.com')] }
    });
    expect((await client.searchSiteUsers(SITE, 'TOMMY')).length).toBe(1);
  });

  it('keeps an account whose login name is not a membership claim', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        value: [{ Id: 9, Title: 'Guest', Email: 'guest@fabrikam.com', LoginName: 'guest@fabrikam.com' }]
      }
    });
    const client = new GraphClient(async () => 'sharepoint-token');

    const results = await client.searchSiteUsers(SITE, 'fabrikam');

    expect(results).toHaveLength(1);
  });

  it('asks for more than it returns, so narrowing has something left to show', async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      siteUser(i + 1, `User ${i + 1}`, `user${i + 1}@contoso.com`)
    );
    vi.mocked(axios.get).mockResolvedValue({ data: { value: many } });
    const client = new GraphClient(async () => 'sharepoint-token');

    const results = await client.searchSiteUsers(SITE, 'user');

    expect(urlOf()).toContain('$top=50');
    expect(results).toHaveLength(10);
  });

  it('does not ask SharePoint for a term that is only whitespace', async () => {
    // The caller measures the query before trimming, so two spaces reach here
    // as an empty term — which would be a substring of every user on the site
    // Answered without a token too — there is no call to authenticate for
    const client = new GraphClient(async () => null);

    expect(await client.searchSiteUsers(SITE, '  ')).toEqual([]);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('fails before calling SharePoint REST when no SharePoint token is available', async () => {
    const client = new GraphClient(async () => null);

    await expect(client.searchSiteUsers(SITE, 'john')).rejects.toThrow('Not signed in to SharePoint');
    expect(axios.get).not.toHaveBeenCalled();
  });
});
