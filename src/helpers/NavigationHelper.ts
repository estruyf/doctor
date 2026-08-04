import { CliCommand } from "./index.js";
import { Menu, MenuItem, MenuType, NavigationItem } from "@models";
import { executeWithRetry } from "./RunCommand.js";
import { Logger } from "./Logger.js";

type LocationType = "QuickLaunch" | "TopNavigationBar";
const WEIGHT_VALUE = 99999;

export class NavigationHelper {
  private static qlElms: NavigationItem[] | null = null;
  private static tnElms: NavigationItem[] | null = null;

  public static reset() {
    NavigationHelper.qlElms = null;
    NavigationHelper.tnElms = null;
  }

  /**
    * Synchronizes site navigation with the provided menu definition.
    * Optionally cleans existing quick launch and/or top navigation nodes first,
    * then recreates items in weighted/alphabetical order.
    * @param webUrl The SharePoint site URL where navigation should be updated.
    * @param navigation The navigation model to apply.
    * @returns A promise that resolves when all configured navigation updates are complete.
   */
  public static async update(webUrl: string, navigation: Menu | undefined) {
    if (!navigation) {
      return;
    }

    const cleanNavigation = CliCommand.getCleanNavigation();
    if (cleanNavigation.cleanQuickLaunch) {
      await this.startNavigationCleanup(webUrl, "QuickLaunch");
    }
    if (cleanNavigation.cleanTopNavigation) {
      await this.startNavigationCleanup(webUrl, "TopNavigationBar");
    }

    Logger.debug(`Start update with the following navigation:`);
    Logger.debug(JSON.stringify(navigation, null, 2));

    for (const location in navigation) {
      if (
        (location as LocationType) === "QuickLaunch" ||
        (location as LocationType) === "TopNavigationBar"
      ) {
        const menu: MenuType = navigation[location];

        if (menu && menu.items) {
          const navElms = await this.getNavigationElms(
            webUrl,
            location as LocationType
          );

          if (!navElms) continue;
          const weightedItems = menu.items
            .filter((i) => !!i.weight)
            .sort(this.itemWeightSorting);
          const alphaItems = menu.items
            .filter((i) => !i.weight)
            .sort(this.alphabeticalSorting);
          menu.items = [...weightedItems, ...alphaItems];

          for (const item of menu.items) {
            const rootElm = navElms.find(
              (e: NavigationItem) => e.Title === item.name
            );
            // If the root element exists, this will be cleaned and filled with the new pages
            if (rootElm) {
              await this.removeNavigationElm(
                webUrl,
                location as LocationType,
                rootElm.Id
              );
            }

            // Start creating the new navigation elements
            const rootNode = await this.createNavigationElm(
              webUrl,
              location as LocationType,
              item.name || "",
              item.url || ""
            );

            Logger.debug(`Root node created: ${JSON.stringify(rootNode)}`);

            if (rootNode && item.items) {
              await this.createSubNavigationItems(
                webUrl,
                location as LocationType,
                rootNode.Id,
                item.items
              );
            }
          }
        }
      }
    }
  }

  /**
    * Builds a navigation hierarchy by merging a page menu entry into an existing
    * navigation structure for each supported location.
    * @param webUrl The SharePoint site URL used to generate page links.
    * @param navigation The current navigation structure.
    * @param menu The menu definition for the page being processed.
    * @param slug The page slug used to build the destination URL.
    * @param title The fallback display title when a menu item name is not defined.
    * @returns A new navigation structure containing the merged hierarchy.
   */
  public static hierarchy(
    webUrl: string,
    navigation: Menu,
    menu: MenuType,
    slug: string,
    title: string
  ): Menu {
    const structure = Object.assign({}, navigation);

    for (const location in menu) {
      if (
        (location as LocationType) === "QuickLaunch" ||
        (location as LocationType) === "TopNavigationBar"
      ) {
        if (typeof structure[location] === "undefined") {
          structure[location] = {
            items: [],
          };
        }

        if (typeof structure[location] !== "undefined") {
          // Create the default menu options if they do not exist
          if (typeof structure[location]["items"] === "undefined") {
            structure[location]["items"] = [];
          }

          structure[location]["items"] = this.createNavigationHierarchy(
            webUrl,
            structure[location]["items"],
            menu[location],
            slug,
            title
          );
        }
      }
    }

    return structure;
  }

  /**
    * Removes all existing nodes from a specific navigation location.
    * @param webUrl The SharePoint site URL.
    * @param location The navigation location to clean.
    * @returns A promise that resolves when cleanup for the location is finished.
   */
  private static async startNavigationCleanup(
    webUrl: string,
    location: LocationType
  ) {
    Logger.debug(`Starting ${location} clean-up job`);
    const navElms: NavigationItem[] | null = await this.getNavigationElms(
      webUrl,
      location
    );
    if (navElms && navElms.length > 0) {
      for (const navElm of navElms) {
        await this.removeNavigationElm(webUrl, location, navElm.Id);
      }
    }
  }

  /**
    * Creates or updates a menu item in the hierarchy and ensures its parent chain
    * exists before insertion.
    * @param webUrl The SharePoint site URL used to build the page URL.
    * @param items The current list of root menu items to mutate.
    * @param item The menu item definition to insert or update.
    * @param slug The page slug used to construct the menu item URL.
    * @param title The fallback display title when no item name is provided.
    * @returns The updated root menu items array.
   */
  private static createNavigationHierarchy(
    webUrl: string,
    items: MenuItem[],
    item: MenuItem,
    slug: string,
    title: string
  ) {
    let crntItem: MenuItem | null = null;
    // Create the parent items if needed
    if (item && item.parent) {
      const parentIds = item.parent.toLowerCase().replace(/ /g, "").split("/");
      for (let idx = 0; idx < parentIds.length; idx++) {
        const parentId = parentIds[idx];
        const itemSet = idx === 0 ? items : (crntItem?.items ?? []);

        crntItem = itemSet.find((i) => i.id === parentId) ?? null;

        if (!crntItem) {
          itemSet.push({ name: parentId, id: parentId, url: "" });
          crntItem = itemSet.find((i) => i.id === parentId) ?? null;
        }

        if (crntItem && typeof crntItem.items === "undefined") {
          crntItem.items = [];
        }
      }
    }

    // Check if item exists, and need to be updated
    const navItems = crntItem?.items ?? items;
    let navItemIdx = navItems.findIndex((i) => i.id === item.id);
    if (
      navItemIdx !== -1 &&
      navItems[navItemIdx] &&
      !navItems[navItemIdx].updated
    ) {
      Logger.debug(
        `Navigation Item BEFORE update: ${JSON.stringify(navItems[navItemIdx])}`
      );

      navItems[navItemIdx] = {
        ...navItems[navItemIdx],
        name: item.name || title,
        url: slug
          ? `${webUrl}${webUrl.endsWith("/") ? "" : "/"}sitepages/${slug}`
          : "",
        weight: item.weight ?? undefined,
        updated: true,
      };

      Logger.debug(
        `Navigation Item AFTER update: ${JSON.stringify(navItems[navItemIdx])}`
      );
    } else {
      // Add the new item to the menu
      (crntItem?.items ?? items).push({
        id: (item.id || item.name || title).toLowerCase().replace(/ /g, ""),
        url: slug
          ? `${webUrl}${webUrl.endsWith("/") ? "" : "/"}sitepages/${slug}`
          : "",
        name: item.name || title,
        weight: item.weight ?? undefined,
        items: [],
      });
    }
    Logger.debug(`Updated navigation structure: ${JSON.stringify(items)}`);

    return items;
  }

  /**
    * Retrieves navigation nodes for the requested location and caches the result
    * for reuse during the current run.
    * @param webUrl The SharePoint site URL.
    * @param type The navigation location to query.
    * @returns A promise that resolves to the list of navigation nodes, or null for unsupported locations.
   */
  private static async getNavigationElms(webUrl: string, type: LocationType): Promise<NavigationItem[] | null> {
    if (type === "QuickLaunch") {
      if (!this.qlElms) {
        const { stdout } = await executeWithRetry(
          "spo navigation node list",
          {
            webUrl,
            location: type,
            output: "json",
          },
          CliCommand.getRetry()
        );
        this.qlElms = JSON.parse(stdout);
      }
      return this.qlElms;
    }

    if (type === "TopNavigationBar") {
      if (!this.tnElms) {
        const { stdout } = await executeWithRetry(
          "spo navigation node list",
          {
            webUrl,
            location: type,
            output: "json",
          },
          CliCommand.getRetry()
        );
        this.tnElms = JSON.parse(stdout);
      }
      return this.tnElms;
    }

    // This should never happen, but one can never really know for sure
    return null;
  }

  /**
    * Removes a single navigation node by id.
    * @param webUrl The SharePoint site URL.
    * @param type The navigation location that contains the node.
    * @param id The node id to remove.
    * @returns A promise that resolves when the node removal command completes.
   */
  private static async removeNavigationElm(
    webUrl: string,
    type: LocationType,
    id: number
  ) {
    if (id) {
      await executeWithRetry(
        "spo navigation node remove",
        {
          webUrl,
          location: type,
          id,
          force: true,
        },
        CliCommand.getRetry()
      );
    }
  }

  /**
    * Creates a navigation node at the root level or as a child of an existing node.
    * @param webUrl The SharePoint site URL.
    * @param type The navigation location used when creating a root node.
    * @param name The node title.
    * @param url The target URL for the node.
    * @param id Optional parent node id. When set, the node is created as a child.
    * @returns A promise that resolves to the created navigation node, or null/undefined when no name is provided.
   */
  private static async createNavigationElm(
    webUrl: string,
    type: LocationType,
    name: string,
    url: string,
    id: number | null = null
  ): Promise<NavigationItem | null> {
    if (name) {
      const options: any = {
        webUrl,
        title: name,
        url,
        output: "json",
      };

      if (id) {
        options.parentNodeId = id;
      } else {
        options.location = type;
      }

      const { stdout } = await executeWithRetry(
        "spo navigation node add",
        options,
        CliCommand.getRetry()
      );
      const item = stdout;

      return typeof item === "string" ? JSON.parse(item) : item;
    }
    return null;
  }

  /**
    * Recursively creates child navigation nodes under a root node.
    * For Quick Launch, recursion is limited to two levels to match SharePoint constraints.
    * @param webUrl The SharePoint site URL.
    * @param type The navigation location.
    * @param rootId The parent navigation node id under which children are created.
    * @param items The child menu items to create.
    * @param level The current recursion depth.
    * @returns A promise that resolves when all eligible child nodes are created.
   */
  private static async createSubNavigationItems(
    webUrl: string,
    type: LocationType,
    rootId: number,
    items: MenuItem[],
    level: number = 0
  ) {
    level++;
    Logger.debug(`Navigation start level: ${level}`);
    if (type === "QuickLaunch" && level > 2) {
      Logger.debug(`Max level of navigation depth reached`);
      return;
    }

    const weightedItems = items
      .filter((i) => !!i.weight)
      .sort(this.itemWeightSorting);
    const alphaItems = items
      .filter((i) => !i.weight)
      .sort(this.alphabeticalSorting);
    items = [...weightedItems, ...alphaItems];

    for (const item of items) {
      const parentNode = await this.createNavigationElm(
        webUrl,
        type,
        item.name || "",
        item.url || "",
        rootId
      );

      if (item.items && item.items.length > 0 && parentNode?.Id) {
        await this.createSubNavigationItems(
          webUrl,
          type,
          parentNode.Id,
          item.items,
          level
        );
      }
    }
  }

  /**
    * Compares menu items by weight for ascending sort order.
    * Items without weight are sorted last by using a high fallback value.
    * @param a The first menu item.
    * @param b The second menu item.
    * @returns 1 when item a should come after b; otherwise -1.
   */
  private static itemWeightSorting(a: MenuItem, b: MenuItem) {
    return (a.weight || WEIGHT_VALUE) > (b.weight || WEIGHT_VALUE) ? 1 : -1;
  }

  /**
    * Compares menu items alphabetically by name (or id fallback), case-insensitive.
    * @param a The first menu item.
    * @param b The second menu item.
    * @returns -1 when a comes first, 1 when b comes first, or 0 when equal.
   */
  private static alphabeticalSorting(a: MenuItem, b: MenuItem) {
    if ((a.name || a.id).toLowerCase() < (b.name || b.id).toLowerCase()) {
      return -1;
    }
    if ((a.name || a.id).toLowerCase() > (b.name || b.id).toLowerCase()) {
      return 1;
    }
    return 0;
  }
}
