

export interface Chrome {
  headerLayout?: "Standard" | "Compact" | "Minimal" | "Extended";
  headerEmphasis?: "Lightest" | "Light" | "Dark" | "Darkest";
  logoAlignment?: "Left" | "Center" | "Right";
  footerLayout?: "Simple" | "Extended";
  footerEmphasis?: "Lightest" | "Light" | "Dark" | "Darkest";
  disableMegaMenu?: boolean;
  disableFooter?: boolean;
  hideTitleInHeader?: boolean;
}