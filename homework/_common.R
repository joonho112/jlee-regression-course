# _common.R -- BER 640 Homework Solutions shared configuration
# Called via source() from every chapter

# --- Package loading ---
options(repos = c(CRAN = "https://cloud.r-project.org"))

if (!requireNamespace("pacman", quietly = TRUE)) {
  install.packages("pacman")
}

if (!requireNamespace("remotes", quietly = TRUE)) {
  install.packages("remotes")
}

regdatasets_ref <- "de3e3bc40038b6d9ecc2dc46017fcc39f2df81a0"

regdatasets_installed <- requireNamespace("regdatasets", quietly = TRUE)
regdatasets_sha <- if (regdatasets_installed) {
  packageDescription("regdatasets")[["RemoteSha"]]
} else {
  NA_character_
}

if (
  !regdatasets_installed ||
    is.na(regdatasets_sha) ||
    !identical(tolower(regdatasets_sha), tolower(regdatasets_ref))
) {
  remotes::install_github(
    "joonho112/regdatasets",
    ref = regdatasets_ref,
    upgrade = "never"
  )
}

course_packages <- c(
  "regdatasets",

  # Rendering
  "knitr",

  # Data wrangling
  "dplyr", "tidyr", "tibble",

  # Visualization
  "ggplot2", "scales",

  # Model extraction and ANOVA
  "broom", "car",

  # Easystats coefficient summaries
  "parameters",

  # Post-estimation and tables
  "emmeans", "gtsummary", "gt", "modelsummary"
)

pacman::p_load(char = course_packages)

# --- ggplot2 global theme ---
theme_set(
  theme_minimal(base_size = 14) +
    theme(
      plot.title = element_text(face = "bold", size = 16),
      plot.subtitle = element_text(color = "grey40"),
      axis.title = element_text(face = "bold"),
      legend.position = "bottom",
      panel.grid.minor = element_blank(),
      plot.background = element_rect(fill = "white", color = NA),
      panel.background = element_rect(fill = "white", color = NA),
      legend.background = element_rect(fill = "white", color = NA)
    )
)

# --- Color palette: "Cividis Ink" (course brand) ---
# Values migrated to the Cividis Ink palette; the KEY names are unchanged so every
# chapter that references ber640_colors / ber640_palette / ber640_fill keeps working
# with zero edits (Decision 4: migrate values only, names stable).
ber640_colors <- c(
  primary   = "#0B3D66",  # navy
  secondary = "#A8431E",  # rust
  accent    = "#2C6E91",  # slate
  success   = "#3E8E8A",  # teal
  warning   = "#C9A227",  # gold
  info      = "#6B3E7A"   # plum
)

ber640_palette <- scale_color_manual(values = unname(ber640_colors[1:4]))
ber640_fill    <- scale_fill_manual(values = unname(ber640_colors[1:4]))

# --- Helper functions ---
round_numeric <- function(x, digits = 4) {
  dplyr::mutate(
    x,
    dplyr::across(dplyr::where(is.numeric), \(col) round(col, digits))
  )
}

format_p <- function(p) {
  dplyr::if_else(
    is.na(p),
    NA_character_,
    dplyr::if_else(p < .001, "< .001", sprintf("%.3f", p))
  )
}

model_params <- function(model, exponentiate = FALSE, ...) {
  parameters::model_parameters(model, exponentiate = exponentiate, ...)
}

model_glance <- function(model) {
  broom::glance(model) |>
    dplyr::transmute(
      n = nobs(model),
      df_model = df,
      df_error = df.residual,
      F = statistic,
      p = format_p(p.value),
      r_squared = r.squared,
      adj_r_squared = adj.r.squared,
      root_mse = sigma
    )
}
