# Third-Place Matrix (Annex C) — Deferred Extraction

## Status: NOT YET EXTRACTED — assigned to Claude Code Phase 1 execution

## Why this file is empty

The 2026 World Cup uses a 495-row matrix (FIFA Regulations Annex C) that maps each of the 495 possible "which 8 of 12 third-placed groups qualify" combinations to specific R32 matchups. Manually transcribing 495 rows in this chat session would burn budget for no benefit — it is a mechanical parsing job better done in Claude Code where we can write a script, validate output, and check our work.

## Output file shape (target)

`third_place_matrix_2026.json` should look like:

```json
{
  "_meta": {
    "source": "FIFA Regulations Annex C, cross-checked against Wikipedia 2026_FIFA_World_Cup_knockout_stage",
    "captured_on": "YYYY-MM-DD"
  },
  "combinations": [
    {
      "combo_id": 1,
      "qualifying_third_place_groups": ["E", "F", "G", "H", "I", "J", "K", "L"],
      "r32_assignments": {
        "1A": "3E",
        "1B": "3J",
        "1D": "3I",
        "1E": "3F",
        "1G": "3H",
        "1I": "3G",
        "1K": "3L",
        "1L": "3K"
      }
    },
    {
      "combo_id": 2,
      "qualifying_third_place_groups": ["D", "F", "G", "H", "I", "J", "K", "L"],
      "r32_assignments": { ... }
    }
    // ... 493 more rows ...
  ]
}
```

Note the key/value direction: for each of the 8 group-WINNER slots that meet a third-placed team (1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L per the R32 schedule in `knockout_slots_2026.json`), the matrix tells you WHICH third-placed team they face.

## Extraction sources (in priority order)

1. **FIFA Regulations PDF, Annex C** (authoritative)
   - Primary: https://digitalhub.fifa.com/m/636f5c9c6f29771f/original/FWC2026_regulations_EN.pdf
   - Mirror: https://www.worldcup2026football.co.uk/wc-2026-regulations.pdf
   - Both are PDFs. Use pdfplumber/PyMuPDF.

2. **Wikipedia 2026_FIFA_World_Cup_knockout_stage** (mirror, cross-check)
   - URL: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage
   - Has a 495-row table titled "Combinations of matches in the round of 32"
   - Format we already partially saw: `No.: Third-placed teams advance from groupsv; ... ; 1A vs; 1B vs; 1D vs; 1E vs; 1G vs; 1I vs; 1K vs; 1L vs`
   - HTML table is easier to parse than the PDF.

## Recommended extraction approach (for Claude Code)

```python
# Option A: Wikipedia (easier)
import requests, pandas as pd
url = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage"
tables = pd.read_html(url)  # returns list of DataFrames
# find the 495-row table, normalize columns, dump to JSON

# Option B: PDF (authoritative)
import pdfplumber
with pdfplumber.open("FWC2026_regulations_EN.pdf") as pdf:
    # find Annex C pages (usually near end of doc)
    # extract tables, normalize
```

## Validation checklist (mandatory)

After extraction:

- [ ] Exactly 495 rows.
- [ ] Every row's `qualifying_third_place_groups` is exactly 8 of {A, B, C, D, E, F, G, H, I, J, K, L}.
- [ ] All 8 group-winner keys (1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L) appear in every row's r32_assignments.
- [ ] Every value is one of {3A, 3B, ..., 3L} and is in that row's qualifying_third_place_groups.
- [ ] **Same-group constraint:** for every row, no 1X is paired with 3X (e.g., 1A paired with 3A is forbidden). This is the constraint FIFA designed the matrix around — if it's violated, the parse is wrong.
- [ ] Spot-check combos 1, 100, 250, 495 against Wikipedia by hand.

## Schema integration

Once extracted, the matrix is consumed by the simulator as follows (pseudocode):

```python
def assign_r32_matches(group_results, third_place_matrix):
    qualified_thirds = best_eight_thirds(group_results)
    combo_key = sorted([t.group for t in qualified_thirds])  # e.g. ["A","C","E","F","G","H","J","L"]
    combo = lookup_matrix_by_groups(third_place_matrix, combo_key)
    return [
        match("1E", combo.r32_assignments["1E"]),
        match("1A", combo.r32_assignments["1A"]),
        # ... etc for all 8 winner-vs-third slots
    ]
```

## Estimated effort

10-20 minutes in Claude Code with a working Python environment. Do this as one of the first Claude Code tasks in Day 2 morning.
