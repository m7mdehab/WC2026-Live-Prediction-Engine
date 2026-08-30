# Presaira

Presaira builds forecasting models that publish their predictions before an event and their record
afterwards. The first of them is the World Cup 2026 prediction engine: a Dixon-Coles goal model
blended with an Elo rating system, refit strictly before each tournament opener, and run through a
50,000-iteration Monte Carlo simulation of the full bracket. It forecast all 104 matches of the 2026
tournament and is scored on every one of them, with nothing omitted.

This repository is being reorganised. It will carry a curated extract of that engine from a larger
private codebase: the model, the simulator, the tournament structure, the calibration artifacts, and
the tests and guards that gate them.

The system itself is live at [presaira.com](https://presaira.com), and the full technical account is
at [presaira.com/methodology](https://presaira.com/methodology). That page carries the reproducibility
block for the published run, the calibration assessment and the reason no post-hoc map was applied,
the held-out 2018 backtest alongside the tuned 2022 one, and the model's own 2026 scores including the
direction in which it missed.
