# Quarto Authoring / Markdown Syntax Reference

> Exhaustive syntax reference for the "Authoring / Markdown" domain, sourced from [quarto.org/docs/authoring](https://quarto.org/docs/authoring). Intended for developers building a Quarto editor.

---

## Markdown Basics

Source: [markdown-basics.html](https://quarto.org/docs/authoring/markdown-basics.html)

### Text Formatting

| Feature | Syntax | Example |
|---|---|---|
| Bold | `**text**` | `**bold**` |
| Italics | `*text*` or `_text_` | `*italics*` |
| Bold italics | `***text***` | `***both***` |
| Strikethrough | `~~text~~` | `~~struck~~` |
| Superscript | `^text^` | `2^10^` |
| Subscript | `~text~` | `H~2~O` |
| Inline code | `` `code` `` | `` `x + 1` `` |
| Small caps | `[text]{.smallcaps}` | `[Small]{.smallcaps}` |
| Underline | `[text]{.underline}` | `[Under]{.underline}` |
| Highlight / mark | `[text]{.mark}` | `[Mark]{.mark}` |

```markdown
**bold** *italics* ***both*** ~~strike~~ super^2^ sub~2~ `code`
[smallcaps]{.smallcaps} [underline]{.underline} [highlight]{.mark}
```

### Headings

All six ATX levels are supported. Headings accept an attribute block `{#id .class key="value"}`.

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

## Heading with custom id {#custom-id}
## Heading with classes {.unnumbered .unlisted}
```

| Attribute | Effect |
|---|---|
| `{#id}` | Custom anchor id (used for section links) |
| `.unnumbered` | Excludes heading from numbering |
| `.unlisted` | Excludes heading from TOC/listing |

### Links

| Type | Syntax |
|---|---|
| Autolink | `<https://quarto.org>` |
| Inline | `[text](https://quarto.org)` |
| With title | `[text](https://quarto.org "Title")` |
| Relative | `[text](./other.qmd)` |
| Section link | `[text](#section-id)` |
| Link with attributes | `[text](url){.class key="value"}` |

```markdown
<https://quarto.org>
[Quarto](https://quarto.org "Open source publishing")
[Section](#headings)
```

### Images

| Type | Syntax |
|---|---|
| Basic | `![Caption](image.png)` |
| With title | `![Caption](image.png "Title")` |
| With attributes | `![](image.png){width=300 fig-alt="Alt"}` |
| Linked image | `[![Caption](image.png)](https://quarto.org)` |

```markdown
![An elephant](elephant.png){width=80% fig-alt="A drawing of an elephant."}
```

### Lists

```markdown
* Unordered item
  + nested with +
    - nested with -

1. Ordered item
2. Second
   i) roman sub-item
      A. uppercase-alpha sub-sub-item

- [ ] Incomplete task
- [x] Completed task

term
: definition of the term

(@) Example list item with auto-numbering
(@) continues numbering even after interruptions
```

- A blank line is required above a list for it to render.
- Continuation paragraphs inside a list item must be indented 4 spaces.
- Ordered lists support `1.`, `i)`, `A.`, `(1)` style markers and custom start numbers.

### Footnotes

```markdown
Reference footnote.[^1]

[^1]: Footnote content.

Multi-paragraph footnote.[^longnote]

[^longnote]: First paragraph.

    Second paragraph (indented 4 spaces).

Inline footnote.^[Content placed directly inline.]
```

Footnote ids must be unique per document (and across chapters in books).

### Math / Equations

```markdown
Inline math: $E = mc^{2}$

Display math:

$$
E = mc^{2}
$$
```

Hidden TeX macro definitions (rendered nowhere but available document-wide):

```markdown
::: {.hidden}
$$
\def\RR{{\bf R}}
\def\bold#1{{\bf #1}}
$$
:::
```

### Block Quotes

```markdown
> Blockquote text.
> Second line.
```

### Line Blocks

Preserve spaces and line breaks (e.g. for verse/addresses):

```markdown
| Line 1, kept as-is
|   Indented line 2
|   Line 3
```

### Divs and Spans

Divs use fences of 3+ colons with an attribute block. Spans wrap inline text in `[...]` followed by an attribute block.

```markdown
::: {#id .class key="value"}
Block content.
:::

::::: {#special .sidebar}
::: {.warning}
Nested div content.
:::
:::::

[inline *content*]{.class key="val"}
```

Attribute order is strict: **id, then classes, then key-value pairs.**
`[text]{#id .class key="val"}` is valid; `[text]{.class key="val" #id}` is not.

### Raw Content

```markdown
```{=html}
<iframe src="url" width="500" height="400"></iframe>
```

```{=latex}
\renewcommand*{\labelitemi}{\textgreater}
```

```{=typst}
#set text(fill: red)
```

Inline raw: `<a>html</a>`{=html}
```

### Source Code Blocks

```markdown
```python
1 + 1
```

```{.python filename="run.py" code-line-numbers="1"}
print("hello")
```
```

(Full code-block options covered in the [Code Blocks & Annotation](#code-blocks--annotation) section.)

### Special Characters

| Character | Syntax |
|---|---|
| En dash (–) | `--` |
| Em dash (—) | `---` |
| Ellipsis (…) | `...` |
| Non-breaking space | `\ ` (backslash + space) or `&nbsp;` |

### Keyboard Shortcuts

```markdown
{{< kbd Ctrl-C >}}
{{< kbd mac=Shift-Command-O win=Shift-Control-O linux=Shift-Ctrl-L >}}
```

### Page Breaks

```markdown
page 1

{{< pagebreak >}}

page 2
```

Supported in HTML, LaTeX, Context, MS Word, Open Document, ePub, and Typst.

---

## Figures

Source: [figures.html](https://quarto.org/docs/authoring/figures.html)

### Basic Figure

```markdown
![Elephant](elephant.png)
```

Produces a centered, numbered (in PDF) figure with the caption as alt text.

### Figure Attributes

| Attribute | Values | Description |
|---|---|---|
| `width` | `300`, `80%`, `4in` | Display width; height auto-scales if omitted |
| `height` | `200`, `3in` | Display height |
| `fig-align` | `left`, `center` (default), `right` | Horizontal alignment |
| `fig-alt` | string | Accessibility alt text (independent of caption) |
| `fig-cap` | string | Caption (cell option for computed figures) |
| `.lightbox` | class | HTML click-to-zoom |
| `fig-env` | e.g. `figure*` | LaTeX figure environment |
| `fig-pos` | `h`, `t`, `b`, `H` | LaTeX float placement |
| `fig-scap` | string | Short caption for List of Figures |

```markdown
![Elephant](elephant.png "Title"){width=20% fig-align="left" fig-alt="A drawing."}
```

### Linked Figures

```markdown
[![Elephant](elephant.png)](https://en.wikipedia.org/wiki/Elephant)
```

### Multiformat Figures

Omit the extension to let Quarto pick per output format (HTML/EPUB/DOCX → `.png`, PDF → `.pdf`, Typst → `.svg`):

```markdown
![](elephant)
```

```yaml
format:
  html:
    default-image-extension: svg
```

### Cross-Referencing Figures

```markdown
![An Elephant](elephant.png){#fig-elephant}

See @fig-elephant.
```

The id must start with `fig-`. For computed figures, set the cell `label` to `fig-...`.

### Subfigures

```markdown
::: {#fig-elephants layout-ncol=2}

![Surus](surus.png){#fig-surus}

![Hanno](hanno.png){#fig-hanno}

Famous Elephants
:::
```

Empty lines between subfigures and before the main caption are required. Subfigures are auto-labeled (a), (b).

### Layout Attributes

| Attribute | Example | Description |
|---|---|---|
| `layout-ncol` | `layout-ncol=2` | N equal columns |
| `layout-nrow` | `layout-nrow=2` | N rows |
| `layout` | `layout="[[1,1],[1]]"` | 2D array of relative widths per row |
| `layout-valign` | `top`, `center`, `bottom` | Vertical alignment within a row |

```markdown
::: {layout="[[70,30], [100]]"}
![](surus.png)

![](hanno.png)

![](lin-wang.png)
:::
```

Negative numbers in `layout` create gaps: `layout="[[40,-20,40]]"`.

### Figure Divs (arbitrary content as a figure)

```markdown
::: {#fig-elephant}

<iframe width="560" height="315" src="https://www.youtube.com/embed/..."></iframe>

Elephant
:::
```

### Caption Location

```yaml
fig-cap-location: top   # top | bottom (default) | margin
```

### Computational Figures

```python
#| label: fig-charts
#| fig-cap: "Charts"
#| fig-subcap:
#|   - "First"
#|   - "Second"
#| layout-ncol: 2
```

---

## Tables

Source: [tables.html](https://quarto.org/docs/authoring/tables.html)

### Pipe Tables

```markdown
| Default | Left | Right | Center |
|---------|:-----|------:|:------:|
| 12      | 12   |    12 |   12   |

: Demonstration of pipe table syntax
```

- Leading/trailing pipes optional; inter-column pipes required.
- Header row is mandatory; cells cannot span lines or hold block content.

### Column Alignment

| Alignment | Separator |
|---|---|
| Default | `---` |
| Left | `:---` |
| Right | `---:` |
| Center | `:---:` |

### Captions and Cross-References

```markdown
| Col1 | Col2 |
|------|------|
| A    | B    |

: My Caption {#tbl-letters}

See @tbl-letters.
```

The label must begin with `tbl-`.

### Column Widths

```markdown
: Fruit prices {tbl-colwidths="[75,25]"}
```

```yaml
tbl-colwidths: [75,25]   # document level
```

Dash ratios in the separator row also set relative widths.

### Bootstrap Table Classes (HTML)

```markdown
: Fruit prices {.striped .hover}
```

Available: `primary`, `secondary`, `success`, `danger`, `warning`, `info`, `light`, `dark`, `striped`, `hover`, `active`, `bordered`, `borderless`, `sm`, `responsive`, `responsive-sm`/`-md`/`-lg`/`-xl`/`-xxl`.

### Grid Tables

Support block content (lists, paragraphs, code) inside cells.

```markdown
+-----------+-----------+--------------------+
| Fruit     | Price     | Advantages         |
+===========+===========+====================+
| Bananas   | $1.34     | - built-in wrapper |
|           |           | - bright color     |
+-----------+-----------+--------------------+

: Sample grid table.
```

Alignment via colons in the `===` row: `+========:+:=======+:======:+`.

### List Tables

```markdown
::: {#tbl-fruits .list-table aligns="l,r" tbl-colwidths="[75,25]"}
Fruit prices

- - Fruit
  - Price

- - Apple
  - 1.20
:::
```

| Attribute | Description |
|---|---|
| `header-rows` | Number of header rows (default 1) |
| `aligns` | Per-column alignment, e.g. `l,r,c` |
| `tbl-colwidths` | Column width array |

Cells support `[]{colspan=2}` and `[]{rowspan=2}`.

### Subtables / Table Layout

```markdown
::: {#tbl-panel layout-ncol=2}
| Col1 | Col2 |
|------|------|
| A    | B    |

: First Table {#tbl-first}

| Col1 | Col2 |
|------|------|
| A    | B    |

: Second Table {#tbl-second}

Main Caption
:::

See @tbl-panel, especially @tbl-second.
```

### Computational Tables

```r
#| label: tbl-cars
#| tbl-cap: "Cars"
#| tbl-colwidths: [60,40]
kable(head(cars))
```

Disable default striped styling with `#| classes: plain`.

### Caption Location

```yaml
tbl-cap-location: top   # top | bottom | margin
```

### Raw HTML Tables

Use `data-qmd` for embedded markdown; disable Quarto post-processing with `data-quarto-disable-processing="true"`.

```markdown
```{=html}
<table>
  <caption><span data-qmd="See [Section 1](#sec1)."></span></caption>
  <thead><tr><th>Header</th></tr></thead>
</table>
```
```

### Disabling Table Processing

```yaml
format:
  html:
    html-table-processing: none
```

Also available as a div attribute `{html-table-processing="none"}` or cell option `#| html-table-processing: none`.

---

## Diagrams

Source: [diagrams.html](https://quarto.org/docs/authoring/diagrams.html)

### Mermaid

Executable cell `{mermaid}`; options prefixed with `%%|`.

```markdown
```{mermaid}
%%| label: fig-flowchart
%%| fig-cap: "Example flowchart"
flowchart LR
  A[Hard edge] --> B(Round edge)
  B --> C{Decision}
  C --> D[Result one]
  C --> E[Result two]
```
```

Supports flowcharts, sequence diagrams, state diagrams, Gantt charts, etc.

### Graphviz / Dot

Executable cell `{dot}`; options prefixed with `//|`.

```markdown
```{dot}
//| label: fig-graph
//| fig-cap: "Simple graph"
graph G {
  A -- B;
  B -- C;
}
```
```

### Diagram Options

| Option | Mermaid prefix | Dot prefix | Description |
|---|---|---|---|
| `label` | `%%|` | `//|` | Cross-ref id (`fig-...`) |
| `fig-cap` | `%%|` | `//|` | Caption |
| `fig-width` / `fig-height` | both | both | Size in inches |
| `fig-responsive` | both | both | Responsive sizing (default true) |
| `echo` | both | both | Show diagram source |
| `file` | both | both | Include external `.mmd` / `.dot` file |

### Cross-Referencing via Div

```markdown
::: {#fig-simple}

```{dot}
graph { A -- B }
```

A simple graphviz graph
:::
```

### Mermaid Themes

```yaml
format:
  html:
    mermaid:
      theme: forest   # default | dark | forest | neutral
```

Custom theming via CSS variables (`--mermaid-node-bg-color`, `--mermaid-edge-color`, `--mermaid-fg-color`, etc.).

### Output Format

| Format | Rendering |
|---|---|
| HTML, Reveal.js | Native JS |
| gfm | Mermaid code block |
| PDF, DOCX, EPUB | PNG via Chrome (`quarto install chrome-headless-shell`) |

Override with `mermaid-format: js | png | svg`.

---

## Callouts

Source: [callouts.html](https://quarto.org/docs/authoring/callouts.html)

### Types

`note`, `tip`, `warning`, `important`, `caution`, used as the class `.callout-{type}`.

```markdown
::: {.callout-note}
Content goes here.
:::
```

### Title

Via a heading inside, or the `title` attribute:

```markdown
::: {.callout-tip}
## My Custom Title
Content.
:::

::: {.callout-tip title="My Custom Title"}
Content.
:::
```

### Attributes

| Attribute | Values | Description |
|---|---|---|
| `collapse` | `true` / `false` | Make collapsible (not in Reveal.js) |
| `appearance` | `default` / `simple` / `minimal` | Visual style |
| `icon` | `true` / `false` | Show/hide the type icon |
| `title` | string | Callout title |

```markdown
::: {.callout-caution collapse="true" appearance="simple" icon=false}
## Expand To Learn More
Hidden content.
:::
```

### Document-Level Defaults

```yaml
callout-appearance: simple
callout-icon: false
```

### Cross-Referencing

```markdown
::: {#tip-optimization .callout-tip}
## A Tip
Content.
:::

See @tip-optimization.
```

| Type | Id prefix |
|---|---|
| note | `#nte-` |
| tip | `#tip-` |
| warning | `#wrn-` |
| important | `#imp-` |
| caution | `#cau-` |

Reference labels localizable via `language: { crossref-tip-prefix: "Tip", ... }`.

---

## Code Blocks & Annotation

Sources: [code-annotation.html](https://quarto.org/docs/authoring/code-annotation.html), [html-code.html](https://quarto.org/docs/output-formats/html-code.html)

### Fenced Code Blocks

```markdown
```python
1 + 1
```

```{.python filename="run.py"}
print("hi")
```
```

### Display Options

| Feature | YAML key | Values | Per-block |
|---|---|---|---|
| Line numbers | `code-line-numbers` | `true`/`false` | `code-line-numbers="1,3-5"` (highlight ranges) |
| Folding | `code-fold` | `true`/`false`/`show` | `#| code-fold: true` |
| Fold summary | `code-summary` | string | `#| code-summary: "Show code"` |
| Overflow | `code-overflow` | `scroll`/`wrap` | `#| code-overflow: wrap` or class `.code-overflow-wrap` |
| Copy button | `code-copy` | `hover`(default)/`true`/`false` | — |
| Tools menu | `code-tools` | `true`/object | — |
| Background | `code-block-bg` | `true`/`false`/color | — |
| Left border | `code-block-border-left` | `true`/`false`/color | — |
| Filename | — | — | `filename="run.py"` |
| Highlight theme | `highlight-style` | theme name / light+dark | — |
| Code linking | `code-link` | `true`/`false` (Knitr only) | — |
| Show source | `echo` | `true`/`false` | `#| echo: true` |

```yaml
format:
  html:
    code-fold: true
    code-summary: "Show the code"
    code-tools:
      source: true
      toggle: false
      caption: none
    code-block-border-left: "#31BAE9"
```

Highlight themes include adaptive (`a11y`, `arrow`, `atom-one`, `ayu`, `breeze`, `github`, `gruvbox`) and Pandoc/extended themes (`pygments`, `tango`, `dracula`, `monokai`, `nord`, `solarized`, etc.). Light/dark pairs:

```yaml
highlight-style:
  light: custom-light.theme
  dark: custom-dark.theme
```

`code-line-numbers="1,3-5"` highlights lines 1 and 3–5. `code-link` cannot be combined with `code-line-numbers` or annotations.

### Code Annotations

Annotate lines with a language-comment marker `# <n>`, then an ordered list directly below the block.

```markdown
```r
penguins |>                                      # <1>
  mutate(                                        # <2>
    bill_ratio = bill_depth_mm / bill_length_mm  # <2>
  )                                              # <2>
```

1. Take `penguins`, and then,
2. add new columns for the bill ratio and bill area.
```

| `code-annotations` value | Behavior |
|---|---|
| `below` (default) | Text shown below the code block |
| `hover` | Text appears on hover over the marker |
| `select` | Text shown on click/select |
| `none` | Markers removed from output |
| `false` | Annotation processing disabled entirely |

```yaml
code-annotations: hover
```

HTML supports all interactive styles; PDF shows numbered annotations with text below; Word/gfm indicate line numbers as labels.

---

## Shortcodes

Source: [shortcodes.html](https://quarto.org/docs/authoring/shortcodes.html)

Syntax: `{{< name arg key="value" >}}` (positional and named arguments). Escape by wrapping in extra braces or code spans.

| Shortcode | Purpose | Example |
|---|---|---|
| `version` | Quarto CLI version | `{{< version >}}` |
| `meta` | Value from document metadata | `{{< meta title >}}` |
| `var` | Value from `_variables.yml` | `{{< var org-name >}}` |
| `env` | System environment variable | `{{< env HOME >}}` |
| `pagebreak` | Native page break | `{{< pagebreak >}}` |
| `kbd` | Keyboard shortcut | `{{< kbd Ctrl-C >}}` |
| `video` | Embed a video | `{{< video https://youtu.be/ID >}}` |
| `include` | Include another `.qmd` | `{{< include _part.qmd >}}` |
| `embed` | Embed Jupyter notebook cells | `{{< embed nb.ipynb#cell >}}` |
| `placeholder` | Placeholder image | `{{< placeholder 400 300 >}}` |
| `lipsum` | Placeholder text | `{{< lipsum 2 >}}` |
| `contents` | Rearrange document content | `{{< contents id >}}` |

```markdown
Title from metadata: {{< meta title >}}
Org name from variables: {{< var organization-name >}}
```

Custom shortcodes are created via Quarto extensions.

---

## Videos

Source: [videos.html](https://quarto.org/docs/authoring/videos.html)

### Shortcode

```markdown
{{< video https://www.youtube.com/embed/wo9vZccmqwc >}}
```

### Supported Sources

| Source | Examples |
|---|---|
| Local files | `local-video.mp4` |
| Remote files | `https://videos.example.com/video.mp4` |
| YouTube | `https://youtu.be/ID`, `.../watch?v=ID`, `.../embed/ID` |
| Vimeo | `https://vimeo.com/548291297` |
| Brightcove | Standard iframe embed URL |

### Attributes

| Attribute | Values | Description |
|---|---|---|
| `aspect-ratio` | `1x1`, `4x3`, `16x9`, `21x9` | Responsive ratio |
| `width` | px | Fixed width (disables responsiveness) |
| `height` | px | Fixed height (disables responsiveness) |
| `start` | seconds | YouTube start time |
| `title` | string | iframe title |
| `aria-label` | string | Accessibility label |

```markdown
{{< video https://youtu.be/wo9vZccmqwc aspect-ratio="21x9" start="10" title="CERN" >}}
```

### As a Cross-Referenced Figure

```markdown
::: {#fig-cern}

{{< video https://www.youtube.com/embed/wo9vZccmqwc >}}

The video "CERN: The Journey of Discovery"
:::

In @fig-cern...
```

### Reveal.js

```markdown
## Video Slide
{{< video https://youtu.be/wo9vZccmqwc width="100%" height="85%" >}}

## {background-video="intro.mp4"}
```

| Background attribute | Default | Description |
|---|---|---|
| `background-video` | — | Source or comma-separated list |
| `background-video-loop` | false | Loop playback |
| `background-video-muted` | false | Mute audio |
| `background-size` | cover | `cover` or `contain` |
| `background-opacity` | 1 | 0–1 opacity |

In non-HTML formats videos render as a plain link.

---

## Article Layout

Source: [article-layout.html](https://quarto.org/docs/authoring/article-layout.html)

### Column Model

| Category | Region |
|---|---|
| Body | Default content width |
| Page | Wider than body, within page margins |
| Screen | Full-width, edge to edge |
| Margin | Right margin area |

Applied as a div class `:::{.column-page}` or as a cell option `#| column: page`.

### Column Classes

| Class | Cell value | Description |
|---|---|---|
| `.column-body` | `body` | Default width |
| `.column-body-outset` | `body-outset` | Slight overhang past body |
| `.column-body-outset-left` / `-right` | `body-outset-left`/`-right` | Directional outset |
| `.column-page` | `page` | Page width (wide tables/images) |
| `.column-page-inset` | `page-inset` | Page width with margins kept |
| `.column-page-left` / `-right` | `page-left`/`-right` | Directional page width |
| `.column-page-inset-left` / `-right` | `page-inset-left`/`-right` | Directional inset page |
| `.column-screen` | `screen` | Full-bleed full width |
| `.column-screen-inset` | `screen-inset` | Full width, margins kept |
| `.column-screen-inset-shaded` | `screen-inset-shaded` | Full width with shaded background |
| `.column-screen-left` / `-right` | `screen-left`/`-right` | Directional full-bleed |
| `.column-screen-inset-left` / `-right` | `screen-inset-left`/`-right` | Directional inset screen |
| `.column-margin` | `margin` | Right margin |

```markdown
:::{.column-page}
![Wide image](image.png)
:::
```

```r
#| column: screen-inset-shaded
plot(cars)
```

### Margin Content

```markdown
:::{.column-margin}
A supplementary note in the margin, with math $x = y$.
:::
```

Selective placement of only figures or only tables:

```r
#| fig-column: margin
#| tbl-column: margin
```

### Margin References, Citations, Footnotes

```yaml
reference-location: margin     # document | section | block | margin
citation-location: margin      # document | margin
```

### Asides

```markdown
[Supplementary information shown in the margin without a footnote number.]{.aside}
```

### Caption Location

```yaml
cap-location: margin       # top | bottom | margin
fig-cap-location: margin
tbl-cap-location: margin
```

Also as cell options `#| fig-cap-location: margin`.

### Landscape

```markdown
:::{.landscape}
Content rotated to landscape (docx, pdf, typst).
:::
```

### PDF / Typst Geometry

```yaml
geometry:
  - left=0.75in
  - textwidth=4.5in
  - marginparsep=0.25in
  - marginparwidth=2.25in
```

```yaml
format:
  typst:
    grid:
      margin-width: 2in
      body-width: 4in
      gutter-width: 0.25in
```

- PDF: right-margin columns map to `page-right`; left-margin columns revert to body.
- KOMA classes (`scrartcl`, `scrreport`, `scrbook`) get auto-adjusted geometry.
