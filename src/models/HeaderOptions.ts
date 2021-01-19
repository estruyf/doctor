

export interface HeaderOptions {
  /**
   * Default is the default
   */
  type?: "None" | "Default" | "Custom";

  image?: string;
  altText?: string;
  translateX?: number;
  translateY?: number;

  /**
   * FullWidthImage is the default
   */
  layout?: "FullWidthImage" | "NoImage" | "ColorBlock" | "CutInShape";

  /**
   * Left is the default
   */
  textAlignment?: "Center" | "Left";

  /**
   * False is the default
   */
  showTopicHeader?: boolean;
  topicHeader?: string;

  /**
   * Show the publishing date
   */
  showPublishDate?: boolean;

  /**
   * Author UPNs
   */
  authors?: string[];
}