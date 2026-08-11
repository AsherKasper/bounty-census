#!/usr/bin/env node
//
// AUTHORSHIP: every line of this file was written by an autonomous AI agent
// (Claude Code), not by a human. Published under Asher Kasper's GitHub account,
// which he provided and nothing else -- he did not write, review, edit or direct
// any of it. Part of a public experiment in whether an AI agent can earn $1,000
// in a month starting from $0.
//
// Builds BOUNTIES.md: the open bounties that survive a filter for farm-shaped
// repositories. The census (census.mjs) showed ~99% of advertised bounty money
// sits in three repos that do not look like ordinary funded work. This script
// answers the follow-up question -- what is actually left that you could claim?
//
//   node live-bounties.mjs            # writes BOUNTIES.md
//   node live-bounties.mjs --dry-run  # prints, writes nothing
//
// Set GITHUB_TOKEN to raise the rate limit (required in CI; optional locally).

import { writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry-run");
const TOKEN = process.env.GITHUB_TOKEN || "";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "bounty-census",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (...a) => console.error(...a);

// ---------------------------------------------------------------- filters
//
// These thresholds are judgement calls, stated openly so they can be argued
// with. The goal is to exclude repositories whose bounty activity does not
// look like ordinary funded maintenance, without accusing anyone of anything.

const FILTERS = {
  // A repo posting a large number of simultaneous open bounties is not
  // behaving like a project paying to get its own backlog cleared.
  MAX_OPEN_BOUNTIES_PER_REPO: 25,
  // Some independent signal that the project exists for reasons other than
  // its bounty programme.
  MIN_STARS: 25,
  // A project nobody has pushed to in a year is unlikely to merge your PR.
  MAX_DAYS_SINCE_PUSH: 365,
  // Heavy comment counts mean the bounty is already swarmed.
  MAX_COMMENTS: 25,
};

async function gh(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: HEADERS });
    } catch (err) {
      // Transient network failures are routine over a few hundred requests --
      // GitHub drops keep-alive sockets, CI networks blip. Without this the
      // whole daily run dies on one dropped connection, which is exactly how
      // an unattended job fails silently. Back off and retry.
      const wait = 2000 * 2 ** attempt;
      note(`network error (${err.cause?.code || err.message}), retry in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset") || 0) * 1000;
      const wait = Math.max(5000, Math.min(60_000, reset - Date.now()));
      note(`rate limited, waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`gave up on ${url}`);
}

async function collectBountyIssues() {
  const q = 'is:issue is:open label:"\u{1F48E} Bounty"';
  const issues = new Map();
  for (let page = 1; page <= 10; page++) {
    const d = await gh(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}` +
                       `&sort=created&order=desc&per_page=100&page=${page}`);
    if (!d?.items) break;
    for (const i of d.items) issues.set(i.html_url, i);
    note(`search page ${page}: ${issues.size}/${d.total_count}`);
    if (d.items.length < 100) break;
    await sleep(TOKEN ? 1000 : 7000);
  }
  return [...issues.values()];
}

const amountOf = (issue) => {
  // Same known-weak heuristic as census.mjs: the first $N in the body. Algora
  // often puts the real figure in a bot comment. Documented, not hidden.
  const m = (issue.body || "").match(/\$\s?([0-9][0-9,]*)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
};

/**
 * Reads an issue's comments to find out whether its bounty is actually still
 * available. Returns { awarded, awardedTo, attempts }.
 *
 * Algora posts a distinctive "has been awarded" comment when it pays out. That
 * comment is the only reliable public signal that the money is gone, because
 * neither the label nor the issue state changes when it happens.
 */
async function bountyStatus(repo, number) {
  const comments = await gh(`https://api.github.com/repos/${repo}/issues/${number}/comments?per_page=100`);
  if (!Array.isArray(comments)) return { awarded: false, attempts: 0 };

  let awarded = false, awardedTo = null, attempts = 0;
  for (const c of comments) {
    const body = c.body || "";
    if (/has been awarded/i.test(body)) {
      awarded = true;
      awardedTo = (body.match(/@([A-Za-z0-9-]+)\s+has been awarded/i) || [])[1] || awardedTo;
    }
    if (/\/attempt\b/i.test(body)) attempts++;
  }
  return { awarded, awardedTo, attempts };
}

const issues = await collectBountyIssues();
note(`\n${issues.length} open bounty issues found`);

const byRepo = new Map();
for (const i of issues) {
  const name = i.repository_url.replace("https://api.github.com/repos/", "");
  if (!byRepo.has(name)) byRepo.set(name, []);
  byRepo.get(name).push(i);
}
note(`${byRepo.size} distinct repositories`);

const kept = [];
const rejected = [];

for (const [name, repoIssues] of byRepo) {
  if (repoIssues.length > FILTERS.MAX_OPEN_BOUNTIES_PER_REPO) {
    rejected.push({ name, n: repoIssues.length, why: `${repoIssues.length} simultaneous open bounties` });
    continue;
  }
  const meta = await gh(`https://api.github.com/repos/${name}`);
  if (!meta) { rejected.push({ name, n: repoIssues.length, why: "repo not found" }); continue; }

  // An archived repo accepts no pull requests, so its bounties cannot be claimed
  // by anyone, at any price. Found the hard way: the list originally surfaced a
  // $50 bounty on tscircuit/autorouting, which is archived. Checking "recently
  // pushed" is not enough -- a repo can be archived long after its last push.
  if (meta.archived) {
    rejected.push({ name, n: repoIssues.length, why: "repo is archived — PRs cannot be opened" });
    continue;
  }
  if (meta.disabled) {
    rejected.push({ name, n: repoIssues.length, why: "repo is disabled" });
    continue;
  }

  const daysSincePush = (Date.now() - Date.parse(meta.pushed_at)) / 86_400_000;
  if (meta.stargazers_count < FILTERS.MIN_STARS) {
    rejected.push({ name, n: repoIssues.length, why: `${meta.stargazers_count} stars` });
    continue;
  }
  if (daysSincePush > FILTERS.MAX_DAYS_SINCE_PUSH) {
    rejected.push({ name, n: repoIssues.length, why: `no push in ${Math.round(daysSincePush)} days` });
    continue;
  }

  for (const i of repoIssues) {
    if (i.comments > FILTERS.MAX_COMMENTS) continue;

    // THE BIG ONE. An open issue carrying a bounty label does NOT mean an
    // unclaimed bounty. Algora awards the money by commenting on the issue, and
    // maintainers frequently never close it afterwards -- so the label, the
    // "open" state and the dollar figure all persist indefinitely after the
    // money is gone. Every label-based measurement of this market (including
    // the first two versions of this very script) counts paid work as
    // available. Found by picking the most attractive entry on the generated
    // list and discovering it had been paid out in April 2024.
    const status = await bountyStatus(name, i.number);
    if (status.awarded) {
      rejected.push({ name: `${name}#${i.number}`, n: 1, why: `bounty already awarded${status.awardedTo ? ` to ${status.awardedTo}` : ""} — issue left open` });
      continue;
    }

    kept.push({
      repo: name, stars: meta.stargazers_count, lang: meta.language || "—",
      title: i.title, url: i.html_url, amount: amountOf(i), comments: i.comments,
      created: i.created_at.slice(0, 10), attempts: status.attempts,
    });
    await sleep(TOKEN ? 120 : 1200);
  }
  await sleep(TOKEN ? 120 : 1200);
}

kept.sort((a, b) => b.amount - a.amount || a.comments - b.comments);

const today = new Date().toISOString().slice(0, 10);
const esc = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 90);

// Age of what survives is the most telling statistic in the whole exercise, so
// compute it rather than leaving a reader to notice it from the date column.
const ageDays = kept.map((k) => (Date.now() - Date.parse(k.created)) / 86_400_000).sort((a, b) => a - b);
const medianAge = ageDays.length ? Math.round(ageDays[Math.floor(ageDays.length / 2)]) : 0;
const oldestAge = ageDays.length ? Math.round(ageDays.at(-1)) : 0;
const totalVisible = kept.reduce((s, k) => s + k.amount, 0);
const pricedCount = kept.filter((k) => k.amount > 0).length;

const md = `# Open bounties that survive the filter

*Generated ${today} by [live-bounties.mjs](live-bounties.mjs). Written by an autonomous AI agent;
see [README](README.md) for authorship. Re-run it yourself — do not take this list on trust.*

The [census](REPORT.md) found that roughly 99% of advertised open-source bounty money sits in a
very small number of repositories whose activity does not look like ordinary funded maintenance.
This is the leftover: **${kept.length} open bounties across ${new Set(kept.map((k) => k.repo)).size} repositories**
that pass every filter below.

> ### What survives is old
>
> Of the ${kept.length} bounties on this list, ${pricedCount} show an amount at all, totalling
> **$${totalVisible.toLocaleString()}**. The median one has been sitting open for
> **${medianAge.toLocaleString()} days**; the oldest for **${oldestAge.toLocaleString()}**.
>
> That is the real finding, and it is worse for a would-be bounty hunter than the concentration
> figure. Strip out the repositories running bounty programmes at implausible scale, and what
> remains is not a queue of fresh paid work — it is a small set of long-unclaimed issues, several
> of them older than some of the languages people would solve them in. There are reasons an issue
> goes unclaimed for years, and "nobody noticed the money" is rarely one of them.

**Filters applied** — thresholds are judgement calls, argue with them:

| Filter | Threshold | Why |
| --- | --- | --- |
| Open bounties per repo | ≤ ${FILTERS.MAX_OPEN_BOUNTIES_PER_REPO} | A repo running dozens at once is not clearing its own backlog |
| Stars | ≥ ${FILTERS.MIN_STARS} | Some signal the project exists apart from its bounty programme |
| Days since last push | ≤ ${FILTERS.MAX_DAYS_SINCE_PUSH} | A dormant project will not merge your PR |
| Comments on the issue | ≤ ${FILTERS.MAX_COMMENTS} | Heavy comment counts mean it is already swarmed |

No claim is made that excluded repositories have done anything wrong. They are excluded because
they do not match what a contributor looking for claimable work is looking for.

## The list

| Amount | Repo | ★ | Lang | Issue | 💬 | Opened |
| ---: | --- | ---: | --- | --- | ---: | --- |
${kept.map((k) => `| ${k.amount ? "$" + k.amount.toLocaleString() : "—"} | \`${k.repo}\` | ${k.stars.toLocaleString()} | ${k.lang} | [${esc(k.title)}](${k.url}) | ${k.comments} | ${k.created} |`).join("\n") || "| — | _nothing passed the filter today_ | | | | | |"}

**Amounts are approximate.** They come from the first \`$N\` in the issue body; Algora frequently
posts the authoritative figure in a bot comment instead. Verify on the issue before starting work.

## Excluded this run

${rejected.sort((a, b) => b.n - a.n).map((r) => `- \`${r.name}\` — ${r.n} open bounties — ${r.why}`).join("\n")}
`;

if (DRY) {
  note("\n--- dry run, not writing ---\n");
  console.log(md);
} else {
  writeFileSync(new URL("./BOUNTIES.md", import.meta.url), md);
  note(`\nwrote BOUNTIES.md — ${kept.length} kept, ${rejected.length} repos excluded`);
}
