# Quarto Computations Reference

> Source: Official Quarto documentation (quarto.org/docs/computations/* and quarto.org/docs/interactive/ojs/), compiled 2026-06-26.

This reference covers code execution across languages (Python, R, Julia, Observable JS), inline code, the full set of cell execution options, and document parameters. It is intended for developers building a Quarto editor.

---

## Engines & Engine Selection

Quarto runs computations through an **engine**. The engine is auto-detected, or set explicitly.

| Engine | Languages | Backend |
|--------|-----------|---------|
| `knitr` | R (also Python/Julia via reticulate/etc.) | R `knitr` package |
| `jupyter` | Python, Julia, and any Jupyter kernel | Jupyter kernels |
| `julia` | Julia (native) | `QuartoNotebookRunner.jl` |
| `markdown` | none (no execution) | — |

Auto-detection rule for `.qmd`: if the document contains any `{r}` blocks, Quarto uses **knitr**; otherwise it uses **jupyter**.

### Overriding the engine

```yaml
---
engine: jupyter      # or: knitr, julia, markdown
---
```

Project-wide:

```yaml
# _quarto.yml
engines: ['julia']
```

### Executable vs. non-executable blocks

- ` ```{python} ` (single braces) — **executable**, run during render.
- ` ```python ` (no braces) — plain syntax-highlighted block, not run.
- ` ```{{python}} ` (double braces) — escaped; renders the literal `{python}` header (for documentation/tutorials).

---

## Python (Jupyter Engine)

### H3 Chunk header

````markdown
```{python}
import numpy as np
print(np.pi)
```
````

### Cell options (`#|` syntax)

Options go at the top of the cell as `#|` comments, in YAML syntax:

````markdown
```{python}
#| label: fig-polar
#| fig-cap: "A line plot on a polar axis"
#| echo: false

import matplotlib.pyplot as plt
import numpy as np
plt.plot(np.random.randn(100))
plt.show()
```
````

### Kernel selection

Set in document YAML:

```yaml
---
jupyter: python3
---
```

Full kernelspec form:

```yaml
---
jupyter:
  kernelspec:
    name: "xpython"
    language: "python"
    display_name: "Python 3.7 (XPython)"
---
```

List available kernels: `quarto check jupyter`.

### Installation

```bash
python3 -m pip install jupyter          # Mac/Linux
py -m pip install jupyter               # Windows
conda install jupyter                   # Conda
quarto check jupyter                    # verify
```

### Execution daemon

A persistent kernel between renders for speed.

```yaml
execute:
  daemon: false     # disable
  daemon: 60        # idle timeout in seconds
```

```bash
quarto render doc.qmd --execute-daemon 60
quarto render doc.qmd --no-execute-daemon
quarto render doc.qmd --execute-daemon-restart
```

### Caching

```bash
python3 -m pip install jupyter-cache
```

```yaml
execute:
  cache: true
```

```bash
quarto render example.qmd --cache | --no-cache | --cache-refresh
```

### Conditional execution (per format)

```{python}
import json, os
info = json.load(open(os.environ["QUARTO_EXECUTE_INFO"]))
is_html = info["format"]["identifier"]["base-format"] == "html"
```

---

## R (Knitr Engine)

### H3 Chunk header

````markdown
```{r}
library(ggplot2)
ggplot(mpg, aes(displ, hwy)) + geom_point()
```
````

### Cell options (`#|` syntax)

Quarto places chunk options in `#|` comments (YAML), **not** inside the `{r, ...}` header as classic R Markdown did:

````markdown
```{r}
#| label: fig-airquality
#| fig-cap: "Temperature and ozone level"
#| warning: false
#| fig-width: 8
#| fig-height: 6
```
````

### Knitr engine options (document-level)

```yaml
---
knitr:
  opts_chunk:
    collapse: true
    comment: "#>"
    R.options:
      knitr.graphics.auto_pdf: true
---
```

### Data frame printing

```yaml
format:
  html:
    df-print: paged    # default | kable | tibble | paged
```

### R expressions in option values (`!expr`)

```{r}
#| fig-cap: !expr 'paste("Air", "Quality")'
```

### Conditional execution

```{r}
if (knitr::is_html_output()) { ... }
# or:
info <- jsonlite::fromJSON(Sys.getenv("QUARTO_EXECUTE_INFO"))
```

### Installation

```r
install.packages("rmarkdown")   # also installs knitr
```

### Rendering

```r
quarto::quarto_render("document.qmd")   # from R console
```

---

## Julia

Two engines are available.

### H3 Chunk header

````markdown
```{julia}
using Plots
plot(sin, 0, 2π)
```
````

### Julia engine (recommended, native)

```yaml
---
engine: julia
---
```

Auto-installs `QuartoNotebookRunner.jl` into a private Quarto environment on first use. Engine options:

```yaml
---
engine: julia
julia:
  exeflags: ["--project=/path"]
  env: ["SOMEVAR=VALUE"]
---
```

Multi-language inside the Julia engine — import the bridge packages, then use `{python}` / `{r}` blocks with `$`-interpolation:

```{julia}
import PythonCall
import RCall
```

### Jupyter engine (IJulia, legacy/default for back-compat)

```julia
using Pkg
Pkg.add("IJulia")
Pkg.add("Revise")
```

```yaml
---
jupyter: julia-1.8
---
```

### Multiple outputs from one cell

```{julia}
using Plots
display(plot(sin, 0, 2π))
display(plot(cos, 0, 2π))
```

### Figure / layout cell options

````markdown
```{julia}
#| label: fig-example
#| fig-cap: "Caption"
#| fig-subcap:
#|   - "Subplot 1"
#|   - "Subplot 2"
#| layout-ncol: 2
```
````

---

## Inline Code

### Unified syntax (all engines)

Backticks with a braced language tag:

```markdown
The radius is `{python} radius`.
The radius is `{r} radius`.
The radius is `{julia} radius`.
```

First define the variable in a cell, then reference it inline:

````markdown
```{python}
radius = 5
```
The radius of the circle is `{python} radius`.
````
→ "The radius of the circle is 5."

### Native alternative syntaxes

| Engine | Native inline form |
|--------|--------------------|
| Knitr (R) | `` `r radius` `` (no braces) |
| OJS | `${radius}` |

### Evaluation & rendering notes

- Confine inline expressions to simple, pre-computed values.
- Output is treated as **plain text** by default; markdown is escaped.
- To emit markdown from inline output, use `Markdown()` (Python), `I()` (R), or `md` (OJS).

---

## Execution Options (Consolidated)

Set per-cell with `#|` comments, or document-wide under the `execute:` YAML key. Cell-level overrides document-level.

### H3 Full cell-option table

| Option | Meaning | Allowed values | Default |
|--------|---------|----------------|---------|
| `eval` | Evaluate the code chunk; if `false`, the code is echoed but not run | `true`, `false` | `true` |
| `echo` | Include source code in output | `true`, `false`, `fenced` | `true` |
| `output` | Include the results of executing the code | `true`, `false`, `asis` | `true` |
| `warning` | Include warnings in the output | `true`, `false` | `true` |
| `error` | Include errors in output (and do not halt render on error) | `true`, `false` | `false` |
| `include` | Catch-all: prevent any output (code or results) from being included | `true`, `false` | `true` |
| `cache` | Cache execution results | `true`, `false` | `false` |
| `freeze` | Re-execute computational docs (project render) | `true`, `false`, `auto` | varies |
| `label` | Cell identifier for cross-references | string | — |
| `code-fold` | Collapse code into a `<details>` block (HTML) | `true`, `false`, `show` | `false` |
| `code-summary` | Summary text shown for folded code | string | "Code" |
| `code-overflow` | Behavior for long lines | `scroll`, `wrap` | `scroll` |
| `code-line-numbers` | Show line numbers in source | `true`, `false`, or range e.g. `"1,3-5"` | `false` |
| `panel` | Wrap output in a panel | `tabset`, `input`, `sidebar`, `fill`, `center` | — |
| `fig-width` | Figure width (inches) | number | from format |
| `fig-height` | Figure height (inches) | number | from format |
| `fig-format` | Figure output format | `retina`, `png`, `jpeg`, `svg`, `pdf` | format default |
| `fig-dpi` | Figure resolution | number | format default |
| `fig-cap` | Figure caption | string | — |
| `fig-alt` | Figure alt text (accessibility) | string | — |
| `fig-subcap` | Subcaptions for multi-figure cells | list of strings | — |
| `layout-ncol` / `layout-nrow` | Lay out multiple outputs in columns/rows | integer | — |

### H3 Document-level `execute:` block

```yaml
---
title: "My Document"
execute:
  eval: true
  echo: false
  output: true
  warning: false
  error: false
  include: true
  cache: false
  freeze: auto       # true | false | auto
  daemon: false      # jupyter only; or seconds
  keep-ipynb: false  # retain generated .ipynb (jupyter)
  keep-md: false     # retain generated .md
---
```

### H3 `freeze` — never re-execute on project render

```yaml
execute:
  freeze: true   # never re-render
  freeze: auto   # re-render only when source changes
```

### H3 `output: asis` — raw markdown (no wrapper div)

```{python}
#| output: asis
#| echo: false
print("# Heading\n")
print("## Subheading\n")
```

Without `asis`, output is wrapped in `.cell-output` divs.

### H3 `echo: fenced` — show the full fenced block

````markdown
```{python}
#| echo: fenced
1 + 1
```
````

Renders the code *including* its ` ```{python} ` delimiters and option comments (except `echo: fenced` itself) — useful for tutorials.

### H3 Figure options (document-level)

```yaml
---
format:
  html:
    fig-width: 8
    fig-height: 6
    fig-format: png
    fig-dpi: 300
---
```

---

## Parameters

### H3 Knitr (R) — `params` in YAML

```yaml
---
params:
  alpha: 0.1
  ratio: 0.1
---
```

Access via `params$alpha` in chunks.

### H3 Jupyter (Python/Julia) — tagged cell

```{python}
#| tags: [parameters]
alpha = 0.1
ratio = 0.1
```

Parameters become variables in the environment directly.

### H3 Julia engine — `params` in YAML

```yaml
---
engine: julia
params:
  alpha: 0.1
  ratio: 0.1
---
```

Keys become constants in the Julia session.

### H3 Setting parameters at render time

```bash
# Command-line flags (override defaults)
quarto render document.qmd -P alpha:0.2 -P ratio:0.3

# YAML params file
quarto render document.qmd --execute-params params.yml
```

---

## Observable JS (OJS)

### H3 Chunk header

````markdown
```{ojs}
// reactive JS here
```
````

### Reactivity model

OJS uses a **reactive runtime**: cells re-execute automatically when their dependencies change (spreadsheet-like). Cells may be defined in **any order** — the runtime resolves execution order from variable references. Each value is defined once; reference it directly to display it.

### Cell options (`//|` syntax)

OJS uses `//|` comments:

```{ojs}
//| echo: false
//| eval: true
//| output: true
```

Common: `echo` (show code, default true), `eval` (run, default true), `output` (show result). Global defaults via `execute:` in front matter.

### H3 Inputs (interactive controls) with `viewof`

```{ojs}
viewof bill_length_min = Inputs.range(
  [32, 50], {value: 35, step: 1, label: "Bill length (min):"}
)
viewof islands = Inputs.checkbox(
  ["Torgersen", "Biscoe", "Dream"],
  {value: ["Torgersen", "Biscoe"], label: "Islands:"}
)
```

`viewof` exposes the control's value reactively — reference `bill_length_min` / `islands` directly elsewhere.

### H3 Data loading

```{ojs}
data = FileAttachment("palmer-penguins.csv").csv({typed: true})
```

Supports CSV, JSON, TSV, Arrow, SQLite. Pass data from Python/R via `ojs_define()`:

```{python}
import pandas as pd
penguins = pd.read_csv("palmer-penguins.csv")
ojs_define(data = penguins)
```

### H3 Filtering / transforming (reactive)

```{ojs}
filtered = data.filter(p =>
  bill_length_min < p.bill_length_mm && islands.includes(p.island)
)
```

`filtered` recomputes automatically when inputs change.

### H3 Plotting with Observable Plot

```{ojs}
Plot.rectY(filtered,
  Plot.binX({y: "count"}, {x: "body_mass_g", fill: "species", thresholds: 20})
).plot({
  facet: {data: filtered, x: "sex", y: "species", marginRight: 80},
  marks: [Plot.frame()]
})
```

### H3 Importing libraries

```{ojs}
d3 = require("d3@7")
topojson = require("topojson")
```

Observable stdlib, `Inputs`, and `Plot` load automatically.

### H3 Displaying values

```{ojs}
filtered   // a bare reference renders the value as output
```
