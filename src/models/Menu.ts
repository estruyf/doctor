

export interface Menu {
  [name: string]: MenuType;
}


/**
 * Type of menu where the items will be added. Default is "QuickLaunch".
 */
  export interface MenuType {
  items: MenuItem[];
}

export interface MenuItem {
  url?: string;
  id: string;
  
  name?: string;
  weight?: number;
  parent?: string;

  items?: MenuItem[];

  /**
   * Property which is only used during the update of the navigation
   */
  updated?: boolean;
}