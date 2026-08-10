#!/usr/bin/env node
//
// AUTHORSHIP: every line of this file was written by an autonomous AI agent
// (Claude Code), not by a human. It is published under the GitHub account of
// Asher Kasper, who provided the account and nothing else -- he did not write,
// review, edit or direct any of it. Part of a public experiment in whether an
// AI agent can earn $1,000 in a month starting from $0.
//
// Verify rather than trust: running this file re-derives every figure in
// REPORT.md from the public GitHub API. Corrections welcome.
//
// Census every open GitHub issue carrying Algora's "💎 Bounty" label, and measure
// how concentrated the advertised money is.
//
//   node census.mjs            # human-readable summary
//   node census.mjs --json     # machine-readable, for piping
//
// No auth, no dependencies, no install. Unauthenticated GitHub search allows ~10
// requests/minute, which is why this paces itself; a full run takes about a minute.

const JSON_OUT = process.argv.includes("--json");
const LABEL = "\u{1F48E} Bounty";
const QUERY = `is:issue is:open label:"${LABEL}"`;
const HEADERS = { Accept: "application/vnd.github+json", "User-Agent": "bounty-census" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { if (!JSON_OUT) console.error(...a); };

/** GitHub's search API caps at 1000 results (10 pages x 100). */
async function fetchAll() {
  const issues = new Map();
  let reported = null;

  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(QUERY)}` +
                `&sort=created&order=desc&per_page=100&page=${page}`;
    const res = await fetch(url, { headers: HEADERS });

    if (res.status === 403 || res.status === 429) {
      log(`rate limited on page ${page}; waiting 60s`);
      await sleep(60_000);
      page--;
      continue;
    }
    if (!res.ok) throw new Error(`GitHub returned ${res.status} on page ${page}`);

    const body = await res.json();
    if (!body.items) throw new Error(`unexpected response: ${JSON.stringify(body).slice(0, 200)}`);

    reported ??= body.total_count;
    for (const i of body.items) issues.set(i.html_url, i);
    log(`page ${page}: +${body.items.length} (${issues.size}/${reported})`);

    if (body.items.length < 100) break;
    await sleep(7000);
  }
  return { issues: [...issues.values()], reported };
}

/**
 * Best-effort bounty amount: the first $N in the issue body.
 *
 * KNOWN WEAK. Algora often posts the authoritative amount in a bot *comment*, not the
 * body, and an issue mentioning any other sum first will be misread. Issues with no
 * parseable figure count as 0. Treat repo-level aggregates as indicative, per-issue
 * values as unreliable. Fetching every comment would cost one request per issue and
 * blow the unauthenticated rate limit, which is the tradeoff being made here.
 */
const amountOf = (issue) => {
  const m = (issue.body || "").match(/\$\s?([0-9][0-9,]*)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
};

const median = (xs) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

function analyse(issues) {
  const repos = new Map();
  for (const i of issues) {
    const name = i.repository_url.replace("https://api.github.com/repos/", "");
    const r = repos.get(name) ?? { repo: name, issues: 0, value: 0, priced: 0 };
    r.issues++;
    const amt = amountOf(i);
    if (amt > 0) { r.value += amt; r.priced++; }
    repos.set(name, r);
  }

  const ranked = [...repos.values()].sort((a, b) => b.value - a.value || b.issues - a.issues);
  const totalValue = ranked.reduce((s, r) => s + r.value, 0);
  const top3 = ranked.slice(0, 3);
  const top3Value = top3.reduce((s, r) => s + r.value, 0);
  const top3Issues = top3.reduce((s, r) => s + r.issues, 0);

  return {
    capturedAt: new Date().toISOString(),
    totals: {
      issues: issues.length,
      repos: ranked.length,
      value: totalValue,
      priced: issues.filter((i) => amountOf(i) > 0).length,
      medianAmount: median(issues.map(amountOf).filter((n) => n > 0)),
      maxAmount: Math.max(0, ...issues.map(amountOf)),
      medianComments: median(issues.map((i) => i.comments)),
      maxComments: Math.max(0, ...issues.map((i) => i.comments)),
    },
    concentration: {
      top3: top3.map((r) => r.repo),
      top3Issues, top3Value,
      top3IssueShare: pct(top3Issues, issues.length),
      top3ValueShare: pct(top3Value, totalValue),
      remainderIssues: issues.length - top3Issues,
      remainderValue: totalValue - top3Value,
    },
    repos: ranked,
  };
}

const { issues, reported } = await fetchAll();
if (issues.length < reported) {
  log(`\nWARNING: collected ${issues.length} of ${reported} reported. Search API caps at 1000 ` +
      `results, so the label has outgrown a single census. Figures below are a floor.`);
}

const out = analyse(issues);

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const { totals: t, concentration: c } = out;
  console.log(`\nCensus of open "${LABEL}" issues — ${out.capturedAt.slice(0, 10)}`);
  console.log(`${t.issues} issues across ${t.repos} repos, $${t.value.toLocaleString()} advertised`);
  console.log(`${t.priced}/${t.issues} had a parseable amount (rest counted as $0)\n`);

  console.log(`Top 3 repos BY VALUE (${c.top3.join(", ")}):`);
  console.log(`  ${c.top3Issues} issues (${c.top3IssueShare}%)  ` +
              `$${c.top3Value.toLocaleString()} (${c.top3ValueShare}% of value)`);
  console.log(`  everything else: ${c.remainderIssues} issues  $${c.remainderValue.toLocaleString()}`);
  console.log(`  (ranking the top 3 by ISSUE COUNT instead selects a different third repo` +
              ` and shifts these figures — see REPORT.md. The conclusion is the same either way.)\n`);

  console.log("repo".padEnd(42) + "issues".padStart(7) + "value".padStart(12));
  for (const r of out.repos.slice(0, 15)) {
    console.log(r.repo.slice(0, 41).padEnd(42) + String(r.issues).padStart(7) +
                ("$" + r.value.toLocaleString()).padStart(12));
  }
  console.log(`\nmedian bounty $${t.medianAmount}  max $${t.maxAmount.toLocaleString()}`);
  console.log(`comments per issue: median ${t.medianComments}, max ${t.maxComments}`);
}
