const { execSync } = require('child_process')
const chalk = require('chalk')
const path = require('path')
const exec = (args) => execSync(args).toString().trim()

////////////////////////////////////////////////////////////////
/// CONFIG
////////////////////////////////////////////////////////////////

// Set this to the FIRST day where commits are valid!
const THRESHOLD_DATE = new Date('2019-07-17')

// Git sends this SHA when there is no commit on one side of the push
// (e.g. localSHA on a branch delete, remoteSHA on a new-branch push).
const ZERO_SHA = '0000000000000000000000000000000000000000'

////////////////////////////////////////////////////////////////
/// UTILITY FUNCTIONS
////////////////////////////////////////////////////////////////

function mergeBaseFor(refA, refB) {
  return exec(`git merge-base ${refA} ${refB}`)
}

function getCommitRange(change, remoteName) {
  if (change.remoteSHA === ZERO_SHA) {
    // pushing a new branch
    // => commit range = changes from main
    const fromSHA = mergeBaseFor(`${remoteName}/main`, change.localSHA)
    return [fromSHA, change.localSHA]
  } else {
    // push can be fast forward or not (push -f)
    // so we get the common ancestor and commits from there
    const fromSHA = mergeBaseFor(change.remoteSHA, change.localSHA)
    // assuming a fast forward => fromSHA is remoteBranch current HEAD
    return [fromSHA, change.remoteSHA, change.localSHA]
  }
}

/** Get the list for changed files between two commits */
function getChangedFiled(fromSHA, toSHA) {
  return exec(`git diff --name-only ${fromSHA}..${toSHA}`).split('\n')
}

/**
 * Get date from the first commit from all commits between
 * to given commits
 */
function getDateFromFirstCommit(fromSHA, toSHA) {
  const args = [
    'log',
    "--pretty='%cd'", // show only the commiterDate
    '--date=short', // date in YYYY-MM-DD format
    '--date-order', // order commits by date
    '--reverse', // show olders commits first
    `${fromSHA}..${toSHA}`, // show commits fromSHA to toSHA
  ]
  const dateStr = exec(`git ${args.join(' ')} | head -1`)
  return new Date(dateStr)
}

////////////////////////////////////////////////////////////////
/// MAIN
////////////////////////////////////////////////////////////////

// Read from process.argv and stdin instead of legacy Husky 3 env vars
// (HUSKY_GIT_PARAMS / HUSKY_GIT_STDIN), which are no longer populated under
// newer Node/Husky combos. argv + stdin is what Git itself passes to any
// pre-push hook, so this works under any Husky version (or without Husky).
const [remoteName, remoteUrl] = process.argv.slice(2)

let stdinData = ''
try {
  stdinData = require('fs').readFileSync(0, 'utf-8')
} catch {
  // No stdin available (e.g. when invoked manually outside a git push) - treat
  // as no changes and exit cleanly.
  stdinData = ''
}

const changes = stdinData
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => {
    const [localRef, localSHA, remoteRef, remoteSHA] = line.split(' ')
    return { localRef, localSHA, remoteRef, remoteSHA }
  })

for (const change of changes) {
  // Branch deletion: localSHA is all zeros and there are no incoming commits
  // to validate. Skip; getCommitRange would otherwise call `git merge-base`
  // with an invalid SHA and abort the entire push.
  if (change.localSHA === ZERO_SHA) {
    continue
  }
  // console.log('Checking commits to push to ', change.remoteRef)
  const [from, to] = getCommitRange(change, remoteName)

  const changedFiles = getChangedFiled(from, to)

  const pushedMnemonicFiles = changedFiles.filter(
    (name) => path.basename(name).startsWith('.env.mnemonic') && path.extname(name) !== '.enc'
  )
  if (pushedMnemonicFiles.length > 0) {
    console.error(`Trying to push conflicting files`)
    console.log(`Conflicting Files:\n  ${pushedMnemonicFiles.join('\n  ')}`)
    console.error(chalk.red(`(${change.remoteRef}) Push rejected!`))
    process.exit(1)
  }

  const firstCommitDate = getDateFromFirstCommit(from, to)
  if (firstCommitDate < THRESHOLD_DATE) {
    console.error(`Trying to push a commit from a date older than ${THRESHOLD_DATE.toUTCString()}`)
    console.error(`FirstCommitDate: ${firstCommitDate.toUTCString()}`)
    console.error(chalk.red(`(${change.remoteRef}) Push rejected!`))
    process.exit(1)
  }
}
