# _common.R -- BER 640 Final Project Guide shared configuration

# --- Package loading ---
pacman::p_load(
  regdatasets,
  dplyr, tidyr, forcats, stringr, purrr,
  ggplot2, patchwork, GGally, ggrepel,
  broom, car, lmtest, sandwich,
  parameters, performance, effectsize,
  see, modelbased, correlation, report,
  datawizard, insight,
  marginaleffects,
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
tidy_model <- function(model, conf.int = TRUE, ...) {
  broom::tidy(model, conf.int = conf.int, ...) |>
    mutate(across(where(is.numeric), \(x) round(x, 4)))
}

reg_table <- function(model, ...) {
  gtsummary::tbl_regression(model, ...) |>
    bold_labels() |>
    bold_p(t = 0.05)
}

# Key-terms / notation glossary table (adapts IMS make_terms_table() to a
# term + symbol + meaning layout). Pass a tibble/data.frame; renders as a
# Bootstrap .table so it inherits the book's table house style + .notation styling.
# Usage in a chapter:  make_key_terms(tibble::tribble(~Term, ~Symbol, ~Meaning, ...))
make_key_terms <- function(df) {
  knitr::kable(df, col.names = tools::toTitleCase(names(df)))
}
