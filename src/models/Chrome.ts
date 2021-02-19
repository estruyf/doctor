

export interface Chrome {
  headerLayout?: "Standard" | "Compact" | "Minimal" | "Extended";
  headerEmphasis?: "Lightest" | "Light" | "Dark" | "Darker";
  logoAlignment?: "Left" | "Center" | "Right";
  footerLayout?: "Simple" | "Extended";
  footerEmphasis?: "Lightest" | "Light" | "Dark" | "Darker";
  disableMegaMenu?: boolean;
  disableFooter?: boolean;
  hideTitleInHeader?: boolean;
}