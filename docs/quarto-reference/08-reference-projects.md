# Quarto Project & Global Options Reference

> Source: [quarto.org/docs/reference/projects/options.html](https://quarto.org/docs/reference/projects/options.html). Compiled for the Quarto Studio editor. The dedicated `globals.html` reference page does not exist (returns 404); global/shared options live within the project, format, and document references.

These options are set in the project's `_quarto.yml` file (project-level configuration), typically under the top-level `project:` key and its sub-keys.

## Project Options (`_quarto.yml`)

### project

Top-level project configuration, set under the `project:` key.

| Option | Description |
| --- | --- |
| `title` | Project title. |
| `type` | Project type (`default`, `website`, `book`, or `manuscript`). |
| `render` | Files to render (defaults to all files in the project). |
| `execute-dir` | Working directory for computations: `file` (the input file's dir) or `project` (the project root). |
| `output-dir` | Output directory for rendered files. |
| `lib-dir` | HTML library (JS/CSS/etc.) directory. |
| `resources` | Additional file resources to be copied to the output directory. |
| `brand` | Path to `brand.yml`, or an object with `light` and `dark` paths to `brand.yml`. |
| `preview` | Options for `quarto preview` (see Preview below). |
| `pre-render` | Script(s) to run as a pre-render step. |
| `post-render` | Script(s) to run as a post-render step. |

### preview

Options controlling the `quarto preview` live-reload server, set under `project: preview:`.

| Option | Description |
| --- | --- |
| `port` | Port to listen on (defaults to a random value between 3000 and 8000). |
| `host` | Hostname to bind to (defaults to `127.0.0.1`). |
| `serve` | Options for an external preview server (see Serve below). |
| `browser` | Open a web browser to view the preview (defaults to `true`). |
| `watch-inputs` | Re-render input files when they change (defaults to `true`). |
| `navigate` | Navigate the browser automatically when outputs are updated (defaults to `true`). |
| `timeout` | Time (in seconds) after which to exit if there are no active clients. |

### serve

Options for delegating preview to an external server command, set under `project: preview: serve:`.

| Option | Description |
| --- | --- |
| `cmd` | Serve project preview using the specified command. Interpolate the port via `{port}` (e.g. `--port {port}`). |
| `args` | Additional command-line arguments for the preview command. |
| `env` | Environment variables to set for the preview command. |
| `ready` | Regular expression for detecting when the server is ready. |

## Project _quarto.yml skeleton

A representative annotated `_quarto.yml` showing the common project-level keys:

```yaml
project:
  title: "My Project"          # Project title
  type: website                # default | website | book | manuscript
  output-dir: _output          # Where rendered output is written
  lib-dir: site_libs           # HTML dependency (JS/CSS) directory
  execute-dir: project         # file | project (cwd for computations)

  render:                      # Files/globs to render (defaults to all)
    - "*.qmd"
    - "!drafts/"               # leading ! excludes

  resources:                   # Extra files copied verbatim to output
    - "data/*.csv"
    - "images/"

  brand: brand.yml             # or: { light: brand-light.yml, dark: brand-dark.yml }

  pre-render: scripts/pre.py   # Script(s) run before rendering
  post-render: scripts/post.sh # Script(s) run after rendering

  preview:                     # `quarto preview` server settings
    port: 4200                 # random 3000-8000 if omitted
    host: 127.0.0.1
    browser: true              # open browser on start
    watch-inputs: true         # re-render on input change
    navigate: true             # auto-navigate browser on update
    timeout: 0                 # seconds idle before exit (0 = never)
    serve:                     # delegate to an external server
      cmd: "npm run dev -- --port {port}"
      args: ["--quiet"]
      env:
        NODE_ENV: development
      ready: "Local:.*http"    # regex marking server readiness

# Shared/global format & execute defaults apply to every input in the project:
format:
  html:
    theme: cosmo
    toc: true

execute:
  freeze: auto                 # cache computational output
  echo: true
```

> Note: `format:`, `execute:`, `metadata:`, and other top-level keys placed in `_quarto.yml` act as project-wide (global) defaults that are merged into every document. See the format and execution references for the full set of those keys.
