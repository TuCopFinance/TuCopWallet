# Syncing Forks

> **Status**: The upstream repository [mobilestack-xyz/mobilestack-mento](https://github.com/mobilestack-xyz/mobilestack-mento) was **archived in January 2026** (read-only). TuCOP Wallet is now independently maintained. This document is preserved as historical reference for the fork sync process.

TuCOP Wallet is forked from [mobilestack-mento](https://github.com/mobilestack-xyz/mobilestack-mento), a Celo stablecoin wallet built on the [Mobile Stack](https://github.com/mobilestack-xyz) framework by [Valora](https://valora.xyz). This document describes the process that was used to pull upstream changes into TuCOP Wallet.

## One time setup

### Pull forked repo to your local machine

```bash
git clone git@github.com:TuCopFinance/TuCopWallet.git
```

### Add upstream remote repository

On the root of the forked repository

```bash
# Add the upstream Mobile Stack (Mento) repo
git remote add upstream git@github.com:mobilestack-xyz/mobilestack-mento.git
```

## Syncing forks

### Ensure local repo is up to date

On the root of the forked repository

```bash
git fetch origin
git fetch upstream
git checkout main
git pull origin main
```

### Create branch

Create a backup branch for main in case anything goes wrong. You can also do
this directly on GitHub.

```bash
git checkout -b main-backup
```

Create a branch for syncing changes

```bash
# rename branch as required (e.g., prefixing your user id)
BRANCH_NAME=<user-id>/sync-fork
git checkout -b $BRANCH_NAME
```

### Merge upstream changes and resolve conflicts

```bash
git merge upstream/main
```

If there are any conflicts, resolve them manually and commit the merge. The
default merge commit is named `Merge branch 'source-branch' into
'destination-branch'`, rename this to follow conventional commit format. E.g.,
`chore: sync with mobilestack-mento`

If you accidentally commit with the default message, you can edit the message by
running the below, which would present you a text editor to update the commit message

```bash
git commit --amend
```

### Open a pull request

Push the remote branch and open a pull request on GitHub. Make sure to include
conflicted filenames in the PR description to make it easier for reviewers.

```bash
git push origin $BRANCH_NAME
```

### Merge pull request

Once the PR is approved, merge the pull request using the `Create a merge
commit` option:

![create-a-merge-commit](./assets/create-a-merge-commit.png)

This is off by default and you'd need to enable `Allow merge commits` in the
repo settings (make sure to select "Pull request title and description" as the
default commit message so it follows conventional commit format when merging):

![allow-merge-commit](./assets/allow-merge-commit.png)

If merge queue is on, you will also need to disable it since merge queue uses squash and merge by default. Merge queue can be turned off in Settings => Rules => Rulesets => main => Require Merge Queue.

You'll get a red error message saying the repository requires linear history and
doesn't allow merge commits. You can ignore this message and continue with the
merge.

A successful merge would mean that at the root of the repo, you'll see the
message that says `This branch is X commits ahead of <base-repo>`. You should
not see `Y commits behind`.

Once you've merged, you can disable `Allow merge commits` option in the settings
so other PRs are only merged using the `Squash and merge` option. Turn back on merge queue using `Squash and merge` as the default setting.

## Fixing bad merges

In case something went wrong with the sync, (e.g., fork is still behind base
repo, used squash and merge instead of merge commit, etc.), you can rewrite git
commit history to clean bad merges.

> This involves force pushes so be extra careful when doing this. Only
> attempt to do this if the sync is the latest commit and there are no new
> additional commits on top of it. Get help from the engineering team if you're
> unsure of any of this.

### Reset local main to backup main

```bash
git checkout main
git fetch origin
git pull origin main
git checkout -b main-synced-backup
git checkout main
git reset --hard main-backup
```

### Force push main

Force pushes are off by default. You'll need to enable this by changing two
settings:

- Enable `Allow force pushes` in branch protection settings.
  - Navigate to settings -> Branches -> Edit branch protection rules
- Disable `Block force pushes` in branch rulesets
  - Navigate to settings -> Rules -> Rulesets -> main

Once the settings are updated, run the following command:

```bash
git push --force origin main
```

Once this is complete, revert the settings changes done above so that force
pushes are no longer allowed.

The main branch should now be in the state before the sync, you can follow the
steps from above to do a fresh sync.
