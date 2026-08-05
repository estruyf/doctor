---
title: CI/CD
---

Using `doctor` works best when you implement it on an automated CI/CD pipeline. For instance, each time you push a change to your source control system you use, let the pages rebuild themselves.

Azure DevOps and GitHub actions are a perfect choice for it, but `doctor` can run on any platform which allows you to run `node.js` CLI tools.

The quickest way to get started is the `doctor workflow` command. It generates the definition which publishes your documentation on each push to the `main` branch, for GitHub Actions or Azure DevOps.

## Azure DevOps

Use the `azdo` provider to generate an `azure-pipelines.yml` file in the root of your project.

```sh
doctor workflow --provider azdo
```

Check the [workflow command](../cli#workflow) section for the variables you need to add to your pipeline.

If you want to know more about setting up `doctor` on Azure DevOps, you can read the article from Elio at [Using Doctor on Azure DevOps to generate your documentation](https://www.eliostruyf.com/doctor-azure-devops-generate-documentation/).

## GitHub Actions

The `github` provider is the default. It creates the `.github/workflows` folder, and generates a `doctor.yml` workflow file in it.

```sh
doctor workflow
```

Check the [workflow command](../cli#workflow) section for the secrets you need to add to your repository.

If you want to know more about using `doctor` in GitHub Actions, you can check out the following article from Elio: [Using Doctor in GitHub Actions for your documentation](https://www.eliostruyf.com/doctor-github-actions-publishing-documentation/).

## Reporting on a pull request

The [`--output json`](../configuration/cli-options/#json-output) argument makes the result of a run readable for your pipeline. A `doctor status` run on a pull request tells you which pages it is going to touch, before anything is published:

```yaml
- name: Check which pages change
  id: status
  run: |
    doctor status --output json \
      --url ${{ secrets.SITE_URL }} \
      --appId ${{ secrets.APP_ID }} \
      --tenant ${{ secrets.TENANT_ID }} \
      --certificate ${{ secrets.CERTIFICATE }} > status.json

    {
      echo "upToDate=$(jq -r '.summary.upToDate' status.json)"
      echo "comment<<EOF"
      jq -r '"**\(.summary.changed)** page(s) will be published.\n" +
             ((.pages.new + .pages.modified) | map("- `\(.file)`") | join("\n"))' status.json
      echo "EOF"
    } >> "$GITHUB_OUTPUT"

- name: Comment on the pull request
  uses: peter-evans/create-or-update-comment@v4
  with:
    issue-number: ${{ github.event.pull_request.number }}
    body: ${{ steps.status.outputs.comment }}
```

The same document lets you skip the publish step altogether when nothing changed:

```yaml
- name: Publish
  if: ${{ !fromJSON(steps.status.outputs.upToDate) }}
  run: doctor publish
```

:::caution[Important]
`doctor` cannot prompt while it reports JSON, as that would block your pipeline. Pass every value it needs as an argument or through the `doctor.json` file, including `--confirm` for the runs which remove content.
:::
