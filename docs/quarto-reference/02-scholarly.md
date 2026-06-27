# Quarto Scholarly Writing Syntax Reference

> Source: Official Quarto documentation (quarto.org/docs/authoring) — citations, cross-references, cross-reference divs, front matter, title blocks, appendices. Compiled 2026-06-26 as an exhaustive syntax reference for a Quarto editor.

---

## Citations

Source: `quarto.org/docs/authoring/citations.html`

Quarto uses Pandoc citeproc by default. The default style is **Chicago Manual of Style author-date**.

### Bibliography & style YAML keys

| Key | Type | Description |
|-----|------|-------------|
| `bibliography` | string or array | Path(s) to bibliography file(s). Formats: `.bib` (BibLaTeX), `.bibtex` (BibTeX), CSL JSON, RIS, EndNote, etc. |
| `csl` | string | Path/URL to a CSL style file (`.csl`). 8,500+ styles at the CSL Project repo / Zotero. |
| `suppress-bibliography` | boolean | If `true`, do not emit the generated reference list. |
| `nocite` | block | Include entries without an in-text citation (see below). |
| `citeproc` | boolean | Force Pandoc citeproc (e.g. for Typst). |

```yaml
---
bibliography:
  - refs1.bib
  - refs2.bib
csl: nature.csl
---
```

### Citation key syntax

A citation key is `@` + identifier. The identifier must begin with a letter, digit, or underscore, and may contain alphanumerics plus internal punctuation `:.#$%&-+?<>~/`.

### Citation reference forms

| Markdown | Output (author-date) | Output (numeric) |
|----------|----------------------|------------------|
| `[see @knuth1984, pp. 33-35; also @wickham2015, chap. 1]` | (see Knuth 1984, 33–35; also Wickham 2015, chap. 1) | [1], pp. 33-35; also [1], chap. 1 |
| `[@knuth1984, pp. 33-35, 38-39 and passim]` | (Knuth 1984, 33–35, 38–39 and passim) | [1], pp. 33-35, 38-39 and passim |
| `[@wickham2015; @knuth1984]` | (Wickham 2015; Knuth 1984) | [1, 2] |
| `@knuth1984 says blah.` | Knuth (1984) says blah. | [1] says blah. |
| `@knuth1984 [p. 33] says blah.` | Knuth (1984, 33) says blah. | [1] [p. 33] says blah. |
| `Wickham says blah [-@wickham2015]` | Wickham says blah (2015) | Wickham says blah [1] |

### Citation components

| Form | Meaning | Example |
|------|---------|---------|
| `@key` | In-text (narrative) citation | `@knuth1984` → Knuth (1984) |
| `[@key]` | Parenthetical citation | `[@knuth1984]` → (Knuth 1984) |
| `-@key` | Suppress author (year only) | `[-@knuth1984]` → (1984) |
| Prefix | Text before, inside brackets | `[see @knuth1984]` |
| Locator | `pp.` / `p.` / `chap.` etc. after key | `[@knuth1984, pp. 33-35]` |
| Suffix | Trailing text | `[@knuth1984, and passim]` |
| Multiple | Semicolon-separated keys | `[@a; @b]` |

### Bibliography generation

Pandoc places the reference list in a div with id `refs`; position it explicitly:

```markdown
### References

::: {#refs}
:::
```

If no `#refs` div exists, the bibliography appends to document end. Suppress with `suppress-bibliography: true`.

### Uncited items (`nocite`)

```yaml
---
nocite: |
  @item1, @item2
---
```

Include every bibliography entry with `@*`:

```yaml
nocite: |
  @*
```

### PDF citation method (`cite-method`)

PDF-only. Options: `citeproc` (default), `natbib`, `biblatex`.

```yaml
format:
  pdf:
    cite-method: biblatex
```

| Option | Purpose |
|--------|---------|
| `biblatexoptions` | List of biblatex options |
| `natbiboptions` | List of natbib options |
| `biblio-title` | Custom bibliography section title |
| `biblio-style` | Bibliography formatting style |

### Typst

Typst uses native citation processing; supply `csl` (a CSL path or Typst built-in style). Override with `citeproc: true`.

---

## Cross-References

Source: `quarto.org/docs/authoring/cross-references.html`

A cross-referenceable element is given a label `#PREFIX-identifier` and referenced with `@PREFIX-identifier`.

### Label prefixes

| Category | Prefix | Element |
|----------|--------|---------|
| Floats | `fig-` | Figures |
| | `tbl-` | Tables |
| | `lst-` | Code listings |
| Blocks | `eq-` | Equations |
| | `sec-` | Sections |
| Theorems | `thm-` | Theorems |
| | `lem-` | Lemmas |
| | `cor-` | Corollaries |
| | `prp-` | Propositions |
| | `cnj-` | Conjectures |
| | `def-` | Definitions |
| | `exm-` | Examples |
| | `exr-` | Exercises |
| | `sol-` | Solutions |
| | `rem-` | Remarks |
| | `alg-` | Algorithms |
| Callouts | `tip-` | Tips |
| | `nte-` | Notes |
| | `wrn-` | Warnings |
| | `imp-` | Important |
| | `cau-` | Caution |

Constraints: labels must be lowercase; avoid underscores in labels for PDF/LaTeX.

### Reference syntax forms

| Markdown | Output |
|----------|--------|
| `@fig-elephant` | Figure 1 |
| `@Fig-elephant` | Figure 1 (capitalized prefix) |
| `[-@fig-elephant]` | 1 (no prefix) |
| `[Fig @fig-elephant]` | Fig 1 (custom prefix) |
| `[@fig-a; @fig-b; @fig-c]` | grouped references |

### Figures

```markdown
![Elephant](elephant.png){#fig-elephant}

See @fig-elephant.
```

Subfigures via layout:

```markdown
::: {#fig-elephants layout-ncol=2}
![Surus](surus.png){#fig-surus}

![Hanno](hanno.png){#fig-hanno}

Famous Elephants
:::
```

Computed (code cell):

```python
#| label: fig-plot
#| fig-cap: "Plot"
#| fig-subcap:
#|   - "Plot 1"
#|   - "Plot 2"
#| layout-ncol: 2
```

Subfigure refs auto-generate as `@fig-plots-1`, `@fig-plots-2`.

### Tables

```markdown
| Col1 | Col2 |
|------|------|
| A    | B    |

: My Caption {#tbl-letters}

See @tbl-letters.
```

Code-generated: `#| label: tbl-iris` + `#| tbl-cap` (+ `#| tbl-subcap` for subtables).

### Equations

```markdown
$$
y = mx + b
$$ {#eq-line}

See @eq-line.
```

### Sections

Requires `number-sections: true`.

```markdown
## Introduction {#sec-introduction}

See @sec-introduction.
```

### Code listings

```markdown
```{#lst-customers .sql lst-cap="Customers Query"}
SELECT * FROM Customers
```

See @lst-customers.
```

Executable: `#| lst-label: lst-import` + `#| lst-cap`.

### Theorems & proofs

```markdown
::: {#thm-line}
## Line
$$y = mx + b$$
:::

See @thm-line.
```

`.proof` divs are unnumbered and not cross-referenceable.

### Callouts

```markdown
::: {#tip-example .callout-tip}
## A Tip
...
:::

See @tip-example.
```

### Crossref YAML options

```yaml
crossref:
  lof-title: "List of Figures"
  lot-title: "List of Tables"
  lol-title: "List of Listings"
```

LaTeX lists: `\listoffigures`, `\listoftables`, `\listoflistings`. Prefix/title text and custom kinds are configured via the cross-reference options guide.

---

## Cross-Reference Divs

Source: `quarto.org/docs/authoring/cross-references-divs.html`

General fenced-div syntax for floats; the **last paragraph inside the div is the caption**. ID must start with `fig-`, `tbl-`, or `lst-`.

```markdown
::: {#fig-elephant}
![](elephant.png)

An Elephant
:::
```

Code cell as figure content:

```markdown
::: {#fig-line-plot}
```{python}
import matplotlib.pyplot as plt
plt.plot([1,23,2,4])
plt.show()
```
A line plot
:::
```

Table div:

```markdown
::: {#tbl-letters}
| Col1 | Col2 |
|------|------|
| A    | B    |

My Caption
:::
```

Listing div (code lifted inline when output produced):

```markdown
::: {#lst-customers}
```{.sql}
SELECT * FROM Customers
```
Customers Query
:::
```

Subreferences (nested divs, note `::::` outer fence):

```markdown
:::: {#fig-subrefs}
::: {#fig-first}
CONTENT 1

First caption
:::

::: {#fig-second}
CONTENT 2

Second caption
:::

Main caption
::::
```

Reference parent `@fig-subrefs` and children `@fig-first`, `@fig-second`. Supports `layout="[[1,1],[1]]"`, `{{< video URL >}}`, and inline computed captions `` `{python} len(x)` ``.

---

## Front Matter

Source: `quarto.org/docs/authoring/front-matter.html`

### Document-level keys

| Key | Type | Description |
|-----|------|-------------|
| `title` | string | Document title |
| `subtitle` | string | Subtitle |
| `author` | string / array of objects | Author(s) |
| `affiliations` | array of objects | Top-level affiliation list |
| `date` | date / `today` / `now` / `last-modified` | Publication date |
| `date-modified` | date | Last-modified date |
| `date-format` | string | e.g. `short`, `YYYY-MM-DD` |
| `abstract` | string (block) | Abstract |
| `abstract-title` | string | Custom abstract heading |
| `keywords` | array | Keyword list |
| `doi` | string | Document DOI |
| `license` | string / object | License |
| `copyright` | string / object | Copyright |
| `funding` | string / object | Funding |
| `citation` | object | Citeable-article metadata |

Both singular (`author`, `affiliation`) and plural (`authors`, `affiliations`) forms are accepted.

### Author object

```yaml
author:
  - name: "Given Family"        # or {given, family, dropping-particle, non-dropping-particle}
    id: author-id
    orcid: "0000-0000-0000-0000"
    email: "a@example.com"
    phone: "+1-555-0000"
    url: "https://example.com"
    degrees: ["B.S.", "PhD"]
    note: "Contribution details"
    acknowledgements: "..."
    roles: ["conceptualization", "investigation"]   # or free-form string
    corresponding: true
    equal-contributor: true
    deceased: false
    affiliations: [ ... ]        # or affiliation:
```

### Affiliation object

```yaml
affiliations:
  - id: aff1
    ref: existing-id
    name: "Institution"
    department: "Department"
    group: "Research Group"
    address: "Street"
    city: "City"
    region: "Region"            # or state:
    country: "Country"
    postal-code: "12345"
    url: "https://institution.edu"
    isni: 0000000419369094
    ringgold: 6752
    ror: "https://ror.org/0000000000"
```

Shared affiliations: define `affiliations: [{id: aff1, ...}]` at top level and reference via `affiliation: [{ref: aff1}]` (or inline IDs).

### CRediT roles

| Role | Alias |
|------|-------|
| conceptualization | — |
| data curation | — |
| formal analysis | analysis |
| funding acquisition | funding |
| investigation | — |
| methodology | — |
| project administration | — |
| resources | — |
| software | — |
| supervision | — |
| validation | — |
| visualization | — |
| writing – review & editing | editing |
| writing – original draft | writing |

Roles accept string, array, or object with contribution level (`{investigation: lead}`).

### License / copyright / funding objects

```yaml
license:
  text: "Full license text"
  type: "open-access"
  url: "https://license-url.org"
copyright:
  statement: "Full statement"
  holder: "Holder"
  year: 2024                    # or "2021-2023" or [2021, 2022, 2023]
funding:
  statement: "..."
  awards:
    - source: "Funder"
      recipient: {ref: author-id}
      investigator: "Name"
  open-access: true
```

Creative Commons shorthand for `license`: `CC BY`, `CC BY-SA`, `CC BY-ND`, `CC BY-NC`, `CC BY-NC-SA`, `CC BY-NC-ND`, `CC0`.

### Citation object (citeable articles)

```yaml
citation:
  type: article-journal        # CSL type: article-journal, paper-conference, book...
  container-title: "Journal Name"
  volume: 1
  issue: 1
  page: "1-10"
  doi: "10.5555/12345678"
  url: https://example.com/article
  issued: 2024-01-15
  pdf-url: https://example.com/article.pdf
google-scholar: true
```

---

## Title Blocks

Source: `quarto.org/docs/authoring/title-blocks.html`

Auto-formats title, subtitle, authors, date, doi, abstract at document start.

### `title-block-style`

| Value | Behavior |
|-------|----------|
| `default` | Smaller font, elements grouped (styled) |
| `plain` | Organized but no default styling |
| `none` | No processing; Pandoc emits verbatim |

### Banner keys

| Key | Value | Description |
|-----|-------|-------------|
| `title-block-banner` | `true` / color / image path | Enable banner; background color (`"#FFDDFF"`) or image (`images/banner.jpeg`) |
| `title-block-banner-color` | CSS color | Banner text color |
| `title-block-categories` | boolean | Show/hide categories in banner |
| `categories` | array | Category tags displayed in banner |

When an explicit background is given, Quarto auto-uses the body background color as text color for contrast.

### Date keywords & format

`today` (date, time 0), `now` (date + time), `last-modified` (file mtime). `date-format` accepts e.g. `short`; under `default`/`plain` styles dates format per `lang` locale.

### Metadata label customization

| Option | Default label | Styles |
|--------|---------------|--------|
| `author-title` | Authors | plain, default |
| `affiliation-title` | Affiliations | plain, default |
| `abstract-title` | Abstract | plain, default, none |
| `description-title` | Description | plain, default |
| `published-title` | Date Published | plain, default |
| `doi-title` | DOI | plain, default |

---

## Appendices

Source: `quarto.org/docs/authoring/appendices.html`

Quarto auto-generates an appendix at the end of HTML articles, gathering citations, footnotes, and attribution.

### Custom appendix sections

Add `.appendix` to any heading; custom sections appear at the front of the appendix in document order.

```markdown
## Acknowledgments {.appendix}

I am grateful for the comments offered by the reviewers...
```

### Auto-generated sections

| Section | Trigger |
|---------|---------|
| Custom sections | Headings with `.appendix` |
| References | Citations present |
| Footnotes | Footnote markers present |
| Reuse | `license` in front matter |
| Citation | Citeable-article metadata present |

### `appendix-style`

| Value | Behavior |
|-------|----------|
| `default` | Smaller font, sections gathered into stylized groups |
| `plain` | Processing on, styling off |
| `none` | Disable all appendix processing |

### `appendix-cite-as`

Controls the "Cite this" rendering in the Citation appendix:

| Value | Behavior |
|-------|----------|
| `bibtex` | BibTeX format only |
| `display` | Formatted citation only |
| `false` | No citation shown |
