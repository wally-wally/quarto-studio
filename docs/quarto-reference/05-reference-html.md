# Quarto HTML Format — YAML Option Reference

> Exhaustive reference of YAML options for the Quarto HTML output format, grouped by category, for use in building a Quarto editor.
> Sourced from <https://quarto.org/docs/reference/formats/html.html>.

## Title & Author

| Option | Description |
|--------|-------------|
| `title` | Document title. |
| `subtitle` | Identifies the subtitle of the document. |
| `date` | Document date. |
| `date-format` | Date format for the document (uses pandoc / `quarto` date format codes). |
| `date-modified` | Document date modified. |
| `author` | Author or authors of the document. |
| `abstract` | Summary of document. |
| `abstract-title` | Title used to label document abstract. |
| `doi` | Displays the document Digital Object Identifier in the header. |
| `order` | Order for document when included in a website automatic sidebar menu. |

## Format Options

| Option | Description |
|--------|-------------|
| `brand` | Branding information to use for this document (file path, boolean, or inline definition). |
| `theme` | Theme name, theme `.scss` file, or a mix of both. |
| `body-classes` | Classes to apply to the body of the document. |
| `minimal` | Disables built-in HTML features like theming and code block behavior. |
| `css` | One or more CSS style sheets. |
| `anchor-sections` | Enables hover over a section title to see an anchor link. |
| `tabsets` | Enables tabsets to present content. |
| `smooth-scroll` | Enables smooth scrolling within the page. |
| `respect-user-color-scheme` | Reads `prefers-color-scheme` media query for dark/light display. |
| `html-math-method` | Method used to render math in HTML output (`plain`, `webtex`, `gladtex`, `mathml`, `mathjax`, `katex`). |
| `section-divs` | Wrap sections in `<section>` tags and attach identifiers to the enclosing section. |
| `identifier-prefix` | Prefix added to all identifiers and internal links. |
| `email-obfuscation` | Method for obfuscating `mailto:` links (`javascript`, `references`, `none`). |
| `html-q-tags` | Use `<q>` tags for quotes in HTML. |
| `quarto-required` | Semver version range describing supported quarto versions. |

## Code

| Option | Description |
|--------|-------------|
| `code-fold` | Collapse code into an HTML `<details>` tag for on-demand display (`true`, `false`, `show`). |
| `code-summary` | Summary text for code blocks collapsed using `code-fold`. |
| `code-overflow` | How to handle code overflow (`scroll`, `wrap`). |
| `code-line-numbers` | Include line numbers in code block output. |
| `code-annotations` | Style for displaying code annotations (`below`, `hover`, `select`, `none`, `false`). |
| `code-tools` | Include a code tools menu for hiding/showing code. |
| `code-block-border-left` | Apply a left border on code blocks (hex color or boolean). |
| `code-block-bg` | Apply a background color on code blocks (hex color or boolean). |
| `syntax-highlighting` | Coloring style for highlighted source code (theme name or `.theme` file). |
| `syntax-definitions` | KDE language syntax definition files (XML) for highlighting. |
| `indented-code-classes` | Classes to use for all indented code blocks. |

## Code Copy

| Option | Description |
|--------|-------------|
| `code-copy` | Enable a code copy icon for code blocks (`true`, `false`, `hover`). |

## Code Link

| Option | Description |
|--------|-------------|
| `code-link` | Enable hyper-linking of functions within code blocks to their online documentation. |

## Table of Contents

| Option | Description |
|--------|-------------|
| `toc` | Include an automatically generated table of contents. |
| `toc-depth` | Number of section levels to include in the table of contents (default: 3). |
| `toc-location` | Location for the table of contents (`body`, `left`, `right`, `left-body`, `right-body`). |
| `toc-title` | The title used for the table of contents. |
| `toc-expand` | Depth of items displayed as expanded (`true`, `false`, or integer). |

## Numbering

| Option | Description |
|--------|-------------|
| `number-sections` | Number section headings in rendered output. |
| `number-depth` | Customize numbering depth by heading level. |
| `number-offset` | Offset for section headings in output. |
| `shift-heading-level-by` | Shift heading levels by a positive or negative integer. |

## Layout

| Option | Description |
|--------|-------------|
| `cap-location` | Where to place figure and table captions (`top`, `bottom`, `margin`). |
| `fig-cap-location` | Where to place figure captions (`top`, `bottom`, `margin`). |
| `tbl-cap-location` | Where to place table captions (`top`, `bottom`, `margin`). |
| `classoption` | Document class options for LaTeX/PDF output. |
| `page-layout` | Page layout (`article`, `full`, `custom`). |
| `grid` | Properties of the grid system used to layout Quarto HTML and Typst pages. |
| `appendix-style` | Layout of the appendix (`none`, `plain`, `default`). |
| `appendix-cite-as` | Controls formats provided in the citation section of the appendix. |
| `title-block-style` | Layout of the title block (`none`, `plain`, `default`). |
| `title-block-banner` | Applies banner style treatment for the title block. |
| `title-block-banner-color` | Sets the color of text elements in a banner style title block. |
| `title-block-categories` | Enables or disables display of categories in the title block. |
| `max-width` | Adds CSS `max-width` to the body element. |
| `margin-left` | Sets the `margin-left` property on the body element. |
| `margin-right` | Sets the `margin-right` property on the body element. |
| `margin-top` | Sets the `margin-top` property on the body element. |
| `margin-bottom` | Sets the `margin-bottom` property on the body element. |

## Page Footer

| Option | Description |
|--------|-------------|
| `page-footer` | Page footer content (website-level; configured under `website`/`book` project metadata). |

## Website

| Option | Description |
|--------|-------------|
| `search` | Prevent the document from being included in site searches. |
| `repo-actions` | Control appearance of repository actions on the page. |
| `aliases` | URLs that alias this document in a website. |
| `image` | Path to a preview image for this content. |
| `image-height` | Height of the preview image for this document. |
| `image-width` | Width of the preview image for this document. |
| `image-alt` | Alt text for the preview image on this page. |
| `image-lazy-loading` | Enable lazy loading for the preview image. |

## Format

| Option | Description |
|--------|-------------|
| `keep-hidden` | Keep hidden source code and output (marked with `.hidden`) in rendered output. |
| `prefer-html` | Generate HTML output (if necessary) even when targeting non-HTML formats. |

## Fonts

| Option | Description |
|--------|-------------|
| `mainfont` | Sets the CSS `font-family` property on the HTML element. |
| `monofont` | Sets the CSS `font-family` property on code elements. |
| `fontsize` | Sets the base CSS `font-size` property. |
| `linestretch` | Sets the CSS `line-height` property on the HTML element. |

## Colors

| Option | Description |
|--------|-------------|
| `fontcolor` | Sets the CSS `color` property. |
| `linkcolor` | Sets the CSS `color` property on all links. |
| `monobackgroundcolor` | Sets the CSS `background-color` property on code elements. |
| `backgroundcolor` | Sets the CSS `background-color` property on the HTML element. |

## Links

| Option | Description |
|--------|-------------|
| `link-external-icon` | Show a special icon next to external links. |
| `link-external-newwindow` | Open external links in a new browser window or tab. |
| `link-external-filter` | Regular expression to determine internal vs. external links. |
| `format-links` | Controls display of links to other rendered formats. |
| `notebook-links` | Controls display of links to source notebooks. |
| `other-links` | List of links displayed below the table of contents. |
| `code-links` | List of code-related links displayed below the table of contents. |
| `notebook-view` | Configures the HTML viewer for notebooks providing embedded content. |
| `notebook-preview-options` | Options for controlling notebook preview display and behavior. |
| `canonical-url` | Include a canonical link tag in website pages. |

## References

| Option | Description |
|--------|-------------|
| `bibliography` | Document bibliography in BibTeX or CSL format. |
| `csl` | Citation Style Language file for formatting references. |
| `citations-hover` | Enables a hover popup showing citation reference information. |
| `citation-location` | Display location for citation information (`document`, `margin`). |
| `citeproc` | Enables built-in citation processing. |

## Citation

| Option | Description |
|--------|-------------|
| `citation` | Citation information for the document itself, expressed as CSL YAML. |

## Footnotes

| Option | Description |
|--------|-------------|
| `footnotes-hover` | Enables a hover popup displaying footnote contents. |
| `reference-location` | Location for footnotes and references (`block`, `section`, `margin`, `document`). |

## Language

| Option | Description |
|--------|-------------|
| `lang` | Main document language using IETF language tags. |
| `language` | YAML file containing custom language translations. |
| `dir` | Base script direction for the document (`rtl`, `ltr`). |

## Includes

| Option | Description |
|--------|-------------|
| `include-before-body` | Content to include at the beginning of the document body. |
| `include-after-body` | Content to include at the end of the document body. |
| `include-in-header` | Contents to include at the end of the header (CSS, JavaScript). |
| `resources` | Path or glob to files published with the document. |
| `metadata-files` | Read metadata from the supplied YAML or JSON files. |

## Metadata

| Option | Description |
|--------|-------------|
| `keywords` | List of keywords in document metadata. |
| `copyright` | Copyright information for the document. |
| `license` | License for the document. |
| `pagetitle` | Sets the title metadata for the document. |
| `title-prefix` | Prefix at the beginning of the HTML header title. |
| `description-meta` | Sets the description metadata for the document. |
| `author-meta` | Sets the author metadata for the document. |
| `date-meta` | Sets the date metadata for the document. |

## Rendering

| Option | Description |
|--------|-------------|
| `from` | Format to read from, with optional extension modifications. |
| `output-file` | Output file to write to. |
| `output-ext` | Extension for the generated output file. |
| `template` | Custom template file for the generated document. |
| `template-partials` | Files accessible to the template as partials. |
| `embed-resources` | Produce standalone HTML with no external dependencies. |
| `self-contained-math` | Embeds math libraries within self-contained output. |
| `filters` | Executables or Lua scripts transforming the pandoc AST. |
| `shortcodes` | Lua scripts implementing shortcode handlers. |
| `keep-md` | Keep the markdown file generated by executing code. |
| `keep-ipynb` | Keep the notebook file generated from code execution. |
| `ipynb-filters` | Filters preprocessing ipynb files before rendering. |
| `ipynb-shell-interactivity` | Specifies which nodes run interactively. |
| `plotly-connected` | Uses the notebook-connected Plotly renderer with CDN. |
| `extract-media` | Extracts images and media to the specified path. |
| `resource-path` | List of paths to search for images and resources. |
| `default-image-extension` | Default extension for image paths without extensions. |
| `abbreviations` | Custom abbreviations file for Markdown input processing. |
| `dpi` | Default dots per inch for pixel conversion. |
| `html-table-processing` | Controls table processing in HTML input. |

## Execution

| Option | Description |
|--------|-------------|
| `eval` | Evaluate code cells (if `false`, just echoes the code into output). |
| `echo` | Include cell source code in rendered output (`true`, `false`, `fenced`). |
| `output` | Include the results of executing the code in the output (`true`, `false`, `asis`). |
| `warning` | Include warnings in rendered output. |
| `error` | Include errors in the output. |
| `include` | Catch-all to prevent any output (code or results) from being included. |
| `cache` | Cache results of computations. |
| `freeze` | Control re-use of previous computational output when rendering (`true`, `false`, `auto`). |

## Figures

| Option | Description |
|--------|-------------|
| `fig-align` | Figure horizontal alignment (`default`, `left`, `right`, `center`). |
| `fig-cap-location` | Where to place figure captions (`top`, `bottom`, `margin`). |
| `fig-width` | Default width for figures generated by Matplotlib or R graphics. |
| `fig-height` | Default height for figures generated by Matplotlib or R graphics. |
| `fig-format` | Default format for figures (`retina`, `png`, `jpeg`, `svg`, `pdf`). |
| `fig-dpi` | Default DPI for figures generated by Matplotlib or R graphics. |
| `fig-asp` | The aspect ratio of the plot. |
| `fig-responsive` | Whether to make images in this document responsive. |

## Lightbox Figures

| Option | Description |
|--------|-------------|
| `lightbox` | Enable or disable lightbox treatment for images in this document. |

## Tables

| Option | Description |
|--------|-------------|
| `tbl-colwidths` | Apply explicit table column widths for markdown grid tables. |
| `tbl-cap-location` | Where to place table captions (`top`, `bottom`, `margin`). |
| `df-print` | Method used to print tables in Knitr engine documents (`default`, `kable`, `tibble`, `paged`). |

## Text Output

| Option | Description |
|--------|-------------|
| `strip-comments` | Strip out HTML comments rather than passing them through to output. |
| `ascii` | Use only ASCII characters in output. |
