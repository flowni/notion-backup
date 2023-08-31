
# notion-backup

This is a very simple tool to export a workspace from [Notion](https://www.notion.so/), designed
to work as part of a GitHub workflow.

It reads `NOTION_TOKEN` and `NOTION_SPACE_ID` from the environment, and outputs the export to both
`html` and `markdown` directories in the current working directory, as well as to `html.zip` and
`markdown.zip`.

## Obtaining tokens

Automatically downloading backups from Notion requires two unique authentication tokens and your individual space ID which must be obtained for the script to work.

1. Log into your Notion account in your browser of choice if you haven't done so already.
2. Open a new tab in your browser and open the development tools. This is usually easiest done by right-click and selecting `Inspect Element` (Chrome, Edge, Safari) or `Inspect` (Firefox). Switch to the Network tab.
3. Open https://notion.so/f/. You must use this specific subdirectory to obtain the right cookies.
4. Insert `getSpaces` into the search filter of the Network tab. This should give you one result. Click on it.
5. In the Preview tab, look for the key `space`. There you should find a list of all the workspaces you have access to. Unless you're part of shared workspaces there should only be one.
6. Copy the UUID of the workspace you want to backup (e.g. `6e560115-7a65-4f65-bb04-1825b43748f1`). This is your `NOTION_SPACE_ID`.
6. Switch to the Application (Chrome, Edge) or Storage (Firefox, Safari) tab on the top.
7. In the left sidebar, select `Cookies` -> `https://www.notion.so` (Chrome, Edge, Firefox) or `Cookies – https://www.notion.so` (Safari).
8. Copy the value of `token_v2` as your `NOTION_TOKEN` and the value of `file_token` as your `NOTION_FILE_TOKEN`.
9. Set the three environment variables as secrets for actions in your GitHub repository.

**NOTE**: if you log out of your account or your session expires naturally, the `NOTION_TOKEN` and `NOTION_FILE_TOKEN` will get invalidated and the backup will fail. In this case you need to obtain new tokens by repeating this process. There is currently no practical way to automize this until Notion decide to add a backup endpoint to their official API, at which point this script will be able to use a proper authentication token.

## Setup

This assumes you are looking to set this up to back up Notion on a server and upload to AWS S3.

1. Obtain the required values for the environment variables as explained above.
1. Create AWS S3 bucket and IAM user with write access to the bucket.
1. Copy `.envrc.example` to `.envrc` and fill in the values: `cp .envrc.example .envrc`
1. Create cronjob to run the backup script periodically. For example, to run the backup every night at 1.00AM, run `crontab -e` and add the following line: `0 1 * * * . /path/to/folder/.envrc && python3 /path/to/folder/notion-backup.js >> /path/to/folder/notion-backup.log 2>&1`
