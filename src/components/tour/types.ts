export type TourStep = {
  /** CSS selector for the element to spotlight, e.g. `[data-tour="add-product"]`.
   * `data-tour="<id>"` is this system's convention for marking an element as
   * tour-able — a one-line attribute on whatever element needs it, matched
   * by selector rather than a ref, so no component anywhere has to accept a
   * ref/prop just to become a future tour step. */
  target: string;
  title: string;
  description: string;
};
