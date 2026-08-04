---
title: DevOps
date: 2021-03-12T11:18:26.636Z
lastmod: 2021-03-04T09:21:32.386Z
weight: 8
draft: false
---

Using `doctor` works best when you implement it on an automated CI/CD pipeline. For instance, each time you push a change to your source control system you use, let the pages rebuild themselves.

Azure DevOps and GitHub actions are a perfect choice for it, but `doctor` can run on any platform which allows you to run `node.js` CLI tools.

## Azure DevOps

If you want to know more about setting up `doctor` on Azure DevOps, you can read the article from Elio at [Using Doctor on Azure DevOps to generate your documentation](https://www.eliostruyf.com/doctor-azure-devops-generate-documentation/).

## GitHub Actions

The quickest way to get started is the `doctor workflow` command. It creates the `.github/workflows` folder, and generates a `doctor.yml` workflow file which publishes your documentation on each push to the `main` branch.

```sh
doctor workflow
```

Check the [workflow command](../commands#workflow) section for the secrets you need to add to your repository.

If you want to know more about using `doctor` in GitHub Actions, you can check out the following article from Elio: [Using Doctor in GitHub Actions for your documentation](https://www.eliostruyf.com/doctor-github-actions-publishing-documentation/).
