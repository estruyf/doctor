const changelog = require('../changelog.json');
const fs = require('fs');
const path = require('path');

if (changelog && changelog.length > 0) {
  const markdown = [];

  // Loop over all the change log versions
  for (const version of changelog) {
    if (version.title !== "template") {
      markdown.push(`## ${version.title.startsWith('[') ? version.title : `[${version.title}]`}`);
      markdown.push(``);
      // Check if entry contains change information
      if (version.updates && version.updates.length > 0) {
        markdown.push(``);
        // Loop over all change types
        const updates = version.updates.sort((a, b) => (a.id ? a.id : 0) - (b.id ? b.id : 0));
        for (const issue of updates) {
          markdown.push(`- ${issue.id ? `[#${issue.id}](https://github.com/estruyf/doctor/issues/${issue.id}): ` : ``}${issue.title}`);
        }
        markdown.push(``);
      }
    }
  }

  if (markdown.length > 2) {
    const changelogMain = `# Changelog
    
${markdown.join('\n')}`;
    fs.writeFileSync('CHANGELOG.md', changelogMain, { encoding: "utf-8" });
    
    const changelogDocs = `---
title: Changelog
date: 2021-02-22T10:10:32.941Z
icon: ti-bolt
description: The changelog of Doctor
type: docs-main
---

${markdown.join('\n')}`;
    fs.writeFileSync(path.join(__dirname, "../docs/content/changelog/_index.md"), changelogDocs, { encoding: "utf-8" });
  }
}
