/** Doctor shortcode and TOC layout styles */
export const shortcodesCss = `.doctor__container {
  position: relative;
}

@media screen and (min-width: 1024px) {
  .doctor__container__markdown_right_padding {
    padding-right: 20%;
  }

  .doctor__container__toc_right {
    float: right;
    position: sticky;
    top: 0;
    width: 19%;
  }
}

.callout {
  padding: 1rem;
  border: 1px solid #eaeaea;
  border-radius: 15px;
}

.callout-content > :last-child {
  margin-bottom: 0;
}

.callout h5 {
  font-weight: bold;
  margin: 0 0 0.5rem 0;
}

.callout .callout-icon svg {
  display: inline-block;
  vertical-align: middle;
  margin-right: 0.2em;
}

.callout-note    { background-color: #e1dfdd; color: #000; }
.callout-tip     { background-color: #bad80a; color: #000; }
.callout-info    { background-color: #00b7c3; color: #000; }
.callout-caution { background-color: #ffaa44; color: #000; }
.callout-danger  { background-color: #d13438; color: #000; }

a.toc-anchor {
  display: none;
  text-decoration: none;
}

a.toc-anchor:hover {
  text-decoration: none;
}

h1:hover a.toc-anchor,
h2:hover a.toc-anchor,
h3:hover a.toc-anchor,
h4:hover a.toc-anchor,
h5:hover a.toc-anchor,
h6:hover a.toc-anchor {
  display: inline;
}
.doctor__mermaid {
  margin: 1em 0;
  overflow-x: auto;
  text-align: center;
}

.doctor__mermaid img {
  max-width: 100%;
  height: auto;
}
`;
