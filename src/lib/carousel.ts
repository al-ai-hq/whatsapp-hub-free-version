// Pure carousel helpers — no DB/queue imports so they stay unit-testable.

export interface SendCard {
  format: string;
  mediaUrl: string;
}

/**
 * Resolve the cards to send for a carousel template: the template's stored
 * card definitions, with any per-broadcast media overrides applied by index.
 * A blank/missing override keeps that card's default media.
 * Returns null when the template has no carousel.
 */
export function resolveCarouselCards(
  templateCards: unknown,
  overrides?: readonly (string | null | undefined)[] | null,
): SendCard[] | null {
  if (!Array.isArray(templateCards) || templateCards.length === 0) return null;
  return (templateCards as { format: string; mediaUrl: string }[]).map((c, i) => {
    const override = overrides?.[i]?.trim();
    return { format: c.format, mediaUrl: override || c.mediaUrl };
  });
}
