/**
 * Laevatain-specific event source types for skill enhancement and empowerment.
 *
 * - Enhancement source: the active ability that changes skill behaviour
 *   (e.g. Twilight ultimate transforms Smouldering Fire's attack sequences)
 * - Empowerment source: the existing status that changes skill behaviour
 *   (e.g. Melting Flame stacks unlock the empowered version of Smouldering Fire)
 */

/** Sources that can enhance Laevatain's skills (change behaviour via active ability). */
export enum LaevatainEnhancementSource {
  /** Twilight (ultimate) — skills gain enhanced attack sequences while active. */
  TWILIGHT = "TWILIGHT",
}

/** Sources that can empower Laevatain's skills (change behaviour via existing statuses). */
export enum LaevatainEmpowermentSource {
  /** Melting Flame stacks — skills gain empowered effects at max stacks (4/4). */
  MELTING_FLAME = "MELTING_FLAME",
}
