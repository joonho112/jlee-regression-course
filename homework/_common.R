# _common.R -- BER 640 Homework Solutions shared configuration
# Called via source() from every chapter

# --- Package loading ---
pacman::p_load(
  # Course data package (all 25 datasets)
  regdatasets,
  # Wrangling
  dplyr, tidyr, forcats, stringr, purrr,
  # Visualization
  ggplot2, patchwork, GGally, ggrepel,
  # Modeling
  broom, car, lmtest, sandwich,
  # easystats ecosystem
  parameters, performance, effectsize,
  see, modelbased, correlation, report,
  datawizard, insight,
  # Marginal effects & post-estimation (replaces Stata margins)
  marginaleffects,
  # Tables
  gtsummary, gt, knitr
)

# --- ggplot2 global theme ---
theme_set(
  theme_minimal(base_size = 14) +
    theme(
      plot.title = element_text(face = "bold", size = 16),
      plot.subtitle = element_text(color = "grey40"),
      axis.title = element_text(face = "bold"),
      legend.position = "bottom",
      panel.grid.minor = element_blank()
    )
)

# --- Color palette ---
ber640_colors <- c(
  primary   = "#2C3E50",
  secondary = "#E74C3C",
  accent    = "#3498DB",
  success   = "#27AE60",
  warning   = "#F39C12",
  info      = "#9B59B6"
)

ber640_palette <- scale_color_manual(values = unname(ber640_colors[1:4]))
ber640_fill    <- scale_fill_manual(values = unname(ber640_colors[1:4]))

# --- Helper functions ---
# Print model summary in tidy format
tidy_model <- function(model, conf.int = TRUE, ...) {
  broom::tidy(model, conf.int = conf.int, ...) |>
    mutate(across(where(is.numeric), \(x) round(x, 4)))
}

# Quick regression table
reg_table <- function(model, ...) {
  gtsummary::tbl_regression(model, ...) |>
    bold_labels() |>
    bold_p(t = 0.05)
}
