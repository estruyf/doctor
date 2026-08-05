// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://getdoctor.io",
  integrations: [
    starlight({
      title: "Doctor",
      description: "Maintain your documentation on SharePoint without pain",
      logo: {
        src: "./src/assets/doctor_no-text.svg",
        alt: "Doctor",
        replacesTitle: false,
      },
      favicon: "/favicon.ico",
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        },
        {
          tag: "link",
          attrs: { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
        },
        {
          tag: "link",
          attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        },
        {
          tag: "link",
          attrs: { rel: "manifest", href: "/site.webmanifest" },
        },
      ],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/estruyf/doctor" },
        { icon: "twitter", label: "Twitter", href: "https://twitter.com/eliostruyf" },
      ],
      editLink: {
        baseUrl: "https://github.com/estruyf/doctor/edit/dev/docs/",
      },
      customCss: ["./src/styles/custom.css"],
      components: {
        Footer: "./src/components/Footer.astro",
      },
      sidebar: [
        { label: "Documentation", link: "/docs/" },
        {
          label: "Getting Started",
          items: [
            { label: "Overview", link: "/docs/getting-started/" },
            { label: "Installation", link: "/docs/getting-started/installation/" },
            {
              label: "Certificate Authentication",
              link: "/docs/getting-started/certificate-authentication/",
            },
          ],
        },
        {
          label: "Content",
          items: [
            { label: "Overview", link: "/docs/content/" },
            { label: "Pages", link: "/docs/content/pages/" },
            { label: "Navigation", link: "/docs/content/navigation/" },
            { label: "Markdown syntax", link: "/docs/content/markdown-syntax/" },
            {
              label: "Shortcodes",
              items: [
                { label: "Overview", link: "/docs/content/shortcodes/" },
                { label: "Callout", link: "/docs/content/shortcodes/callout/" },
                { label: "Icon", link: "/docs/content/shortcodes/icon/" },
                { label: "Mermaid", link: "/docs/content/shortcodes/mermaid/" },
                { label: "Table of Contents", link: "/docs/content/shortcodes/toc/" },
              ],
            },
            { label: "Partials", link: "/docs/content/partials/" },
            { label: "Multilingual", link: "/docs/content/multilingual/" },
          ],
        },
        { label: "CLI", link: "/docs/cli/" },
        {
          label: "Configuration",
          items: [
            { label: "Overview", link: "/docs/configuration/" },
            { label: "CLI options", link: "/docs/configuration/cli-options/" },
            { label: "doctor.json", link: "/docs/configuration/doctor-json/" },
          ],
        },
        { label: "CI/CD", link: "/docs/ci-cd/" },
        {
          label: "About",
          items: [
            { label: "Overview", link: "/docs/about/" },
            { label: "Feedback/Contribute", link: "/docs/about/feedback/" },
            { label: "Disclaimer", link: "/docs/about/disclaimer/" },
            { label: "License", link: "/docs/about/license/" },
          ],
        },
        {
          label: "More",
          items: [
            { label: "Showcase", link: "/showcase/" },
            { label: "Changelog", link: "/changelog/" },
          ],
        },
      ],
    }),
  ],
  redirects: {
    "/docs/installation/": "/docs/getting-started/installation/",
    "/docs/certificate-authentication/": "/docs/getting-started/certificate-authentication/",
    "/docs/pages/": "/docs/content/pages/",
    "/docs/navigation/": "/docs/content/navigation/",
    "/docs/markdown-syntax/": "/docs/content/markdown-syntax/",
    "/docs/shortcodes/": "/docs/content/shortcodes/",
    "/docs/shortcodes/callout/": "/docs/content/shortcodes/callout/",
    "/docs/shortcodes/icon/": "/docs/content/shortcodes/icon/",
    "/docs/shortcodes/mermaid/": "/docs/content/shortcodes/mermaid/",
    "/docs/shortcodes/toc/": "/docs/content/shortcodes/toc/",
    "/docs/partials/": "/docs/content/partials/",
    "/docs/multilingual/": "/docs/content/multilingual/",
    "/docs/commands/": "/docs/cli/",
    "/docs/options/": "/docs/configuration/",
    "/docs/devops/": "/docs/ci-cd/",
    "/docs/feedback/": "/docs/about/feedback/",
    "/docs/disclaimer/": "/docs/about/disclaimer/",
    "/docs/license/": "/docs/about/license/",
  },
});
