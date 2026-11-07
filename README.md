# Electoral Atlas

**US election analysis, 2008–2024**

**Start with [START_HERE.html](START_HERE.html).** Download and extract the ZIP, then open that file in a browser. The historical briefing, interactive filters and CSV exports work offline. Send the HTML by itself to someone who wants to read the analysis. Send the full ZIP to someone who wants to run or modify the project.

## What changed?

The national presidential popular-vote margin moved **5.9 percentage points toward Republicans** between 2020 and 2024. Six states moved from a Democratic lead to a Republican lead. National turnout fell **2.7 points** from 2020, while staying **3.8 points** above 2016. The 2012 House result illustrates why the national vote and seats require separate measures. Democrats led the national vote by **1.3 points** while Republicans won **33 more seats**.

Young people voting in a general election for the first time leaned toward Harris in CIRCLE/AP VoteCast. Pew found a Trump lead among people of all ages who voted in 2024 after sitting out 2020. The two estimates use different survey definitions, and the groups can overlap. To study what drove the change, compare like-for-like voter cohorts and separate who turned out from who switched candidates.

## Read the dashboard

| Section | Question it answers |
| --- | --- |
| Analyst briefing | What changed in 2024, where did the lead switch, and how can votes and seats diverge? |
| Voter findings | How did vote choice differ by race and ethnicity and by age? How did young, first-time and naturalized voters participate and vote? |
| Electoral geography | Which states or reporting units had the largest changes in presidential margin? |
| Congress & midterms | How did the national House vote and seats differ, and what do the available contest counts show? |
| Compare cycles | How did House seats, turnout and presidential margins change between two elections? |
| Economic context | How did October indicators compare across election years? This section uses an optional local FRED import. |
| Data & methods | Where do the numbers come from, and which CSVs support the analysis? |

The briefing starts with a question, gives the answer in the headline, and puts the chart beside the interpretation. Use the explorer to inspect underlying comparisons. Each headline uses a defined period and measure. The recommended follow-ups are research questions grounded in those comparisons.

In **Voter findings**, use **Race & ethnicity** or **Age groups** to jump to the graphs. The year selector updates the candidate-support bars and the written takeaway. The adjacent trend graph keeps the full 2016–2024 comparison visible. Each section includes its source, a values table and a CSV download.

## Run locally

Requires Python 3.10 or newer. In the extracted project folder:

```bash
python -m venv .venv
```

Activate with `source .venv/bin/activate` on macOS/Linux or `..venvScriptsActivate.ps1` in PowerShell. Then run:

```bash
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The API reference is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

To rebuild the standalone report after changing data, scripts or styles:

```bash
python scripts/build_standalone.py
```

## Data and definitions

| Measure | Definition and scope |
| --- | --- |
| Presidential margin | Democratic vote share minus Republican vote share, in percentage points. Both shares use all reported presidential votes as the denominator. |
| Geographic swing | The later presidential margin minus the earlier margin. A flip requires the Democratic–Republican lead to switch parties. Zero-vote and otherwise unusable matches are excluded. County and reporting-unit identifiers may persist across boundary changes, especially in Alaska. State margins use summed votes. |
| House seats | Voting seats won in general elections. The 2018 North Carolina district left unfilled is counted separately. The 2020 tally includes the seat won by the representative-elect who died before taking office, following the FEC convention. |
| Contest rows | The MIT extract provides candidate counts. Rows marked **Certified** come from the linked official result. Other rows identify a lead in the available counts and can be missing contests, final rounds or party details. Use the national summary for House seat totals. Senate contest rows cover seats contested in the cycle. |
| Turnout | Total ballots cast as a share of estimated voting-eligible population, using the cited national series. The CIRCLE youth estimates use a separate age-specific series. |
| Voter surveys | Pew validated-voter estimates and CIRCLE/AP VoteCast estimates use distinct methods and populations. Rounded values and residual categories can differ from unrounded source values. Age groups change membership between elections. |
| Foreign-born population | ACS resident estimates include noncitizens. Margins of error use 90% confidence. The state scatterplot is a cross-sectional association between resident share and presidential margin. |
| Economic indicators | October observations in the FRED vintage available at download time. Use ALFRED for what was available to voters before Election Day. The optional weighted model uses state and election-year fixed effects and state-clustered errors. Its coefficient is an association. |

`data/historical_summary.csv` and `data/findings/` hold the small curated inputs. `data/snapshot/` holds processed historical election returns and their source manifest. `data/congress_corrections.csv` records specific official outcomes for contests where generic vote ranking is inadequate. The presidential extract reports **25,935 unreconciled votes** across 127 reporting units in Arizona, Iowa and Vermont in 2024. The CSVs expose this difference in `unreconciled_votes` and retain the published denominator.

Sources include the [MIT Election Data and Science Lab via ElectionData.dev](https://electiondata.dev/datasets/), the [Federal Election Commission](https://www.fec.gov/introduction-campaign-finance/election-results-and-voting-information/), the [National Archives](https://www.archives.gov/electoral-college), [Pew Research Center](https://www.pewresearch.org/politics/2025/06/26/voting-patterns-in-the-2024-election/), [CIRCLE](https://circle.tufts.edu/2024-election), and [CRS using Census ACS](https://www.everycrsreport.com/reports/R48940.html). `data/sources.json` lists the full registry and applicable terms.

## Refresh and test

```bash
# Refresh the historical election source files and recreate processed extracts
python scripts/ingest.py --refresh

# Optional national economic series, using the bundled elections
python scripts/ingest.py --skip-election --economy

# Optional state unemployment for the exploratory model
python scripts/ingest.py --skip-election --state-labor

python -m pip install -r requirements-dev.txt
python -m pytest -q
```

The importer caches original files under `data/raw/` and writes new CSVs under `data/processed/`. The app prefers refreshed extracts when present and falls back to the release snapshot. Failed imports return a nonzero exit code and write per-run failures to `data/processed/manifest.json`. Review that manifest before publishing a rebuilt snapshot. The supplied standalone keeps FRED optional. Check source terms before redistributing any locally added series.

Original application code uses the MIT License. The MIT election extracts are CC0. The charting library is bundled with its license in `static/vendor/`. Third-party figures and data retain their respective source terms.
