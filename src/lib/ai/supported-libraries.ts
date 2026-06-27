// Quarto Studio 렌더 이미지가 제공하는 언어/라이브러리의 단일 출처.
// 출처: docker/render/requirements.in, install-r-packages.R, julia/Project.toml.
export const PYTHON_LIBRARIES = [
  "numpy",
  "pandas",
  "matplotlib",
  "altair",
  "vega_datasets",
  "plotly",
  "seaborn",
  "scikit-learn",
  "scipy",
  "statsmodels",
] as const;

export const R_LIBRARIES = [
  "knitr",
  "rmarkdown",
  "ggplot2",
  "dplyr",
  "tidyr",
  "readr",
  "showtext",
  "sysfonts",
] as const;

export const JULIA_LIBRARIES = ["Plots", "DataFrames"] as const;

export function formatSupportedLibraries(): string {
  return [
    `- Python: ${PYTHON_LIBRARIES.join(", ")}`,
    `- R: ${R_LIBRARIES.join(", ")}`,
    `- Julia: ${JULIA_LIBRARIES.join(", ")}`,
  ].join("\n");
}
