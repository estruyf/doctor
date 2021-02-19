import { initializeIcons } from '@uifabric/icons';
import { getIcon, getIconClassName } from '@uifabric/styling';

initializeIcons(undefined, { warnOnMissingIcons: true, disableWarnings: false });

export const IconRenderer = {
  render: function (attrs: any, markup: string) {

    if (!attrs || !attrs.name) {
      return "";
    }
    
    const icon = getIcon(attrs.name);
    
    if (icon && icon.code && icon.subset) {
      const className = getIconClassName(attrs.name);
      const cssStyles = `<style>
        .${className} {
          display: inline-block;
          font-family: ${icon.subset.fontFace.fontFamily};
          font-style: ${icon.subset.fontFace.fontStyle || 'normal'};
          font-weight: ${icon.subset.fontFace.fontWeight || 'normal'};
          speak: none;
        }
        .${className}:before{content:"${icon.code}"}
      </style>
      <i data-icon-name="${attrs.name}" role="presentation" aria-hidden="true" class="ms-Icon doctor-Icon ${className}" style="">${icon.code}</i>`;
      return cssStyles;
    }

    return "";
  }
};