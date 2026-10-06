/**
 * The default design of an HTML page.
 *
 * Everything is self-contained: the HTML page sandbox blocks web fonts and
 * external stylesheets, so the font stack falls back on what the reader's
 * system has, starting with the one SharePoint itself uses. The colours are
 * custom properties, so `html.styles` can rebrand a site by overriding a few of
 * them rather than restyling every element.
 */
export const htmlPageCss = `:root {
  --doctor-accent: #0f6cbd;
  --doctor-accent-strong: #0c3b5e;
  --doctor-text: #242424;
  --doctor-muted: #616161;
  --doctor-border: #e0e0e0;
  --doctor-surface: #f5f5f5;
  --doctor-background: #ffffff;
  --doctor-radius: 8px;
  --doctor-width: 860px;
  --doctor-font: "Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif;
  --doctor-mono: "Cascadia Code", Consolas, "SFMono-Regular", Menlo, monospace;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--doctor-background);
  color: var(--doctor-text);
  font-family: var(--doctor-font);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

.doctor-hero {
  position: relative;
  padding: 56px 24px 48px;
  background: linear-gradient(135deg, var(--doctor-accent-strong), var(--doctor-accent));
  background-size: cover;
  background-position: center;
  color: #fff;
}

.doctor-hero--image {
  display: flex;
  align-items: flex-end;
  min-height: 320px;
}

.doctor-hero--image::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.75));
}

/* The page's padding is inside its width, so the banner text lines up with
   the content column only when the same padding comes off here */
.doctor-hero__inner {
  position: relative;
  width: 100%;
  max-width: calc(var(--doctor-width) - 48px);
  margin: 0 auto;
}

.doctor-hero--center { text-align: center; }
.doctor-hero--center .doctor-hero__description { margin-left: auto; margin-right: auto; }

.doctor-hero__title {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.doctor-hero__description {
  margin: 12px 0 0;
  max-width: 680px;
  font-size: 1.15rem;
  opacity: 0.9;
}

.doctor-page {
  max-width: var(--doctor-width);
  margin: 0 auto;
  padding: 40px 24px 64px;
}

.doctor-content > .ExternalClass > .doctor__container > .doctor__container__markdown > :first-child { margin-top: 0; }

.doctor-content h1, .doctor-content h2, .doctor-content h3,
.doctor-content h4, .doctor-content h5, .doctor-content h6 {
  margin: 2em 0 0.6em;
  font-weight: 600;
  line-height: 1.3;
  scroll-margin-top: 16px;
}

.doctor-content h1 { font-size: 2rem; }
.doctor-content h2 { font-size: 1.5rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--doctor-border); }
.doctor-content h3 { font-size: 1.25rem; }
.doctor-content h4 { font-size: 1.05rem; }
.doctor-content h5, .doctor-content h6 { font-size: 1rem; }

.doctor-content p, .doctor-content ul, .doctor-content ol,
.doctor-content dl, .doctor-content table, .doctor-content blockquote,
.doctor-content pre, .doctor-content details { margin: 0 0 1.1em; }

.doctor-content ul, .doctor-content ol { padding-left: 1.6em; }
.doctor-content li + li { margin-top: 0.3em; }

.doctor-content a { color: var(--doctor-accent); text-decoration: underline; text-underline-offset: 2px; }
.doctor-content a:hover { color: var(--doctor-accent-strong); }
.doctor-content a.toc-anchor { margin-left: 0.3em; color: var(--doctor-muted); text-decoration: none; }

.doctor-content img { max-width: 100%; height: auto; border-radius: var(--doctor-radius); }

.doctor-content hr { margin: 2.5em 0; border: 0; border-top: 1px solid var(--doctor-border); }

.doctor-content blockquote {
  padding: 0.6em 1.2em;
  border-left: 4px solid var(--doctor-accent);
  background: var(--doctor-surface);
  border-radius: 0 var(--doctor-radius) var(--doctor-radius) 0;
  color: var(--doctor-muted);
}
.doctor-content blockquote > :last-child { margin-bottom: 0; }

.doctor-content code, .doctor-content kbd {
  font-family: var(--doctor-mono);
  font-size: 0.875em;
}

.doctor-content :not(pre) > code {
  padding: 0.15em 0.4em;
  background: var(--doctor-surface);
  border: 1px solid var(--doctor-border);
  border-radius: 4px;
}

.doctor-content kbd {
  padding: 0.1em 0.45em;
  border: 1px solid var(--doctor-border);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--doctor-background);
}

.doctor-content pre {
  padding: 16px 20px;
  overflow-x: auto;
  border-radius: var(--doctor-radius);
  line-height: 1.5;
}
.doctor-content pre code { font-size: 0.85rem; }

.doctor-content table {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 0.95em;
}
.doctor-content th, .doctor-content td { padding: 8px 14px; border: 1px solid var(--doctor-border); text-align: left; vertical-align: top; }
.doctor-content th { background: var(--doctor-surface); font-weight: 600; }
.doctor-content tbody tr:nth-child(even) { background: #fafafa; }

.doctor-content details {
  padding: 0.6em 1em;
  border: 1px solid var(--doctor-border);
  border-radius: var(--doctor-radius);
}
.doctor-content summary { cursor: pointer; font-weight: 600; }
.doctor-content details[open] > summary { margin-bottom: 0.6em; }

/* A quieter take on the callouts than the solid blocks of the web part, which
   has to stand out on a busy modern page. The bgColor and fgColor attributes
   are inline styles, so they still win. */
.doctor-content .callout {
  margin: 0 0 1.1em;
  padding: 14px 18px;
  border: 0;
  border-left: 4px solid var(--doctor-callout, #8a8886);
  border-radius: 0 var(--doctor-radius) var(--doctor-radius) 0;
  background: var(--doctor-callout-bg, #f5f5f5);
  color: var(--doctor-text);
}
.doctor-content .callout h5 {
  margin: 0 0 0.35em;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  color: var(--doctor-callout, #8a8886);
}
.doctor-content .callout .callout-icon svg { margin-top: -2px; }
.doctor-content .callout-note { --doctor-callout: #616161; --doctor-callout-bg: #f5f5f5; }
.doctor-content .callout-tip { --doctor-callout: #107c10; --doctor-callout-bg: #f1faf1; }
.doctor-content .callout-info { --doctor-callout: #0f6cbd; --doctor-callout-bg: #ebf3fc; }
.doctor-content .callout-caution { --doctor-callout: #bc4b09; --doctor-callout-bg: #fff9f5; }
.doctor-content .callout-danger { --doctor-callout: #c50f1f; --doctor-callout-bg: #fdf3f4; }
.doctor-content .callout[style*="color"] h5 { color: inherit; }

/* The table of contents reads as an outline: no bullets, levels indented
   along a guide line, quiet links */
.doctor-content .doctor__container__toc {
  margin: 0 0 1.5em;
  padding: 16px 20px;
  background: var(--doctor-surface);
  border-radius: var(--doctor-radius);
  font-size: 0.9rem;
  line-height: 1.45;
}
.doctor-content .doctor__container__toc h2 {
  margin: 0 0 0.6em;
  padding: 0;
  border: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--doctor-muted);
}
.doctor-content .doctor__container__toc ul { margin: 0; padding: 0; list-style: none; }
.doctor-content .doctor__container__toc ul ul {
  margin: 4px 0 0 2px;
  padding-left: 12px;
  border-left: 1px solid var(--doctor-border);
}
.doctor-content .doctor__container__toc li { margin: 0; padding: 3px 0; }
.doctor-content .doctor__container__toc li + li { margin-top: 0; }
.doctor-content .doctor__container__toc a { color: var(--doctor-text); text-decoration: none; }
.doctor-content .doctor__container__toc a:hover { color: var(--doctor-accent); text-decoration: underline; }

/* position="right". The web part floats it at a fifth of the canvas, which in
   this narrower column leaves it too thin to read. Here it is a block in the
   text, until the window is wide enough to give it the margin beside the
   column, where it stays in view while the page scrolls. */
.doctor-content .doctor__container__toc_right { float: none; position: static; width: auto; }
/* The web part pads the text to make room for the float; here the table of
   contents sits above the text or in the margin, so the room is not needed */
.doctor-content .doctor__container__markdown_right_padding { padding-right: 0; }
@media screen and (min-width: 1400px) {
  .doctor-content .doctor__container__toc_right {
    float: right;
    position: sticky;
    top: 24px;
    width: 240px;
    margin: 0 -280px 1em 0;
    padding: 0 0 0 16px;
    background: none;
    border-left: 1px solid var(--doctor-border);
    border-radius: 0;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
  }
}

.doctor-content .doctor__mermaid svg { max-width: 100%; height: auto; }

@media print {
  .doctor-hero { padding: 0 0 16px; background: none !important; color: var(--doctor-text); }
  .doctor-hero--image::before { display: none; }
  .doctor-page { max-width: none; padding: 16px 0 0; }
  .doctor-content pre { white-space: pre-wrap; }
}
`;
