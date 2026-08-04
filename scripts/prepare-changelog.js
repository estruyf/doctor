import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const changelogPath = path.join(__dirname, "../changelog.json");
const changelog = JSON.parse(
  fs.readFileSync(changelogPath, { encoding: "utf-8" }),
);

if (changelog && changelog.length > 0) {
  const markdown = [];

  // Loop over all the change log versions
  for (const version of changelog) {
    if (version.title !== "template") {
      markdown.push(
        `## ${version.title.startsWith("[") ? version.title : `[${version.title}]`}`,
      );
      markdown.push(``);
      // Check if entry contains change information
      if (version.updates && version.updates.length > 0) {
        markdown.push(``);
        // Loop over all change types
        const updates = version.updates.sort(
          (a, b) => (a.id ? a.id : 0) - (b.id ? b.id : 0),
        );
        for (const issue of updates) {
          markdown.push(
            `- ${issue.id ? `[#${issue.id}](https://github.com/estruyf/doctor/issues/${issue.id}): ` : ``}${issue.title}`,
          );
        }
        markdown.push(``);
      }
    }
  }

  if (markdown.length > 2) {
    const changelogMain = `# Changelog
    
${markdown.join("\n")}`;
    fs.writeFileSync("CHANGELOG.md", changelogMain, { encoding: "utf-8" });

    const changelogDocs = `---
title: Changelog
date: 2021-02-22T10:10:32.941Z
icon: ti-bolt
description: The changelog of Doctor
type: docs-main
---

${markdown.join("\n")}`;
    fs.writeFileSync(
      path.join(__dirname, "../docs/content/changelog/_index.md"),
      changelogDocs,
      { encoding: "utf-8" },
    );
  }

  // Prepare the beta data
  fs.writeFileSync(
    path.join(__dirname, "../docs/data/upcomingVersion.json"),
    JSON.stringify(changelog[1]),
    { encoding: "utf-8" },
  );
}
