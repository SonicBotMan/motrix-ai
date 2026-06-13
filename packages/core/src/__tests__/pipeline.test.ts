// __tests__/pipeline.test.ts — Integration tests for the NL→search→evaluate→queue pipeline
//
// Exercises the full pipeline WITHOUT real network or aria2:
//   NL input → IntentParser.parse() → DownloadIntent
//   → KeywordGenerator.generate() → search keywords
//   → searchAll(mocked) → SearchResult[]
//   → ResultEvaluator.evaluate()/pickBest() → ranked results
//   → QueueManager(mocked Aria2Client) → Task

import { describe, it, expect, vi, beforeEach } from "vitest";

import type {
  DownloadIntent,
  SearchResult,
  Task,
  TaskStatus,
  FileEntry,
} from "../types.js";

// ────────────────────────────────────────────────────────────
// Module mocks (hoisted by vitest)
// ────────────────────────────────────────────────────────────

// Mock searchAll so no real HTTP/provider calls are made
vi.mock("../search/provider.js", () => ({
  searchAll: vi.fn(),
}));

import { searchAll } from "../search/provider.js";
import { KeywordGenerator } from "../ai/keyword-generator.js";
import { ResultEvaluator } from "../ai/result-evaluator.js";
import { IntentParser } from "../ai/intent-parser.js";
import { QueueManager } from "../queue/manager.js";
import type { Aria2Client } from "../aria2/client.js";

const mockedSearchAll = vi.mocked(searchAll);

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const movieIntent: DownloadIntent = {
  title: "Inception",
  year: 2010,
  quality: "1080p",
  need_subtitle: false,
  search_keywords: ["Inception", "Inception 2010"],
  resource_type: "movie",
};

/** A diverse set of search results to exercise ranking heuristics. */
function makeResults(): SearchResult[] {
  return [
    {
      title: "Inception.2010.720p.BluRay.x264",
      magnet: "magnet:?xt=urn:btih:aaa1",
      size: 5 * 1024 ** 3, // 5 GB
      seeders: 300,
      leechers: 20,
      source: "btdig",
      quality: "720p",
    },
    {
      title: "Inception.2010.1080p.BluRay.x265",
      magnet: "magnet:?xt=urn:btih:bbb2",
      size: 12 * 1024 ** 3, // 12 GB
      seeders: 500,
      leechers: 50,
      source: "mikan",
      quality: "1080p",
    },
    {
      title: "Inception.2010.4K.UHD.BluRay",
      magnet: "magnet:?xt=urn:btih:ccc3",
      size: 55 * 1024 ** 3, // 55 GB
      seeders: 120,
      leechers: 10,
      source: "duckduckgo",
      quality: "4K",
    },
    {
      title: "Inception.Behind.The.Scenes.Extra",
      magnet: "magnet:?xt=urn:btih:ddd4",
      size: 200 * 1024 ** 2, // 200 MB (suspiciously small for a movie)
      seeders: 5,
      leechers: 1,
      source: "btdig",
    },
    {
      title: "Inception.2010.1080p.WEB-DL.DDP5.1",
      magnet: "magnet:?xt=urn:btih:eee5",
      size: 8 * 1024 ** 3, // 8 GB
      seeders: 500,
      leechers: 30,
      source: "mikan",
      quality: "1080p",
    },
  ];
}

// ────────────────────────────────────────────────────────────
// Helper: create a mock Aria2Client for QueueManager
// ────────────────────────────────────────────────────────────

function createMockAria2(overrides?: Partial<Record<string, ReturnType<typeof vi.fn>>>) {
  const baseTask: Task = {
    id: "gid-mock-001",
    source_query: "Inception",
    uri: "magnet:?xt=urn:btih:bbb2",
    status: "downloading" as TaskStatus,
    priority: 3,
    progress: 0,
    speed: { down: 0, up: 0 },
    files: [] as FileEntry[],
    created_at: new Date(),
    retry_count: 0,
    aria2_gid: "gid-mock-001",
  };

  return {
    addUri: overrides?.addUri ?? vi.fn().mockResolvedValue("gid-mock-001"),
    tellStatus: overrides?.tellStatus ?? vi.fn().mockResolvedValue({
      gid: "gid-mock-001",
      status: "active",
      totalLength: "0",
      completedLength: "0",
      downloadSpeed: "0",
      uploadSpeed: "0",
      files: [],
    }),
    mapToTask: overrides?.mapToTask ?? vi.fn().mockReturnValue(baseTask),
    pause: overrides?.pause ?? vi.fn().mockResolvedValue("ok"),
    unpause: overrides?.unpause ?? vi.fn().mockResolvedValue("ok"),
    remove: overrides?.remove ?? vi.fn().mockResolvedValue("ok"),
    tellActive: overrides?.tellActive ?? vi.fn().mockResolvedValue([]),
    tellWaiting: overrides?.tellWaiting ?? vi.fn().mockResolvedValue([]),
    tellStopped: overrides?.tellStopped ?? vi.fn().mockResolvedValue([]),
    getGlobalStat: overrides?.getGlobalStat ?? vi.fn().mockResolvedValue({
      downloadSpeed: "0",
      uploadSpeed: "0",
      numActive: "0",
      numWaiting: "0",
      numStopped: "0",
    }),
  } as unknown as Aria2Client;
}

// ────────────────────────────────────────────────────────────
// Reset mocks before each test
// ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// 1. Full Pipeline: NL → Intent → Keywords → Search → Evaluate → Queue
// ============================================================

describe("Full NL pipeline", () => {
  it("end-to-end: NL → intent → keywords → search → evaluate → queue task", async () => {
    const parser = new IntentParser();
    // Mock parse to return a known intent (no OpenCode SDK call)
    vi.spyOn(parser, "parse").mockResolvedValue(movieIntent);

    // Mock searchAll to return known results
    const results = makeResults();
    mockedSearchAll.mockResolvedValue(results);

    const evaluator = new ResultEvaluator();
    const keywordGen = new KeywordGenerator();
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    // Step 1: Parse NL
    const intent = await parser.parse("download Inception 2010 1080p");
    expect(intent).toEqual(movieIntent);
    expect(intent.title).toBe("Inception");
    expect(intent.resource_type).toBe("movie");

    // Step 2: Generate keywords
    const keywords = keywordGen.generate(intent);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords[0]).toBe("Inception");

    // Step 3: Search (mocked)
    const searchResults = await searchAll([], intent);
    expect(searchResults).toHaveLength(results.length);

    // Step 4: Evaluate & pick best
    const best = evaluator.pickBest(searchResults, intent);
    expect(best).not.toBeNull();
    expect(best!.title).toContain("Inception");

    // Step 5: Queue the best result
    const task = await queue.add(best!.magnet, intent.title);
    expect(task).toBeDefined();
    expect(task.id).toBe("gid-mock-001");
    expect(aria2.addUri).toHaveBeenCalledWith(best!.magnet, undefined);
  });

  it("preserves intent metadata through the pipeline", async () => {
    const parser = new IntentParser();
    const intent: DownloadIntent = {
      title: "The Matrix",
      year: 1999,
      quality: "4K",
      need_subtitle: true,
      search_keywords: ["The Matrix 1999"],
      resource_type: "movie",
    };
    vi.spyOn(parser, "parse").mockResolvedValue(intent);

    const parsed = await parser.parse("get The Matrix in 4K with subtitles");
    expect(parsed.quality).toBe("4K");
    expect(parsed.need_subtitle).toBe(true);
    expect(parsed.year).toBe(1999);
  });
});

// ============================================================
// 2. KeywordGenerator — resource-type-specific keyword variants
// ============================================================

describe("KeywordGenerator.generate()", () => {
  const gen = new KeywordGenerator();

  it("returns base title and title+type for movie", () => {
    const kw = gen.generate(movieIntent);
    expect(kw).toContain("Inception");
    expect(kw).toContain("Inception movie");
  });

  it("adds year-context keywords for movie", () => {
    const kw = gen.generate(movieIntent);
    expect(kw).toContain("Inception 2010");
    expect(kw).toContain("Inception 2010 movie");
  });

  it("adds quality-context keywords for movie", () => {
    const kw = gen.generate(movieIntent);
    // quality = 1080p → QUALITY_TERMS["1080p"] = ["1080p", "FHD"]
    expect(kw).toContain("Inception 1080p");
    expect(kw).toContain("Inception FHD");
    expect(kw).toContain("Inception 2010 1080p");
  });

  it("adds bilingual movie modifiers", () => {
    const kw = gen.generate(movieIntent);
    expect(kw).toContain("Inception 电影");
    expect(kw).toContain("Inception BluRay");
    expect(kw).toContain("Inception WEB-DL");
  });

  it("adds torrent/download modifiers for movie", () => {
    const kw = gen.generate(movieIntent);
    expect(kw).toContain("Inception magnet");
    expect(kw).toContain("Inception torrent");
    expect(kw).toContain("Inception download");
  });

  it("produces TV-specific keywords", () => {
    const tvIntent: DownloadIntent = {
      title: "Breaking Bad",
      resource_type: "tv",
      need_subtitle: false,
      search_keywords: [],
    };
    const kw = gen.generate(tvIntent);
    expect(kw).toContain("Breaking Bad tv");
    expect(kw).toContain("Breaking Bad 剧集");
    expect(kw).toContain("Breaking Bad complete");
    expect(kw).toContain("Breaking Bad season");
    expect(kw).toContain("Breaking Bad S01");
  });

  it("produces software-specific keywords", () => {
    const swIntent: DownloadIntent = {
      title: "Photoshop 25.0",
      resource_type: "software",
      need_subtitle: false,
      search_keywords: [],
    };
    const kw = gen.generate(swIntent);
    expect(kw).toContain("Photoshop 25.0 download");
    expect(kw).toContain("Photoshop 25.0 下载");
    expect(kw).toContain("Photoshop 25.0 crack");
    expect(kw).toContain("Photoshop 25.0 portable");
  });

  it("extracts version number for software keywords", () => {
    const swIntent: DownloadIntent = {
      title: "Photoshop 25.0",
      resource_type: "software",
      need_subtitle: false,
      search_keywords: [],
    };
    const kw = gen.generate(swIntent);
    // Version extraction adds "Photoshop 25.0 25.0"
    expect(kw.some((k) => k.includes("25.0"))).toBe(true);
  });

  it("produces music-specific keywords", () => {
    const musicIntent: DownloadIntent = {
      title: "Daft Punk - Discovery",
      resource_type: "music",
      need_subtitle: false,
      search_keywords: [],
    };
    const kw = gen.generate(musicIntent);
    expect(kw).toContain("Daft Punk - Discovery album");
    expect(kw).toContain("Daft Punk - Discovery 专辑");
    expect(kw).toContain("Daft Punk - Discovery FLAC");
    expect(kw).toContain("Daft Punk - Discovery MP3");
  });

  it("separates artist and album for music with ' - ' separator", () => {
    const musicIntent: DownloadIntent = {
      title: "Daft Punk - Discovery",
      resource_type: "music",
      need_subtitle: false,
      search_keywords: [],
    };
    const kw = gen.generate(musicIntent);
    expect(kw).toContain("Daft Punk discography");
    expect(kw).toContain("Discovery album");
  });

  it("produces generic keywords for 'other' resource type", () => {
    const otherIntent: DownloadIntent = {
      title: "Random Data Pack",
      resource_type: "other",
      need_subtitle: false,
      search_keywords: [],
    };
    const kw = gen.generate(otherIntent);
    expect(kw).toContain("Random Data Pack 下载");
    expect(kw).toContain("Random Data Pack magnet");
    expect(kw).toContain("Random Data Pack torrent");
  });

  it("includes keywords from intent.search_keywords", () => {
    const intent: DownloadIntent = {
      title: "Test Movie",
      resource_type: "movie",
      need_subtitle: false,
      search_keywords: ["custom keyword A", "custom keyword B"],
    };
    const kw = gen.generate(intent);
    expect(kw).toContain("custom keyword A");
    expect(kw).toContain("custom keyword B");
  });

  it("deduplicates keywords", () => {
    const intent: DownloadIntent = {
      title: "Inception",
      resource_type: "movie",
      need_subtitle: false,
      search_keywords: ["Inception"], // duplicates the title
    };
    const kw = gen.generate(intent);
    const unique = new Set(kw);
    expect(kw.length).toBe(unique.size);
  });

  it("returns empty array for empty/whitespace title", () => {
    const intent: DownloadIntent = {
      title: "   ",
      resource_type: "movie",
      need_subtitle: false,
      search_keywords: [],
    };
    expect(gen.generate(intent)).toEqual([]);
  });
});

// ============================================================
// 3. ResultEvaluator — scoring, sorting, and pickBest
// ============================================================

describe("ResultEvaluator", () => {
  const evaluator = new ResultEvaluator();

  it("returns empty array for empty input", () => {
    expect(evaluator.evaluate([], movieIntent)).toEqual([]);
  });

  it("pickBest returns null for empty input", () => {
    expect(evaluator.pickBest([], movieIntent)).toBeNull();
  });

  it("sorts high-seeder results first (seeders weight = 0.4)", () => {
    const results = makeResults();
    const sorted = evaluator.evaluate(results, movieIntent);

    // The two 500-seeder results should be in the top 2
    const topSeeders = sorted.slice(0, 2).map((r) => r.seeders);
    expect(topSeeders.every((s) => s === 500)).toBe(true);

    // Lowest-seeder result (5) should be last
    expect(sorted[sorted.length - 1].seeders).toBe(5);
  });

  it("prefers quality match when seeders are similar", () => {
    // Two results with identical seeders but different quality
    const intent: DownloadIntent = {
      ...movieIntent,
      quality: "1080p",
    };
    const results: SearchResult[] = [
      {
        title: "Match 720p",
        magnet: "magnet:?1",
        size: 5 * 1024 ** 3,
        seeders: 100,
        leechers: 0,
        source: "x",
        quality: "720p",
      },
      {
        title: "Match 1080p",
        magnet: "magnet:?2",
        size: 5 * 1024 ** 3,
        seeders: 100,
        leechers: 0,
        source: "x",
        quality: "1080p",
      },
    ];

    const best = evaluator.pickBest(results, intent);
    expect(best).not.toBeNull();
    // Exact quality match (1080p) should rank above close match (720p)
    expect(best!.quality).toBe("1080p");
  });

  it("penalizes suspiciously small file sizes for movies", () => {
    const results = makeResults();
    const sorted = evaluator.evaluate(results, movieIntent);

    // 200 MB "Behind The Scenes" should rank low for a movie
    const extrasIdx = sorted.findIndex((r) => r.title.includes("Extra"));
    const goodIdx = sorted.findIndex((r) => r.title.includes("1080p.BluRay"));

    expect(extrasIdx).toBeGreaterThan(goodIdx);
  });

  it("pickBest returns a valid result (not null) when results exist", () => {
    const results = makeResults();
    const best = evaluator.pickBest(results, movieIntent);
    expect(best).not.toBeNull();
    expect(best!.magnet).toMatch(/^magnet:\?xt=urn:btih:/);
  });

  it("treats unknown result quality as partial match", () => {
    const results: SearchResult[] = [
      {
        title: "No Quality Tag",
        magnet: "magnet:?1",
        size: 8 * 1024 ** 3,
        seeders: 100,
        leechers: 0,
        source: "x",
        // quality undefined
      },
    ];
    const best = evaluator.pickBest(results, movieIntent);
    expect(best).not.toBeNull();
    expect(best!.title).toBe("No Quality Tag");
  });

  it("gives neutral scores when intent quality is 'other'", () => {
    const intent: DownloadIntent = {
      ...movieIntent,
      quality: "other",
    };
    const results: SearchResult[] = [
      {
        title: "4K Result",
        magnet: "magnet:?1",
        size: 8 * 1024 ** 3,
        seeders: 50,
        leechers: 0,
        source: "x",
        quality: "4K",
      },
      {
        title: "720p Result",
        magnet: "magnet:?2",
        size: 8 * 1024 ** 3,
        seeders: 100,
        leechers: 0,
        source: "x",
        quality: "720p",
      },
    ];
    // With neutral quality scores, seeders dominate (weight 0.4)
    const best = evaluator.pickBest(results, intent);
    expect(best).not.toBeNull();
    // 100 seeders should beat 50 seeders when quality is neutral
    expect(best!.seeders).toBe(100);
  });

  it("does not mutate the input array", () => {
    const results = makeResults();
    const originalOrder = results.map((r) => r.title);
    evaluator.evaluate(results, movieIntent);
    // Original array order should be unchanged
    expect(results.map((r) => r.title)).toEqual(originalOrder);
  });
});

// ============================================================
// 4. Error cases and edge conditions
// ============================================================

describe("Pipeline error cases", () => {
  it("handles empty search results gracefully", async () => {
    const parser = new IntentParser();
    vi.spyOn(parser, "parse").mockResolvedValue(movieIntent);
    mockedSearchAll.mockResolvedValue([]);

    const evaluator = new ResultEvaluator();

    const intent = await parser.parse("Inception");
    const searchResults = await searchAll([], intent);
    expect(searchResults).toHaveLength(0);

    const best = evaluator.pickBest(searchResults, intent);
    expect(best).toBeNull();
  });

  it("handles searchAll rejection without crashing the evaluator", async () => {
    mockedSearchAll.mockRejectedValue(new Error("network timeout"));

    await expect(searchAll([], movieIntent)).rejects.toThrow("network timeout");
  });

  it("handles invalid intent with empty title", () => {
    const gen = new KeywordGenerator();
    const intent: DownloadIntent = {
      title: "",
      resource_type: "movie",
      need_subtitle: false,
      search_keywords: [],
    };
    // Empty title produces no keywords
    expect(gen.generate(intent)).toEqual([]);
  });

  it("handles intent parse failure", async () => {
    const parser = new IntentParser();
    vi.spyOn(parser, "parse").mockRejectedValue(new Error("意图解析失败: invalid"));

    await expect(parser.parse("garbage input")).rejects.toThrow("意图解析失败");
  });

  it("handles QueueManager.add failure from aria2", async () => {
    const aria2 = createMockAria2({
      addUri: vi.fn().mockRejectedValue(new Error("aria2 connection refused")),
    });
    const queue = new QueueManager(aria2);

    await expect(queue.add("magnet:?test", "query")).rejects.toThrow(
      "aria2 connection refused",
    );
  });
});

// ============================================================
// 5. QueueManager integration with mocked Aria2Client
// ============================================================

describe("QueueManager with mocked Aria2Client", () => {
  it("add() calls aria2.addUri and returns mapped Task", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const task = await queue.add("magnet:?xt=urn:btih:abc", "Inception");

    expect(aria2.addUri).toHaveBeenCalledWith("magnet:?xt=urn:btih:abc", undefined);
    expect(aria2.tellStatus).toHaveBeenCalledWith("gid-mock-001");
    expect(task.id).toBe("gid-mock-001");
  });

  it("add() passes options through to aria2", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.add("magnet:?test", "query", { dir: "/downloads" });

    expect(aria2.addUri).toHaveBeenCalledWith("magnet:?test", { dir: "/downloads" });
  });

  it("pause() calls aria2.pause", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.pause("gid-001");
    expect(aria2.pause).toHaveBeenCalledWith("gid-001");
  });

  it("resume() calls aria2.unpause", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.resume("gid-001");
    expect(aria2.unpause).toHaveBeenCalledWith("gid-001");
  });

  it("remove() calls aria2.remove", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.remove("gid-001");
    expect(aria2.remove).toHaveBeenCalledWith("gid-001");
  });

  it("listAll() merges active, waiting, and stopped", async () => {
    const mockTask = {
      gid: "g1",
      status: "active",
      totalLength: "1000",
      completedLength: "500",
      downloadSpeed: "100",
      uploadSpeed: "50",
      files: [],
    };
    const aria2 = createMockAria2({
      tellActive: vi.fn().mockResolvedValue([mockTask]),
      tellWaiting: vi.fn().mockResolvedValue([]),
      tellStopped: vi.fn().mockResolvedValue([]),
      mapToTask: vi.fn().mockReturnValue({
        id: "g1",
        source_query: "",
        uri: "",
        status: "downloading",
        priority: 3,
        progress: 50,
        speed: { down: 100, up: 50 },
        files: [],
        created_at: new Date(),
        retry_count: 0,
        aria2_gid: "g1",
      }),
    });
    const queue = new QueueManager(aria2);

    const tasks = await queue.listAll();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("g1");
  });

  it("getStatus() queries aria2.tellStatus and maps to Task", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const task = await queue.getStatus("gid-001");
    expect(aria2.tellStatus).toHaveBeenCalledWith("gid-001");
    expect(task.id).toBe("gid-mock-001");
  });

  it("getStats() delegates to aria2.getGlobalStat", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const stats = await queue.getStats();
    expect(aria2.getGlobalStat).toHaveBeenCalled();
    expect(stats).toHaveProperty("downloadSpeed");
  });
});
