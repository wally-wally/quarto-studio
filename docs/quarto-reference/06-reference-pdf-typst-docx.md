# Quarto Format Option Reference: PDF, Typst, Word

> Exhaustive per-format YAML option reference for building a Quarto editor. Source: official Quarto reference pages — [pdf.html](https://quarto.org/docs/reference/formats/pdf.html), [typst.html](https://quarto.org/docs/reference/formats/typst.html), [docx.html](https://quarto.org/docs/reference/formats/docx.html).

## PDF

### Title & Author

| Option | Description |
| --- | --- |
| `title` | Document title |
| `subtitle` | Identifies the subtitle of the document |
| `date` | Document date |
| `date-format` | Date format for the document |
| `author` | Author or authors of the document |
| `abstract` | Summary of document |
| `thanks` | Contents of an acknowledgments footnote after the document title |
| `order` | Order for document when included in a website automatic sidebar menu |

### Format Options

| Option | Description |
| --- | --- |
| `brand` | Branding information to use for this document |
| `pdf-engine` | Engine to use when producing PDF output |
| `pdf-engine-opt` | Command-line argument to pass to the pdf-engine |
| `pdf-engine-opts` | Array of command-line arguments for the pdf-engine |
| `beamerarticle` | Whether to produce a Beamer article from this presentation |
| `quarto-required` | Semver version range describing supported quarto versions |

### Table of Contents

| Option | Description |
| --- | --- |
| `toc` | Include an automatically generated table of contents |
| `toc-depth` | Number of section levels to include in table of contents |
| `toc-title` | Title used for the table of contents |
| `lof` | Print a list of figures in the document |
| `lot` | Print a list of tables in the document |

### Numbering

| Option | Description |
| --- | --- |
| `number-sections` | Number section headings in rendered output |
| `number-depth` | Customize numbering depth for sections |
| `shift-heading-level-by` | Shift heading levels by positive or negative integer |
| `top-level-division` | Treat top-level headings as given division type |

### Fonts

| Option | Description |
| --- | --- |
| `mainfont` | Main font family for document text |
| `monofont` | Monospace font family for code |
| `fontsize` | Font size for document body text |
| `fontenc` | Font encoding specification |
| `fontfamily` | Font package to use with pdflatex engine |
| `fontfamilyoptions` | Options for the font package |
| `sansfont` | Sans serif font family |
| `mathfont` | Math font family for formulas |
| `CJKmainfont` | CJK main font family |
| `mainfontoptions` | Main font options for xelatex or lualatex |
| `sansfontoptions` | Sans serif font options |
| `monofontoptions` | Monospace font options |
| `mathfontoptions` | Math font options |
| `CJKoptions` | CJK font options |
| `microtypeoptions` | Options to pass to the microtype package |
| `linestretch` | Line spacing adjustment |

### Colors

| Option | Description |
| --- | --- |
| `linkcolor` | Color used for internal links |
| `filecolor` | Color used for external links |
| `citecolor` | Color used for citation links |
| `urlcolor` | Color used for linked URLs |
| `toccolor` | Color used for links in table of contents |
| `colorlinks` | Add color to link text |

### Layout

| Option | Description |
| --- | --- |
| `cap-location` | Where to place figure and table captions |
| `fig-cap-location` | Where to place figure captions |
| `tbl-cap-location` | Where to place table captions |
| `documentclass` | The document class |
| `classoption` | Options set for the document class |
| `pagestyle` | Control the pagestyle for the document |
| `papersize` | The paper size for the document |
| `margin-left` | Left margin setting |
| `margin-right` | Right margin setting |
| `margin-top` | Top margin setting |
| `margin-bottom` | Bottom margin setting |
| `geometry` | Options for the geometry package |
| `hyperrefoptions` | Options for the hyperref package |
| `indent` | Whether to use document class settings for indentation |
| `block-headings` | Make paragraph and subparagraph free-standing |

### Code

| Option | Description |
| --- | --- |
| `code-line-numbers` | Include line numbers in code block output |
| `code-annotations` | Style to use when displaying code annotations |
| `code-block-border-left` | Apply left border on code blocks |
| `code-block-bg` | Apply background color on code blocks |
| `syntax-highlighting` | Coloring style for highlighted source code |
| `syntax-definitions` | KDE language syntax definition files |
| `listings` | Use the listings package for LaTeX code blocks |
| `indented-code-classes` | Classes to use for all indented code blocks |

### Execution

| Option | Description |
| --- | --- |
| `eval` | Evaluate code cells |
| `echo` | Include cell source code in rendered output |
| `output` | Include results of executing the code in output |
| `warning` | Include warnings in rendered output |
| `error` | Include errors in the output |
| `include` | Prevent any output from being included |
| `cache` | Cache results of computations |
| `freeze` | Control re-use of previous computational output |

### Figures

| Option | Description |
| --- | --- |
| `fig-align` | Figure horizontal alignment |
| `fig-env` | LaTeX environment for figure output |
| `fig-pos` | LaTeX figure position arrangement |
| `fig-cap-location` | Where to place figure captions |
| `fig-width` | Default width for generated figures |
| `fig-height` | Default height for generated figures |
| `fig-format` | Default format for generated figures |
| `fig-dpi` | Default DPI for generated figures |
| `fig-asp` | Aspect ratio of the plot |

### Tables

| Option | Description |
| --- | --- |
| `tbl-colwidths` | Apply explicit table column widths |
| `tbl-cap-location` | Where to place table captions |
| `df-print` | Method used to print tables in Knitr documents |

### References

| Option | Description |
| --- | --- |
| `bibliography` | Document bibliography file or files |
| `csl` | Citation Style Language file for formatting |
| `cite-method` | Method used to format citations |
| `citeproc` | Turn on built-in citation processing |
| `biblatexoptions` | List of options for BibLaTeX |
| `natbiboptions` | Options to provide for natbib |
| `biblio-style` | Bibliography style to use |
| `biblio-title` | Bibliography title to use |
| `biblio-config` | Controls bibliography configuration output |
| `citation-abbreviations` | JSON file with journal abbreviations |
| `link-citations` | Make citations hyperlinked to bibliography entries |
| `link-bibliography` | Render DOIs, URLs in bibliographies as hyperlinks |
| `notes-after-punctuation` | Put footnote references after punctuation |

### Footnotes

| Option | Description |
| --- | --- |
| `links-as-notes` | Causes links to be printed as footnotes |
| `reference-location` | Specify location for footnotes and references |

### Cross-References

| Option | Description |
| --- | --- |
| `crossref` | Configuration for cross-reference labels and prefixes |

### Citation

| Option | Description |
| --- | --- |
| `citation` | Citation information for the document itself |

### Language

| Option | Description |
| --- | --- |
| `lang` | Main language of document using IETF language tags |
| `language` | YAML file containing custom language translations |
| `shorthands` | Enable babel language-specific shorthands |
| `dir` | Base script direction for the document |

### Includes

| Option | Description |
| --- | --- |
| `include-before-body` | Include contents at beginning of document body |
| `include-after-body` | Include content at end of document body |
| `include-in-header` | Include contents at end of header |
| `metadata-files` | Read metadata from supplied YAML or JSON files |

### Metadata

| Option | Description |
| --- | --- |
| `keywords` | List of keywords to include in document metadata |
| `subject` | The document subject |
| `title-meta` | Sets the title metadata for the document |
| `author-meta` | Sets the author metadata for the document |
| `date-meta` | Sets the date metadata for the document |

### Rendering

| Option | Description |
| --- | --- |
| `from` | Format to read from |
| `output-file` | Output file to write to |
| `output-ext` | Extension to use for generated output file |
| `template` | Custom template file for generated document |
| `template-partials` | Files as partials accessible to template |
| `filters` | Executables or Lua scripts as pandoc AST filters |
| `shortcodes` | Lua scripts implementing shortcode handlers |
| `keep-md` | Keep the markdown file generated by executing code |
| `keep-ipynb` | Keep the notebook file generated from executing code |
| `ipynb-filters` | Filters to pre-process ipynb files |
| `ipynb-shell-interactivity` | Nodes to run interactively |
| `plotly-connected` | Use notebook_connected plotly renderer |
| `keep-tex` | Keep the intermediate tex file during render |
| `extract-media` | Extract images and media to specified path |
| `resource-path` | List of paths to search for images and resources |
| `default-image-extension` | Default extension for image paths without one |
| `abbreviations` | Custom abbreviations file |
| `dpi` | Default DPI value for pixel conversion |
| `html-table-processing` | Process tables in HTML input |
| `use-rsvg-convert` | Attempt to use rsvg-convert for SVG conversion |

### Latexmk

| Option | Description |
| --- | --- |
| `latex-auto-mk` | Use Quarto's built-in PDF rendering wrapper |
| `latex-auto-install` | Enable/disable automatic LaTeX package installation |
| `latex-min-runs` | Minimum number of compilation passes |
| `latex-max-runs` | Maximum number of compilation passes |
| `latex-clean` | Clean intermediates after compilation |
| `latex-makeindex` | Program to use for makeindex |
| `latex-makeindex-opts` | Command line options for makeindex |
| `latex-tlmgr-opts` | Command line options for tlmgr |
| `latex-output-dir` | Output directory for intermediates and PDF |
| `latex-tinytex` | Prevent TinyTex installation use |
| `latex-input-paths` | Array of paths LaTeX should search |

### PDF/A

| Option | Description |
| --- | --- |
| `pdf-standard` | PDF conformance standards and/or version for output |

### Text Output

| Option | Description |
| --- | --- |
| `ascii` | Use only ASCII characters in output |

## Typst

### Title & Author

| Option | Description |
| --- | --- |
| `title` | Document title |
| `date` | Document date |
| `date-format` | Date format for the document |
| `author` | Author or authors of the document |
| `abstract-title` | Title used to label document abstract |
| `thanks` | Contents of an acknowledgments footnote after the document title |
| `order` | Order for document when included in a website automatic sidebar menu |

### Typst

| Option | Description |
| --- | --- |
| `logo` | The logo image |
| `margin-geometry` | Fine-grained control over marginalia package geometry |
| `theorem-appearance` | Controls how theorems, lemmas, definitions are rendered |

### Format Options

| Option | Description |
| --- | --- |
| `brand` | Branding information to use for this document |
| `quarto-required` | Semver version range describing supported quarto versions |

### Table of Contents

| Option | Description |
| --- | --- |
| `toc` | Include an automatically generated table of contents |
| `toc-indent` | Amount of indentation for each level of the table of contents |
| `toc-depth` | Number of section levels to include in the table of contents |
| `lof` | Print a list of figures in the document |
| `lot` | Print a list of tables in the document |

### Numbering

| Option | Description |
| --- | --- |
| `number-sections` | Number section headings in rendered output |
| `section-numbering` | Schema to use for numbering sections |
| `shift-heading-level-by` | Shift heading levels by a positive or negative integer |
| `page-numbering` | Schema to use for numbering pages |

### Slide Layout

| Option | Description |
| --- | --- |
| `margin` | Factor of display size that should remain empty around content |

### Fonts

| Option | Description |
| --- | --- |
| `mainfont` | Main font family for the document |
| `codefont` | Font used for displaying code in Typst output |
| `fontsize` | Base font size for the document body text |
| `mathfont` | Font used for mathematical content |
| `font-paths` | Directories to scan for custom fonts |
| `linestretch` | Adjust line spacing between text |

### Colors

| Option | Description |
| --- | --- |
| `linkcolor` | Color used for internal links |
| `filecolor` | Color used for external links |
| `citecolor` | Color used for citation links |

### Layout

| Option | Description |
| --- | --- |
| `cap-location` | Where to place figure and table captions |
| `fig-cap-location` | Where to place figure captions |
| `tbl-cap-location` | Where to place table captions |
| `papersize` | The paper size for the document |
| `brand-mode` | Brand mode for rendering (light or dark) |
| `grid` | Properties of the grid system used to layout pages |
| `margin` | Page margins specified as a dictionary or individual sides |

### Code

| Option | Description |
| --- | --- |
| `code-annotations` | Style to use when displaying code annotations |
| `syntax-highlighting` | Coloring style for highlighted source code |

### Execution

| Option | Description |
| --- | --- |
| `eval` | Evaluate code cells |
| `echo` | Include cell source code in rendered output |
| `output` | Include results of executing code in output |
| `warning` | Include warnings in rendered output |
| `error` | Include errors in output |
| `include` | Prevent any output from being included |
| `cache` | Cache results of computations |
| `freeze` | Control re-use of previous computational output |

### Figures

| Option | Description |
| --- | --- |
| `fig-cap-location` | Where to place figure captions |
| `fig-width` | Default width for generated figures |
| `fig-height` | Default height for generated figures |
| `fig-format` | Default format for generated figures |
| `fig-dpi` | Default DPI for generated figures |
| `fig-asp` | Aspect ratio of the plot (height/width ratio) |

### Tables

| Option | Description |
| --- | --- |
| `tbl-cap-location` | Where to place table captions |
| `df-print` | Method used to print tables in Knitr engine documents |

### References

| Option | Description |
| --- | --- |
| `bibliography` | Document bibliography (BibTeX or CSL) |
| `csl` | Citation Style Language file for formatting references |
| `citation-location` | Where citation information should be displayed |
| `citeproc` | Turn on built-in citation processing |
| `bibliographystyle` | Bibliography style to use with Typst citation system |
| `citation-abbreviations` | JSON file containing journal abbreviations |

### Footnotes

| Option | Description |
| --- | --- |
| `reference-location` | Specify location for footnotes |

### Cross-References

| Option | Description |
| --- | --- |
| `crossref` | Configuration for cross-reference labels and prefixes |

### Citation

| Option | Description |
| --- | --- |
| `citation` | Citation information for the document itself specified as CSL YAML |

### Language

| Option | Description |
| --- | --- |
| `lang` | Main language of the document using IETF language tags |
| `language` | YAML file containing custom language translations |
| `dir` | Base script direction for the document (rtl or ltr) |

### Includes

| Option | Description |
| --- | --- |
| `include-before-body` | Include contents at the beginning of document body |
| `include-after-body` | Include content at end of document body |
| `include-in-header` | Include contents at end of the header |
| `metadata-files` | Read metadata from supplied YAML or JSON files |

### Rendering

| Option | Description |
| --- | --- |
| `from` | Format to read from |
| `output-file` | Output file to write to |
| `output-ext` | Extension to use for generated output file |
| `template` | Custom template file for generated document |
| `template-partials` | Files as partials accessible to the template |
| `filters` | Executables or Lua scripts for transforming pandoc AST |
| `shortcodes` | Lua scripts that implement shortcode handlers |
| `keep-md` | Keep the markdown file generated by executing code |
| `keep-ipynb` | Keep the notebook file generated from executing code |
| `ipynb-filters` | Filters to pre-process ipynb files before rendering |
| `ipynb-shell-interactivity` | Specify which nodes should run interactively |
| `plotly-connected` | Use notebook-connected plotly renderer with CDN |
| `keep-typ` | Keep the intermediate typst file used during render |
| `extract-media` | Extract images and media to specified path |
| `resource-path` | List of paths to search for images and resources |
| `default-image-extension` | Default extension for image paths with no extension |
| `abbreviations` | Custom abbreviations file for Markdown input |
| `dpi` | Default dpi value for conversion from pixels |
| `html-table-processing` | Process tables in HTML input |
| `html-pre-tag-processing` | Ignore divs with html-pre-tag-processing enabled |
| `css-property-processing` | Translate CSS properties to output format |

### PDF/A

| Option | Description |
| --- | --- |
| `pdf-standard` | PDF conformance standards and/or version for output |

### Text Output

| Option | Description |
| --- | --- |
| `wrap` | Determine how text is wrapped in output |
| `columns` | Specify length of lines in characters |
| `tab-stop` | Specify number of spaces per tab |
| `preserve-tabs` | Preserve tabs within code instead of converting to spaces |
| `eol` | Manually specify line endings |

## Word

### Title & Author

| Option | Description |
| --- | --- |
| `title` | Document title |
| `subtitle` | Identifies the subtitle of the document |
| `date` | Document date |
| `date-format` | Date format for the document |
| `author` | Author or authors of the document |
| `abstract` | Summary of document |
| `abstract-title` | Title used to label document abstract |
| `order` | Order for document when included in a website automatic sidebar menu |

### Format Options

| Option | Description |
| --- | --- |
| `reference-doc` | Use the specified file as a style reference in producing a docx, pptx, or odt file |
| `brand` | Branding information to use for this document |
| `quarto-required` | A semver version range describing the supported quarto versions for this document or project |

### Table of Contents

| Option | Description |
| --- | --- |
| `toc` | Include an automatically generated table of contents in the output document |
| `toc-depth` | Specify the number of section levels to include in the table of contents |
| `toc-title` | The title used for the table of contents |

### Numbering

| Option | Description |
| --- | --- |
| `number-sections` | Number section headings rendered output |
| `number-depth` | Customize numbering depth by specifying how many heading levels to number |
| `shift-heading-level-by` | Shift heading levels by a positive or negative integer |

### Layout

| Option | Description |
| --- | --- |
| `page-width` | Target body page width for output used to compute columns widths for layout divs |

### Code

| Option | Description |
| --- | --- |
| `code-annotations` | The style to use when displaying code annotations |
| `syntax-highlighting` | Specifies the coloring style to be used in highlighted source code |
| `syntax-definitions` | KDE language syntax definition files (XML) |
| `indented-code-classes` | Specify classes to use for all indented code blocks |

### Execution

| Option | Description |
| --- | --- |
| `eval` | Evaluate code cells or just echo the code into output |
| `echo` | Include cell source code in rendered output |
| `output` | Include the results of executing the code in the output |
| `warning` | Include warnings in rendered output |
| `error` | Include errors in the output |
| `include` | Catch all for preventing any output from being included in output |
| `cache` | Cache results of computations |
| `freeze` | Control the re-use of previous computational output when rendering |

### Figures

| Option | Description |
| --- | --- |
| `fig-align` | Figure horizontal alignment |
| `fig-width` | Default width for figures generated by Matplotlib or R graphics |
| `fig-height` | Default height for figures generated by Matplotlib or R graphics |
| `fig-format` | Default format for figures generated by Matplotlib or R graphics |
| `fig-dpi` | Default DPI for figures generated by Matplotlib or R graphics |
| `fig-asp` | The aspect ratio of the plot, i.e., the ratio of height/width |

### Tables

| Option | Description |
| --- | --- |
| `df-print` | Method used to print tables in Knitr engine documents |

### References

| Option | Description |
| --- | --- |
| `bibliography` | Document bibliography in BibTeX or CSL format |
| `csl` | Citation Style Language file to use for formatting references |
| `citeproc` | Turn on built-in citation processing |
| `citation-abbreviations` | JSON file containing abbreviations of journals for bibliographies |
| `link-citations` | If true, citations will be hyperlinked to corresponding bibliography entries |
| `link-bibliography` | If true, DOIs, PMCIDs, PMID, and URLs in bibliographies render as hyperlinks |
| `notes-after-punctuation` | If true, footnote references appear after following punctuation |

### Cross-References

| Option | Description |
| --- | --- |
| `crossref` | Configuration for cross-reference labels and prefixes |

### Citation

| Option | Description |
| --- | --- |
| `citation` | Citation information for the document itself specified as CSL YAML |

### Language

| Option | Description |
| --- | --- |
| `lang` | Identifies the main language of the document using IETF language tags |
| `language` | YAML file containing custom language translations |
| `dir` | The base script direction for the document (rtl or ltr) |

### Includes

| Option | Description |
| --- | --- |
| `metadata-files` | Read metadata from the supplied YAML or JSON files |

### Metadata

| Option | Description |
| --- | --- |
| `keywords` | List of keywords to be included in the document metadata |
| `subject` | The document subject |
| `description` | The document description |
| `category` | The document category |

### Rendering

| Option | Description |
| --- | --- |
| `from` | Format to read from |
| `output-file` | Output file to write to |
| `output-ext` | Extension to use for generated output file |
| `filters` | Specify executables or Lua scripts to transform the pandoc AST |
| `shortcodes` | Specify Lua scripts that implement shortcode handlers |
| `keep-md` | Keep the markdown file generated by executing code |
| `keep-ipynb` | Keep the notebook file generated from executing code |
| `ipynb-filters` | Filters to pre-process ipynb files before rendering to markdown |
| `ipynb-shell-interactivity` | Specify which nodes should be run interactively |
| `plotly-connected` | If true, use the notebook_connected plotly renderer |
| `extract-media` | Extract images and other media to the specified path |
| `resource-path` | List of paths to search for images and other resources |
| `default-image-extension` | Specify a default extension when image paths have no extension |
| `abbreviations` | Specifies a custom abbreviations file |
| `dpi` | Specify the default dpi value for conversion from pixels to inches |
| `html-table-processing` | If none, do not process tables in HTML input |
