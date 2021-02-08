import { Menu, MenuItem, MenuType } from "../models/Menu";
import { ArgumentsHelper } from "./ArgumentsHelper";
import { execScript } from "./execScript";
import { Logger } from "./logger";

type LocationType = "QuickLaunch" | "TopNavigationBar";

export class NavigationHelper {
  private static qlElms: NavigationItem[] | string = null;
  private static tnElms: NavigationItem[] | string = null;

  /**
   * Update the navigation on the site
   * @param webUrl 
   * @param navigation 
   */
  public static async update(webUrl: string, navigation: Menu) {
    if (!navigation) {
      return;
    }

    Logger.debug(`Start update with the following navigation:`);
    Logger.debug(JSON.stringify(navigation, null, 2));

    for (const location in navigation) {
      if (location as LocationType === "QuickLaunch" || location as LocationType === "TopNavigationBar") {
        const menu: MenuType = navigation[location];

        if (menu && menu.items) {
          const navElms = await this.getNavigationElms(webUrl, location as LocationType);

          menu.items = menu.items.sort(this.itemWeightSorting);
          for (const item of menu.items) {
            const rootElm = navElms.find((e: NavigationItem) => e.Title === item.name);
            // If the root element exists, this will be cleaned and filled with the new pages
            if (rootElm) {
              await this.removeNavigationElm(webUrl, location as LocationType, rootElm.Id);
            }

            // Start creating the new navigation elements
            const rootNode = await this.createNavigationElm(webUrl, location as LocationType, item.name, item.url || '');

            Logger.debug(`Root node created: ${JSON.stringify(rootNode)}`);

            if (rootNode && item.items) {
              await this.createSubNavigationItems(webUrl, location as LocationType, rootNode.Id, item.items);
            }
          }
        }
      }
    }
  }

  /**
   * Generate the navigation hierarchy
   * @param navigation 
   * @param menu 
   * @param slug 
   * @param title 
   */
  public static hierarchy(webUrl: string, navigation: Menu, menu: MenuType, slug: string, title: string): Menu {
    const structure = Object.assign({}, navigation);

    for (const location in menu) {
      if (location as LocationType === "QuickLaunch" || location as LocationType === "TopNavigationBar") {
        if (typeof structure[location] === 'undefined') {
          structure[location] = {
            items: []
          };
        }

        if (typeof structure[location] !== 'undefined') {
          // Create the default menu options if they do not exist
          if (typeof structure[location]["items"] === 'undefined') {
            structure[location]["items"] = [];
          }
  
          structure[location]["items"] = this.createNavigationHierarchy(webUrl, structure[location]["items"], menu[location], slug, title);
        }
      }
    }

    return structure;
  }

  /**
   * Create the navigaiton items recursively
   * @param items 
   */
  private static createNavigationHierarchy(webUrl: string, items: MenuItem[], item: MenuItem, slug: string, title: string) {
    let crntItem: MenuItem | null = null;
    // Create the parent items if needed
    if (item && item.parent) {
      const parentIds = item.parent.toLowerCase().replace(/ /g, '').split('/');
      for (let idx = 0; idx < parentIds.length; idx++) {
        const parentId = parentIds[idx];
        const itemSet = idx === 0 ? items : (crntItem.items || []);
        
        crntItem = itemSet.find(i => i.id === parentId);

        if (!crntItem) {
          itemSet.push({ name: parentId, id: parentId, url: '' });
          crntItem = itemSet.find(i => i.id === parentId);
        }

        if (typeof crntItem.items === 'undefined') {
          crntItem.items = [];
        }
      }
    }

    // Check if item exists, and need to be updated
    const navItems = (crntItem ? crntItem.items : items);
    let navItemIdx = navItems.findIndex(i => i.id === item.id);
    if (navItemIdx !== -1 && navItems[navItemIdx] && !navItems[navItemIdx].updated) {
      Logger.debug(`Navigation Item BEFORE update: ${JSON.stringify(navItems[navItemIdx])}`);

      navItems[navItemIdx] = {
        ...navItems[navItemIdx],
        name: item.name || title,
        url: slug ? `${webUrl}${webUrl.endsWith('/') ? '' : '/'}sitepages/${slug}` : '',
        weight: item.weight || 99999,
        updated: true
      };
      
      Logger.debug(`Navigation Item AFTER update: ${JSON.stringify(navItems[navItemIdx])}`);
    } else {
      // Add the new item to the menu
      (crntItem ? crntItem.items : items).push({
        id: (item.id || item.name || title).toLowerCase().replace(/ /g, ''),
        url: slug ? `${webUrl}${webUrl.endsWith('/') ? '' : '/'}sitepages/${slug}` : '',
        name: item.name || title,
        weight: item.weight || 99999,
        items: []
      });
    }
    Logger.debug(`Updated navigation structure: ${JSON.stringify(items)}`);

    return items;
  }

  /**
   * Get the navigation items
   * @param webUrl 
   * @param type 
   */
  private static async getNavigationElms(webUrl: string, type: LocationType) {
    let args = [`spo`, `navigation`, `node`, `list`, `--webUrl`, `"${webUrl}"`, `--location`, type, `-o`, `json`];
    if (args && typeof args === "string") {
      args = JSON.parse(args);
    }

    if (type === "QuickLaunch") {
      if (!this.qlElms) {
        this.qlElms = await execScript<NavigationItem[]>('localm365', [...args]);
      }
      return typeof this.qlElms === "string" ? JSON.parse(this.qlElms) : this.qlElms;
    }
    
    if (type === "TopNavigationBar") {
      if (!this.tnElms) {
        this.tnElms = await execScript<NavigationItem[]>('localm365', [...args]);
      }
      return typeof this.tnElms === "string" ? JSON.parse(this.tnElms) : this.tnElms;
    }

    // This should never happen, but one can never really know for sure
    return null;
  }

  /**
   * Removes a navigation node
   * @param webUrl 
   * @param id 
   */
  private static async removeNavigationElm(webUrl: string, type: LocationType, id: number) {
    if (id) {
      await execScript(`localm365`, ArgumentsHelper.parse(`spo navigation node remove --webUrl "${webUrl}" --location "${type}" --id "${id}" --confirm`));
    }
  }

  /**
   * Create the navigation elements
   * @param webUrl 
   * @param type 
   * @param name 
   * @param url 
   */
  private static async createNavigationElm(webUrl: string, type: LocationType, name: string, url: string, id: number = null): Promise<NavigationItem | null> {
    const rootElm = id ? `--parentNodeId "${id}"` : '';
    if (name) {
      const item = await execScript(`localm365`, ArgumentsHelper.parse(`spo navigation node add --webUrl "${webUrl}" --location "${type}" --title "${name}" --url "${url}" ${rootElm} -o json`));

      return typeof item === "string" ? JSON.parse(item) : item;
    }
  }

  /**
   * Create the sub-navigation elements
   * @param webUrl 
   * @param type 
   * @param Id 
   * @param items 
   */
  private static async createSubNavigationItems(webUrl: string, type: LocationType, rootId: number, items: MenuItem[], level: number = 0) {
    level++;
    Logger.debug(`Navigation start level: ${level}`);
    if (type === "QuickLaunch" && level > 2) {
      Logger.debug(`Max level of navigation depth reached`);
      return;
    }

    items = items.sort(this.itemWeightSorting);
    for (const item of items) {
      const parentNode = await this.createNavigationElm(webUrl, type, item.name, item.url, rootId);

      if (item.items && item.items.length > 0 && parentNode.Id) {
        await this.createSubNavigationItems(webUrl, type, parentNode.Id, item.items, level);
      }
    }
  }

  /**
   * Sort the navigation items
   * @param a 
   * @param b 
   */
  private static itemWeightSorting(a: MenuItem, b: MenuItem) {
    return (a.weight || 99999) > (b.weight || 99999) ? 1 : -1;
  }
}