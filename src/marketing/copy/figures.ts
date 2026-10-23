/**
 * Figures the marketing copy may contain: a number followed by `%` or `x`. Each entry names where
 * the number comes from, so the page never states one that nobody measured. Empty on purpose:
 * Closeline has no measured figure to publish yet. Add one here, with its source, before using it.
 */
export const FIGURE_ALLOWLIST: readonly { readonly figure: string; readonly source: string }[] = []
