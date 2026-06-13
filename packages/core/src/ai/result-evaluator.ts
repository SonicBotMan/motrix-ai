// ai/result-evaluator.ts — Scoring and ranking of search results
// Evaluates SearchResult[] against a DownloadIntent and returns them
// sorted by a weighted quality / popularity / size heuristic.

import type { SearchResult, DownloadIntent, ResourceType, Quality } from "../types.js";

/** Byte size constants */
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** Expected size ranges per resource type: [minBytes, maxBytes] */
const SIZE_RANGES: Record<ResourceType, [number, number]> = {
  movie: [1 * GB, 80 * GB],
  tv: [1 * GB, 80 * GB],
  software: [10 * MB, 10 * GB],
  music: [10 * MB, 2 * GB],
  anime: [200 * MB, 60 * GB],
  other: [0, Infinity],
};

/** Scoring weights — must sum to 1.0 */
const WEIGHT_SEEDERS = 0.4;
const WEIGHT_SIZE = 0.3;
const WEIGHT_QUALITY = 0.3;

/** Quality proximity pairs for "close match" scoring */
const CLOSE_QUALITY_PAIRS: ReadonlyArray<[Quality, Quality]> = [
  ["4K", "1080p"],
  ["1080p", "720p"],
  ["4K", "720p"],
];

/** Internal scored result for sorting */
interface ScoredResult {
  result: SearchResult;
  score: number;
}

/**
 * Evaluates and ranks SearchResult candidates against a DownloadIntent.
 *
 * Scoring is a weighted combination of three normalised sub-scores:
 *  - **Seeders** (0.4) — popularity / health of the swarm
 *  - **Size reasonableness** (0.3) — does the file size match expectations for the type?
 *  - **Quality match** (0.3) — does the detected quality match the user's request?
 */
export class ResultEvaluator {
  /**
   * Evaluate and sort results by computed score (descending).
   *
   * Does NOT mutate the input array; returns a new sorted copy.
   *
   * @param results - Raw search results from one or more providers
   * @param intent - The original download intent with user preferences
   * @returns Results sorted best-first
   */
  evaluate(results: SearchResult[], intent: DownloadIntent): SearchResult[] {
    if (results.length === 0) return [];

    const maxSeeders = Math.max(...results.map((r) => r.seeders), 1);

    const scored: ScoredResult[] = results.map((result) => {
      const seedersScore = this.scoreSeeders(result.seeders, maxSeeders);
      const sizeScore = this.scoreSize(result.size, intent.resource_type);
      const qualityScore = this.scoreQuality(result.quality, intent.quality);

      const score =
        WEIGHT_SEEDERS * seedersScore +
        WEIGHT_SIZE * sizeScore +
        WEIGHT_QUALITY * qualityScore;

      return { result, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) => s.result);
  }

  /**
   * Return the single best-matching result, or null if no results.
   *
   * @param results - Raw search results from one or more providers
   * @param intent - The original download intent with user preferences
   * @returns The highest-scoring result, or null
   */
  pickBest(results: SearchResult[], intent: DownloadIntent): SearchResult | null {
    const sorted = this.evaluate(results, intent);
    return sorted.length > 0 ? sorted[0] : null;
  }

  /**
   * Normalised seeders score (0–1).
   * Linear normalisation against the highest seeder count in the set.
   */
  private scoreSeeders(seeders: number, maxSeeders: number): number {
    if (maxSeeders <= 0) return 0;
    return Math.min(seeders / maxSeeders, 1);
  }

  /**
   * Size reasonableness score (0–1).
   *
   * - **1.0** if size falls within the expected range for the resource type
   * - **0.5** if size is within 2× of either boundary (close but outside)
   * - **0.0** if size is far outside the expected range
   */
  private scoreSize(size: number, resourceType: ResourceType): number {
    const [minBytes, maxBytes] = SIZE_RANGES[resourceType];

    // "other" type — no constraints, neutral score
    if (minBytes === 0 && maxBytes === Infinity) return 0.5;

    // Unknown size — neutral
    if (size <= 0) return 0.5;

    // Within expected range
    if (size >= minBytes && size <= maxBytes) return 1;

    // Within 2× of range boundary — partial credit
    if (size >= minBytes / 2 && size <= maxBytes * 2) return 0.5;

    // Far outside expected range
    return 0;
  }

  /**
   * Quality match score (0–1).
   *
   * - **1.0** for exact quality match (raw +3, normalised)
   * - **~0.33** for a close-quality match (raw +1, normalised)
   * - **0.0** for a non-matching quality
   * - **0.5** when the user has no quality preference or result quality is unknown
   *
   * @param resultQuality - Quality detected from the result title
   * @param intentQuality - Quality requested by the user (may be undefined / "other")
   */
  private scoreQuality(
    resultQuality: Quality | undefined,
    intentQuality: Quality | undefined,
  ): number {
    // No user preference — neutral score
    if (!intentQuality || intentQuality === "other") return 0.5;

    // Result quality unknown — partial credit (we can't verify mismatch)
    if (!resultQuality || resultQuality === "other") return 0.5;

    // Exact match: raw +3 → normalised to 1.0
    if (resultQuality === intentQuality) return 1;

    // Close match: raw +1 → normalised to ~0.33
    for (const [q1, q2] of CLOSE_QUALITY_PAIRS) {
      if (
        (intentQuality === q1 && resultQuality === q2) ||
        (intentQuality === q2 && resultQuality === q1)
      ) {
        return 1 / 3;
      }
    }

    // No match
    return 0;
  }
}
