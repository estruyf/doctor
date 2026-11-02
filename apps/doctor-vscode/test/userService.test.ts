import { describe, it, expect, vi } from 'vitest';
import { UserService } from '../src/graph/UserService';

describe('UserService', () => {
  it('should return empty array for short queries', async () => {
    const mockGraphClient = {
      searchSiteUsers: vi.fn()
    };

    const userService = new UserService(mockGraphClient as any);
    const result = await userService.searchSiteUsers('https://contoso.sharepoint.com/sites/test', 'a');

    expect(result).toEqual([]);
    expect(mockGraphClient.searchSiteUsers).not.toHaveBeenCalled();
  });

  it('should search site users with 2+ character query', async () => {
    const mockGraphClient = {
      searchSiteUsers: vi.fn().mockResolvedValue([
        {
          Id: 1,
          Title: 'John Doe',
          Email: 'john@contoso.com',
          LoginName: 'i:0#.f|membership|john@contoso.com'
        }
      ])
    };

    const userService = new UserService(mockGraphClient as any);
    const result = await userService.searchSiteUsers('https://contoso.sharepoint.com/sites/test', 'john');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1,
      displayName: 'John Doe',
      email: 'john@contoso.com',
      loginName: 'i:0#.f|membership|john@contoso.com'
    });
  });

  it('should propagate search errors instead of silently returning an empty list', async () => {
    const mockGraphClient = {
      searchSiteUsers: vi.fn().mockRejectedValue(new Error('API error'))
    };

    const userService = new UserService(mockGraphClient as any);

    await expect(userService.searchSiteUsers('https://contoso.sharepoint.com/sites/test', 'test')).rejects.toThrow(
      'API error'
    );
  });
});
