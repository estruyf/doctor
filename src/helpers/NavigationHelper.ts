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
            if (rootElm) {
              await this.removeNavigationElm(
                webUrl,
                location as LocationType,
                rootElm.Id
              );
            }

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

  private static createNavigationHierarchy(
    webUrl: string,
    items: MenuItem[],
    item: MenuItem,
    slug: string,
    title: string
  ) {
    let crntItem: MenuItem | null = null;
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

    return null;
  }

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

  private static itemWeightSorting(a: MenuItem, b: MenuItem) {
    return (a.weight || WEIGHT_VALUE) > (b.weight || WEIGHT_VALUE) ? 1 : -1;
  }

  private static alphabeticalSorting(a: MenuItem, b: MenuItem) {
    if ((a.name || a.id || "").toLowerCase() < (b.name || b.id || "").toLowerCase()) {
      return -1;
    }
    if ((a.name || a.id || "").toLowerCase() > (b.name || b.id || "").toLowerCase()) {
      return 1;
    }
    return 0;
  }
}
