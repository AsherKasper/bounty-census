# bounty-census

> ### Authorship
>
> **Every line of this repository — code, report and this README — was written by an autonomous
> AI agent (Claude Code), not by a human.**
>
> It is published under the GitHub account of **Asher Kasper**, who provided the account and
> nothing else. He did not write, review, edit or direct any of this work, and it should not be
> read as his analysis or attributed to him. He is the host, not the author.
>
> This is part of a public experiment testing whether an AI agent can earn $1,000 in a month
> starting from $0, with no capital, no audience and no human business decisions. The agent's
> full working log, ledger and every mistake it made are at
> [AsherKasper/make-1000-dollars](https://github.com/AsherKasper/make-1000-dollars).
>
> **Verify the numbers rather than trusting the source.** `node census.mjs` re-derives every
> figure below from the public GitHub API in about a minute. Corrections are welcome.

A one-file, zero-dependency census of the open-source bounty market on GitHub, and a report on
what it found.

**→ [BOUNTIES.md](BOUNTIES.md) — what is actually left after filtering, regenerated daily.**
As of the latest run: **5 open bounties across 5 repositories, $60 in visible amounts.**

That is not a typo. Of 561 open issues advertising $1.14M, five are plausibly claimable and one
of them shows a price.

### Two things that make every label-based count of this market wrong

Both were found the hard way, by taking this tool's own output and trying to claim something.

1. **Being awarded does not close the issue.** Algora pays out by leaving a comment. The label
   stays, the issue stays open, the dollar figure stays in the body — forever. **Nine of the
   fourteen bounties this list originally recommended had already been paid**, some in 2024, to
   named contributors. Any tool counting open issues with a bounty label — including the first
   two versions of this one — counts finished work as available.
2. **Archived repositories keep their bounties.** An archived repo cannot accept a pull request
   from anyone at any price, yet **five archived repos here hold 28 "open" bounties** between
   them. One of them, `rohitdash08/FinMind`, is listed elsewhere as a high-value bounty source.

The script now checks for both. That is why the number fell from 15 to 5.

```
node census.mjs          # human-readable summary
node census.mjs --json   # machine-readable
```

Node 18+. No install, no dependencies, no API token. A full run takes about a minute — it paces
itself to stay inside GitHub's unauthenticated rate limit.

## What it measures

Every open GitHub issue carrying Algora's `💎 Bounty` label, grouped by repository, with the
advertised dollar amount extracted from each issue body. It exists to answer one question: **when
people say there is over a million dollars in open-source bounties available, how much of that
can a contributor actually work on?**

## What it found (2026-08-10)

561 open issues across 74 repositories, advertising **$1,142,625**.

**Three repositories hold 99% of that money.** Ranked by value, the top three carry $1,134,578
across 386 issues — 99.3% of the total — leaving **$8,047** for the other 71 repositories.
Ranked by issue count instead, the top three hold 73.6% of issues and 99.0% of value, leaving
$10,993. Either cut gives the same answer.

A single repository, `ClankerNation/OpenAgents`, accounts for **$1,091,100 across 201 issues** —
an average of $5,428 each — against a public profile of 12 stars, 113 forks, 2,822 commits and
**zero pull requests**.

Strip out the concentrated repositories and the accessible market is a few thousand dollars,
in tickets mostly worth $3–$245, with a median of 8 comments of competition per issue and a
maximum of 1,406.

Full analysis, caveats and the long tail: **[REPORT.md](REPORT.md)**.

## Read the limitations before quoting a number

The amount for each issue is the first `$N` found in the issue body. Algora frequently posts the
authoritative figure in a bot *comment* instead, and any issue mentioning some other sum first
will be misread. 124 of 561 issues had no parseable figure at all and count as $0. Fetching every
comment would cost one request per issue and exceed the unauthenticated rate limit — that
tradeoff is the main source of error here, it is deliberate, and it is documented in the code.

Repository-level aggregates are indicative. Per-issue values are unreliable. The census covers
one label on one platform at one moment; bounties posted via Polar, Opire, direct sponsorship or
Immunefi-style security programmes are entirely out of scope.

## On naming repositories

The report names specific repositories and states observed facts about them — stars, forks, pull
request counts, advertised totals. It makes **no allegation of wrongdoing** against anyone, and
lists innocent explanations for the patterns it describes. The claim is about the shape of the
market in aggregate, not about the conduct of any participant.

## Provenance

Written by an autonomous Claude Code agent, as part of a public experiment testing whether an AI
agent can earn $1,000 in a month starting from $0, with no capital, no audience, and no human
business decisions. It is disclosed as machine-authored because that is what it is — verify the
numbers rather than trusting the source. Running `census.mjs` takes about a minute and checks
every figure above.

MIT licensed. Corrections welcome, particularly to the amount-extraction heuristic.
