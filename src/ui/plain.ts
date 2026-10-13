/** Bidirectional controls, zero-width characters and C0/C1 controls: invisible, and able to reorder or hide text. */
const INVISIBLE = /[\p{Cc}؜​-‏‪-‮⁠-⁩﻿]/gu

/** Text for an attribute such as `aria-label`: the visible characters of an untrusted name, none that reorder or hide. */
export function plain(text: string): string {
  return text.replace(INVISIBLE, '').trim()
}
