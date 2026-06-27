# Quarto Reference — Advanced Authoring

> Source: official Quarto documentation (quarto.org/docs/authoring/* and output-formats/page-layout). Compiled as an exhaustive syntax reference for building a Quarto editor. Each feature lists exact shortcode/div syntax, attributes/options, YAML keys, and a minimal example.

---

## Includes

Source: `quarto.org/docs/authoring/includes.html`

### `{{< include >}}` shortcode

Inserts the raw contents of another file directly into the document before processing.

**Syntax**

```markdown
{{< include _content.qmd >}}
```

**Rules**

| Rule | Detail |
|------|--------|
| Placement | Must appear alone on its own line, with an empty line above and below |
| Cannot nest in markdown | Not allowed inside lists, emphasis, table cells, etc. |
| Path resolution | Relative references (links, images, nested includes) inside the included file resolve relative to the **main** file's directory, not the included file. Use project-absolute paths (`/dir/_file.qmd`) for reliability |
| Naming convention | Prefix included files with `_` (e.g. `_basics.qmd`) so `quarto render` skips them as standalone outputs |
| Engine constraint | Computational includes (`.qmd` with executable cells) must all use the **same** engine (knitr OR jupyter). Only works in `.qmd`, not `.ipynb` |
| Metadata caveat | A metadata block in an included file takes effect in all documents that include it — usually causes unexpected behavior. Avoid YAML front matter in included partials |

**Minimal example**

```markdown
## Introduction

{{< include _intro.qmd >}}

## Methods

{{< include /shared/_methods.qmd >}}
```

### YAML include directives

Independent of the shortcode, these YAML keys inject raw content into output structural locations (HTML/LaTeX). Each accepts a bare filename (string), an explicit `file:` key, or inline `text:`.

| YAML key | Inserts content... |
|----------|--------------------|
| `include-in-header` | Into the header (`<head>` / LaTeX preamble) — custom CSS/JS/meta |
| `include-before-body` | At the start of the body (after `<body>` / `\begin{document}`) |
| `include-after-body` | At the end of the body (before closing tags) |

**Syntax variants**

```yaml
# bare filename
include-in-header: custom.css

# explicit file
include-before-body:
  file: header.html

# inline text
include-after-body:
  text: |
    <p>Goodbye</p>

include-in-header:
  text: |
    <style>body { color: blue; }</style>
```

---

## Variables

Source: `quarto.org/docs/authoring/variables.html`

Three shortcodes inject dynamic content. Markdown inside a variable value must be well-formed and may not alter surrounding structure (e.g. cannot close a div opened outside it).

### `{{< var >}}` — project variables

Reads from a project-level `_variables.yml` file.

**Syntax**

```markdown
{{< var version >}}
{{< var email.info >}}      # nested (dotted)
{{< var author.1 >}}        # array element (1-based)
```

**`_variables.yml`**

```yaml
version: 1.2
email:
  info: info@example.com
  support: support@example.com
engine:
  jupyter: "[Jupyter](https://jupyter.org)"
author:
  - Norah Jones
  - Jane Smith
```

### `{{< meta >}}` — document/project metadata

Reads from Pandoc metadata (document front matter or `_quarto.yml`).

**Syntax**

```markdown
{{< meta title >}}
{{< meta labels.description >}}   # nested
{{< meta author.1 >}}            # array index
{{< meta field\.with\.dots >}}   # escaped literal dot in key
```

### `{{< env >}}` — environment variables

Reads a system environment variable, with an optional fallback default.

**Syntax**

```markdown
{{< env PRODUCT_VERSION >}}
{{< env PRODUCT_VERSION "*.*" >}}   # fallback if unset
```

### Escaping shortcodes

To display shortcode text literally (e.g. in docs):

| Method | Syntax |
|--------|--------|
| Extra braces | `{{{< var version >}}}` |
| Code block attribute | fenced code block with `{shortcodes=false}` |

---

## Conditional Content

Source: `quarto.org/docs/authoring/conditional.html`

Two classes control visibility. They control whether content is **shown**, not whether wrapped code cells **execute** — cells still run.

| Class | Behavior |
|-------|----------|
| `.content-visible` | Shown only when conditions match |
| `.content-hidden` | Hidden when conditions match |

### Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `when-format` | Apply for the specified format(s) | `when-format="html"` |
| `unless-format` | Apply for all formats except specified | `unless-format="pdf"` |
| `when-profile` | Apply when the named project profile is active | `when-profile="advanced"` |
| `unless-profile` | Apply unless the named profile is active | `unless-profile="draft"` |
| `when-meta` | Apply when a metadata value is truthy | `when-meta="path.to.flag"` |
| `unless-meta` | Apply unless a metadata value is truthy | `unless-meta="flag"` |

### Format aliases

`when-format`/`unless-format` accept aliases that match groups of formats:

| Alias | Matches |
|-------|---------|
| `latex` | latex, pdf, beamer |
| `html` | html variants, epub, revealjs, dashboard, email |
| `markdown` | markdown variants, gfm, hugo-md, docusaurus-md |
| `html:js` | HTML-based formats that support JavaScript execution |

### Div syntax

```markdown
::: {.content-visible when-format="html"}
Appears only in HTML output.
:::

::: {.content-hidden when-format="pdf"}
Appears in every format except PDF.
:::

::: {.content-visible when-profile="advanced"}
Only when the `advanced` profile is active.
:::
```

### Span syntax (inline)

```markdown
Some text [shown in HTML only.]{.content-visible when-format="html"}
```

### Code block syntax

```markdown
```{.python .content-visible when-format="html"}
2 + 2
```
```

---

## Page Layout

Source: `quarto.org/docs/output-formats/page-layout.html`, `quarto.org/docs/authoring/article-layout.html`

### `page-layout` YAML values

| Value | Description |
|-------|-------------|
| `article` | Page-based grid with margins and sidebar/margin areas (default) |
| `full` | Article grid, but content area auto-expands to fill available width |
| `custom` | Plain HTML container — no default grid, padding, or margins |

```yaml
format:
  html:
    page-layout: article
```

### Grid customization

Nested under `format: html: grid:`.

| YAML key | Default | Unit | SCSS variable |
|----------|---------|------|---------------|
| `sidebar-width` | 250px | px | `$grid-sidebar-width` |
| `body-width` | 800px | px | `$grid-body-width` |
| `margin-width` | 250px | px | `$grid-margin-width` |
| `gutter-width` | 1.5em | px/em/rem | `$grid-column-gutter-width` |

```yaml
format:
  html:
    grid:
      sidebar-width: 350px
      body-width: 900px
      margin-width: 450px
      gutter-width: 1.5rem
```

### Column classes (content placement)

Apply as a div class (`.column-page`), a span class, or a code-cell `column:`/`fig-column:` option. Increasing width order: body → body-outset → page-inset → page → screen-inset → screen.

| Group | Classes | Cell option value |
|-------|---------|-------------------|
| Body | `.column-body`, `.column-body-outset`, `.column-body-outset-left`, `.column-body-outset-right` | `body`, `body-outset`, ... |
| Page inset | `.column-page-inset`, `.column-page-inset-left`, `.column-page-inset-right` | `page-inset`, ... |
| Page | `.column-page`, `.column-page-left`, `.column-page-right` | `page`, ... |
| Screen inset | `.column-screen-inset`, `.column-screen-inset-shaded`, `.column-screen-inset-left`, `.column-screen-inset-right` | `screen-inset`, ... |
| Screen | `.column-screen`, `.column-screen-left`, `.column-screen-right` | `screen`, ... |
| Margin | `.column-margin` | `margin` |
| Aside | `.aside` | — |

**Div example**

```markdown
::: {.column-page}
![Wide image](image.jpg)
:::

::: {.column-screen-inset-shaded}
Full-width banner with background.
:::

::: {.column-margin}
A note placed in the right margin.
:::

[Inline aside text]{.aside}
```

**Code cell example**

```r
#| column: page
plot(cars)
```

```r
#| fig-column: margin
#| fig-cap: "Figure rendered in the margin"
plot(iris)
```

### Margin content placement (YAML)

| YAML key | Effect |
|----------|--------|
| `reference-location: margin` | Footnotes rendered in the margin |
| `citation-location: margin` | Citations rendered in the margin |
| `cap-location: margin` | All captions in the margin |
| `fig-cap-location: margin` | Figure captions in the margin |
| `tbl-cap-location: margin` | Table captions in the margin |

```yaml
---
reference-location: margin
citation-location: margin
---
```

### Bootstrap CSS grid

Generic grid utility for HTML output:

```markdown
::: {.grid}
::: {.g-col-4}
One third.
:::
::: {.g-col-8}
Two thirds.
:::
:::
```

---

## Language

Source: `quarto.org/docs/authoring/language.html`

### `lang` — document language

IETF/BCP 47 tag; default `en`. Controls localized UI strings and hyphenation.

```yaml
---
title: "Mon document"
lang: fr
---
```

Supported: French, Spanish, German, Chinese, Japanese, Portuguese, Russian, and 30+ others.

### `language` — custom string overrides

Override individual localized strings inline:

```yaml
---
language:
  title-block-author-single: "Writer"
  title-block-published: "Updated"
---
```

### Per-language alternates

```yaml
---
lang: fr
language:
  en:
    title-block-published: "Updated"
  fr:
    title-block-published: "Mis à jour"
---
```

### External language file

```yaml
---
language: custom.yml
---
```

```yaml
# custom.yml
en:
  title-block-published: "Updated"
fr:
  title-block-published: "Mis à jour"
```

A project-level `_language.yml` placed beside `_quarto.yml` is picked up automatically.

### Customizable string categories

| Category | Example keys |
|----------|--------------|
| Title block | `title-block-author-single`, `title-block-author-plural`, `title-block-published`, `title-block-modified` |
| Cross-references (prefix/title) | `crossref-fig-title`, `crossref-tbl-title`, `crossref-lst-title`, `crossref-thm-title`, plus prefixes (`fig`, `tbl`, `lst`, `thm`, `lem`, `cor`, `prp`, `cnj`, `def`, `exm`, `exr`) |
| Callout captions | `callout-note-title` (`nte`), `callout-tip-title` (`tip`), `callout-warning-title` (`wrn`), `callout-important-title` (`imp`), `callout-caution-title` (`cau`) |

To support an unlisted language fully, copy Quarto's base language file from GitHub, translate it, and reference it via `language:`.

---

## Notebook Filters

Source: `quarto.org/docs/extensions/nbfilter.html`

Preprocess Jupyter `.ipynb` inputs before Quarto converts them. Filters run **only** for `.ipynb` inputs (not `.qmd`). Each filter receives the notebook's JSON on `stdin` and must write transformed JSON to `stdout`.

### `ipynb-filters` YAML key

Document- or project-level list. Multiple filters chain sequentially (output of one piped to the next). Working directory is the input notebook's location.

```yaml
---
ipynb-filters:
  - filter.py
  - second_filter.py
---
```

### Example filter script

```python
import sys
import nbformat

# read notebook from stdin
nb = nbformat.reads(sys.stdin.read(), as_version=4)

# prepend a comment to the source of each code cell
for index, cell in enumerate(nb.cells):
    if cell.cell_type == 'code':
        cell.source = "# comment\n" + cell.source

# write notebook to stdout
nbformat.write(nb, sys.stdout)
```

---

## Emojis

Source: no dedicated `quarto.org/docs/authoring/emojis.html` page exists (HTTP 404). Emoji support is provided through Pandoc's `emoji` Markdown extension, which Quarto enables.

### Shortcode-style syntax

Use `:name:` colon-delimited emoji shortcodes in markdown text:

```markdown
I am happy :smile:! Quarto is great :rocket:.
```

Renders as the corresponding Unicode emoji (e.g. 😄, 🚀).

**Notes**

- Relies on Pandoc's `emoji` extension (on by default for Quarto's GitHub-flavored/HTML pipelines).
- For richer/custom emoji shortcodes, community extensions exist (installed via `quarto add <ext>`); no first-party authoring page documents an emoji shortcode beyond the Pandoc `:name:` form.
