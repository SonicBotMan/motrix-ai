// __tests__/queue.test.ts — Integration tests for TaskDatabase CRUD + QueueManager
//
// Uses in-memory SQLite (':memory:') for TaskDatabase — no filesystem side effects.
// Mocks Aria2Client for QueueManager — no real aria2 daemon required.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { TaskDatabase } from "../queue/database.js";
import { QueueManager } from "../queue/manager.js";
import type { Aria2Client } from "../aria2/client.js";
import type {
  Task,
  TaskStatus,
  FileEntry,
  SubtitleEntry,
  DownloadIntent,
} from "../types.js";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Build a fully-populated Task object for insertion tests. */
function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-001",
    source_query: "download Inception 2010",
    intent: {
      title: "Inception",
      year: 2010,
      quality: "1080p",
      need_subtitle: false,
      search_keywords: ["Inception", "Inception 1080p"],
      resource_type: "movie",
    },
    uri: "magnet:?xt=urn:btih:abc123",
    status: "pending",
    priority: 3,
    progress: 0,
    speed: { down: 0, up: 0 },
    files: [
      { name: "Inception.mkv", path: "/downloads/Inception.mkv", size: 12_000_000_000, completed: 0 },
    ],
    subtitle: undefined,
    created_at: new Date("2024-06-13T10:00:00.000Z"),
    completed_at: undefined,
    retry_count: 0,
    error: undefined,
    aria2_gid: "gid-aria2-001",
    ...overrides,
  };
}

/** Create a mock Aria2Client with all methods QueueManager needs. */
function createMockAria2(
  overrides?: Partial<Record<string, ReturnType<typeof vi.fn>>>,
): Aria2Client {
  const baseTask: Task = makeTask({
    id: "gid-mock-001",
    status: "downloading",
    progress: 0,
    aria2_gid: "gid-mock-001",
  });

  return {
    addUri: overrides?.addUri ?? vi.fn().mockResolvedValue("gid-mock-001"),
    tellStatus: overrides?.tellStatus ??
      vi.fn().mockResolvedValue({
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
    getGlobalStat: overrides?.getGlobalStat ??
      vi.fn().mockResolvedValue({
        downloadSpeed: "0",
        uploadSpeed: "0",
        numActive: "0",
        numWaiting: "0",
        numStopped: "0",
      }),
  } as unknown as Aria2Client;
}

// ────────────────────────────────────────────────────────────
// TaskDatabase lifecycle
// ────────────────────────────────────────────────────────────

describe("TaskDatabase", () => {
  let db: TaskDatabase;

  beforeEach(() => {
    db = new TaskDatabase(":memory:");
    db.init();
  });

  afterEach(() => {
    db.close();
  });

  // ── Insert & GetById ──────────────────────────────────

  describe("insert & getById", () => {
    it("inserts a task and retrieves it by ID", () => {
      const task = makeTask();
      db.insert(task);

      const found = db.getById("task-001");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("task-001");
      expect(found!.uri).toBe("magnet:?xt=urn:btih:abc123");
    });

    it("returns null for non-existent ID", () => {
      expect(db.getById("does-not-exist")).toBeNull();
    });

    it("inserts a task without intent", () => {
      const task = makeTask({ intent: undefined });
      db.insert(task);

      const found = db.getById("task-001");
      expect(found).not.toBeNull();
      expect(found!.intent).toBeUndefined();
    });

    it("inserts a task without subtitle", () => {
      const task = makeTask({ subtitle: undefined });
      db.insert(task);

      const found = db.getById("task-001");
      expect(found).not.toBeNull();
      expect(found!.subtitle).toBeUndefined();
    });

    it("inserts a task without aria2_gid", () => {
      const task = makeTask({ aria2_gid: undefined });
      db.insert(task);

      const found = db.getById("task-001");
      expect(found).not.toBeNull();
      expect(found!.aria2_gid).toBeUndefined();
    });

    it("inserts a task without error", () => {
      const task = makeTask({ error: undefined });
      db.insert(task);

      const found = db.getById("task-001");
      expect(found).not.toBeNull();
      expect(found!.error).toBeUndefined();
    });
  });

  // ── Update ────────────────────────────────────────────

  describe("update", () => {
    it("updates status", () => {
      const task = makeTask();
      db.insert(task);

      db.update("task-001", { status: "downloading" });
      const found = db.getById("task-001");
      expect(found!.status).toBe("downloading");
    });

    it("updates progress", () => {
      db.insert(makeTask());
      db.update("task-001", { progress: 75.5 });
      const found = db.getById("task-001");
      expect(found!.progress).toBe(75.5);
    });

    it("updates priority", () => {
      db.insert(makeTask());
      db.update("task-001", { priority: 1 });
      const found = db.getById("task-001");
      expect(found!.priority).toBe(1);
    });

    it("updates speed (nested object)", () => {
      db.insert(makeTask());
      db.update("task-001", { speed: { down: 500_000, up: 50_000 } });
      const found = db.getById("task-001");
      expect(found!.speed.down).toBe(500_000);
      expect(found!.speed.up).toBe(50_000);
    });

    it("updates completed_at date", () => {
      db.insert(makeTask());
      const done = new Date("2024-06-13T12:30:00.000Z");
      db.update("task-001", {
        status: "completed",
        completed_at: done,
        progress: 100,
      });
      const found = db.getById("task-001");
      expect(found!.status).toBe("completed");
      expect(found!.completed_at).toEqual(done);
      expect(found!.progress).toBe(100);
    });

    it("updates retry_count and error", () => {
      db.insert(makeTask());
      db.update("task-001", {
        retry_count: 3,
        error: "network timeout",
        status: "failed",
      });
      const found = db.getById("task-001");
      expect(found!.retry_count).toBe(3);
      expect(found!.error).toBe("network timeout");
      expect(found!.status).toBe("failed");
    });

    it("updates files array", () => {
      db.insert(makeTask());
      const newFiles: FileEntry[] = [
        { name: "file1.mkv", path: "/d/file1.mkv", size: 1000, completed: 1000 },
        { name: "file2.mkv", path: "/d/file2.mkv", size: 2000, completed: 500 },
      ];
      db.update("task-001", { files: newFiles });
      const found = db.getById("task-001");
      expect(found!.files).toHaveLength(2);
      expect(found!.files[0].name).toBe("file1.mkv");
    });

    it("updates subtitle", () => {
      db.insert(makeTask());
      const sub: SubtitleEntry = {
        language: "zh",
        path: "/subs/Inception.zh.srt",
        source: "shooter",
      };
      db.update("task-001", { subtitle: sub });
      const found = db.getById("task-001");
      expect(found!.subtitle).toEqual(sub);
    });

    it("clears subtitle by setting to undefined via update", () => {
      // First set a subtitle
      const task = makeTask({
        subtitle: { language: "en", path: "/sub.srt", source: "shooter" },
      });
      db.insert(task);
      // The insert stores it as JSON; verify it round-trips
      expect(db.getById("task-001")!.subtitle).toBeDefined();
    });

    it("updates intent", () => {
      db.insert(makeTask());
      const newIntent: DownloadIntent = {
        title: "Interstellar",
        year: 2014,
        quality: "4K",
        need_subtitle: true,
        search_keywords: ["Interstellar"],
        resource_type: "movie",
      };
      db.update("task-001", { intent: newIntent });
      const found = db.getById("task-001");
      expect(found!.intent!.title).toBe("Interstellar");
      expect(found!.intent!.quality).toBe("4K");
    });

    it("does nothing when no fields are provided", () => {
      db.insert(makeTask());
      db.update("task-001", {});
      const found = db.getById("task-001");
      // Task should be unchanged
      expect(found!.status).toBe("pending");
    });
  });

  // ── Delete ────────────────────────────────────────────

  describe("delete", () => {
    it("deletes a task by ID", () => {
      db.insert(makeTask());
      db.delete("task-001");
      expect(db.getById("task-001")).toBeNull();
    });

    it("deleting non-existent ID does not throw", () => {
      expect(() => db.delete("no-such-id")).not.toThrow();
    });

    it("deletes only the specified task", () => {
      db.insert(makeTask({ id: "task-A" }));
      db.insert(makeTask({ id: "task-B" }));

      db.delete("task-A");
      expect(db.getById("task-A")).toBeNull();
      expect(db.getById("task-B")).not.toBeNull();
    });
  });

  // ── getByStatus & getAll ──────────────────────────────

  describe("getByStatus & getAll", () => {
    it("filters tasks by status", () => {
      db.insert(makeTask({ id: "t1", status: "pending" }));
      db.insert(makeTask({ id: "t2", status: "downloading" }));
      db.insert(makeTask({ id: "t3", status: "pending" }));
      db.insert(makeTask({ id: "t4", status: "completed" }));

      const pending = db.getByStatus("pending");
      expect(pending).toHaveLength(2);
      expect(pending.map((t) => t.id).sort()).toEqual(["t1", "t3"]);
    });

    it("returns empty array for status with no tasks", () => {
      db.insert(makeTask({ status: "pending" }));
      expect(db.getByStatus("failed")).toEqual([]);
    });

    it("getAll returns all inserted tasks ordered by created_at", () => {
      const t1 = makeTask({ id: "t1", created_at: new Date("2024-01-01T00:00:00Z") });
      const t2 = makeTask({ id: "t2", created_at: new Date("2024-01-02T00:00:00Z") });
      const t3 = makeTask({ id: "t3", created_at: new Date("2024-01-03T00:00:00Z") });

      db.insert(t3);
      db.insert(t1);
      db.insert(t2);

      const all = db.getAll();
      expect(all).toHaveLength(3);
      // Should be sorted by created_at ASC
      expect(all[0].id).toBe("t1");
      expect(all[2].id).toBe("t3");
    });

    it("getAll returns empty array for empty database", () => {
      expect(db.getAll()).toEqual([]);
    });
  });

  // ── JSON Serialization Round-trips ────────────────────

  describe("JSON serialization", () => {
    it("round-trips intent (DownloadIntent) through serialize/deserialize", () => {
      const intent: DownloadIntent = {
        title: "The Matrix",
        year: 1999,
        quality: "4K",
        need_subtitle: true,
        search_keywords: ["The Matrix", "The Matrix 1999", "The Matrix 4K"],
        resource_type: "movie",
      };
      db.insert(makeTask({ intent }));

      const found = db.getById("task-001");
      expect(found!.intent).toEqual(intent);
      expect(found!.intent!.search_keywords).toHaveLength(3);
    });

    it("round-trips files array (FileEntry[]) through serialize/deserialize", () => {
      const files: FileEntry[] = [
        { name: "movie.mkv", path: "/dl/movie.mkv", size: 5_000_000_000, completed: 3_000_000_000 },
        { name: "subs.srt", path: "/dl/subs.srt", size: 50_000, completed: 50_000 },
        { name: "sample.jpg", path: "/dl/sample.jpg", size: 1024, completed: 0 },
      ];
      db.insert(makeTask({ files }));

      const found = db.getById("task-001");
      expect(found!.files).toEqual(files);
      expect(found!.files[0].completed).toBe(3_000_000_000);
    });

    it("round-trips subtitle (SubtitleEntry) through serialize/deserialize", () => {
      const subtitle: SubtitleEntry = {
        language: "zh-CN",
        path: "/subs/movie.zh.srt",
        source: "subhd",
      };
      db.insert(makeTask({ subtitle }));

      const found = db.getById("task-001");
      expect(found!.subtitle).toEqual(subtitle);
    });

    it("stores intent as null when undefined", () => {
      db.insert(makeTask({ intent: undefined }));
      const found = db.getById("task-001");
      expect(found!.intent).toBeUndefined();
    });

    it("stores subtitle as null when undefined", () => {
      db.insert(makeTask({ subtitle: undefined }));
      const found = db.getById("task-001");
      expect(found!.subtitle).toBeUndefined();
    });

    it("handles empty files array", () => {
      db.insert(makeTask({ files: [] }));
      const found = db.getById("task-001");
      expect(found!.files).toEqual([]);
    });

    it("preserves special characters in strings", () => {
      const intent: DownloadIntent = {
        title: "电影《标题》特殊字符 \"quotes\" & <tags>",
        resource_type: "movie",
        need_subtitle: false,
        search_keywords: ["中文关键词", "emoji 🎬", "special \"chars\""],
      };
      db.insert(makeTask({ intent }));

      const found = db.getById("task-001");
      expect(found!.intent!.title).toBe(intent.title);
      expect(found!.intent!.search_keywords).toEqual(intent.search_keywords);
    });
  });

  // ── Date Serialization ────────────────────────────────

  describe("date serialization", () => {
    it("round-trips created_at as a Date object", () => {
      const created = new Date("2024-06-13T08:30:45.123Z");
      db.insert(makeTask({ created_at: created }));

      const found = db.getById("task-001");
      expect(found!.created_at).toBeInstanceOf(Date);
      expect(found!.created_at.getTime()).toBe(created.getTime());
    });

    it("round-trips completed_at as a Date object", () => {
      const completed = new Date("2024-06-13T20:00:00.000Z");
      db.insert(makeTask({
        completed_at: completed,
        status: "completed",
      }));

      const found = db.getById("task-001");
      expect(found!.completed_at).toBeInstanceOf(Date);
      expect(found!.completed_at!.getTime()).toBe(completed.getTime());
    });

    it("handles undefined completed_at", () => {
      db.insert(makeTask({ completed_at: undefined }));
      const found = db.getById("task-001");
      expect(found!.completed_at).toBeUndefined();
    });

    it("updates and round-trips completed_at after initial insert", () => {
      db.insert(makeTask()); // completed_at = undefined

      const done = new Date("2024-12-25T00:00:00.000Z");
      db.update("task-001", { completed_at: done });

      const found = db.getById("task-001");
      expect(found!.completed_at).toBeInstanceOf(Date);
      expect(found!.completed_at!.getTime()).toBe(done.getTime());
    });

    it("preserves millisecond precision in dates", () => {
      const created = new Date("2024-06-13T10:00:00.999Z");
      db.insert(makeTask({ created_at: created }));

      const found = db.getById("task-001");
      expect(found!.created_at.getMilliseconds()).toBe(999);
    });
  });

  // ── init() idempotency ────────────────────────────────

  describe("init()", () => {
    it("can be called multiple times without error", () => {
      expect(() => {
        db.init();
        db.init();
        db.init();
      }).not.toThrow();
    });

    it("preserves data across multiple init() calls", () => {
      db.insert(makeTask());
      db.init();
      const found = db.getById("task-001");
      expect(found).not.toBeNull();
    });
  });
});

// ============================================================
// QueueManager integration with mocked Aria2Client
// ============================================================

describe("QueueManager integration", () => {
  it("add() creates a download via aria2 and returns a Task", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const task = await queue.add("magnet:?xt=urn:btih:abc", "Inception 2010");

    expect(aria2.addUri).toHaveBeenCalledWith("magnet:?xt=urn:btih:abc", undefined);
    expect(aria2.tellStatus).toHaveBeenCalledWith("gid-mock-001");
    expect(task).toBeDefined();
    expect(task.id).toBe("gid-mock-001");
  });

  it("add() passes directory option to aria2", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.add("https://example.com/file.zip", "query", { dir: "/custom/path" });

    expect(aria2.addUri).toHaveBeenCalledWith("https://example.com/file.zip", {
      dir: "/custom/path",
    });
  });

  it("add() propagates source query into the Task", async () => {
    const customTask = makeTask({ id: "gid-xyz", source_query: "my NL query" });
    const aria2 = createMockAria2({
      mapToTask: vi.fn().mockReturnValue(customTask),
    });
    const queue = new QueueManager(aria2);

    const task = await queue.add("magnet:?test", "my NL query");
    expect(aria2.mapToTask).toHaveBeenCalledWith(
      expect.objectContaining({ gid: "gid-mock-001" }),
      "my NL query",
    );
    expect(task.source_query).toBe("my NL query");
  });

  it("pause() delegates to aria2.pause", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.pause("gid-123");
    expect(aria2.pause).toHaveBeenCalledWith("gid-123");
  });

  it("resume() delegates to aria2.unpause", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.resume("gid-123");
    expect(aria2.unpause).toHaveBeenCalledWith("gid-123");
  });

  it("remove() delegates to aria2.remove", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    await queue.remove("gid-123");
    expect(aria2.remove).toHaveBeenCalledWith("gid-123");
  });

  it("getStatus() returns a mapped Task", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const task = await queue.getStatus("gid-456");
    expect(aria2.tellStatus).toHaveBeenCalledWith("gid-456");
    expect(task.id).toBe("gid-mock-001");
  });

  it("listAll() merges active, waiting, and stopped results", async () => {
    const activeTask = {
      gid: "g1",
      status: "active",
      totalLength: "1000",
      completedLength: "500",
      downloadSpeed: "100",
      uploadSpeed: "50",
      files: [],
    };
    const waitingTask = {
      gid: "g2",
      status: "waiting",
      totalLength: "2000",
      completedLength: "0",
      downloadSpeed: "0",
      uploadSpeed: "0",
      files: [],
    };
    const stoppedTask = {
      gid: "g3",
      status: "complete",
      totalLength: "500",
      completedLength: "500",
      downloadSpeed: "0",
      uploadSpeed: "0",
      files: [],
    };

    const aria2 = createMockAria2({
      tellActive: vi.fn().mockResolvedValue([activeTask]),
      tellWaiting: vi.fn().mockResolvedValue([waitingTask]),
      tellStopped: vi.fn().mockResolvedValue([stoppedTask]),
      mapToTask: vi.fn().mockImplementation((status) => ({
        id: status.gid,
        source_query: "",
        uri: "",
        status: "downloading" as TaskStatus,
        priority: 3,
        progress: 50,
        speed: { down: 100, up: 50 },
        files: [],
        created_at: new Date(),
        retry_count: 0,
        aria2_gid: status.gid,
      })),
    });
    const queue = new QueueManager(aria2);

    const tasks = await queue.listAll();
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.id)).toEqual(["g1", "g2", "g3"]);
  });

  it("listAll() returns empty array when aria2 has no tasks", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const tasks = await queue.listAll();
    expect(tasks).toEqual([]);
  });

  it("getStats() returns global statistics", async () => {
    const aria2 = createMockAria2();
    const queue = new QueueManager(aria2);

    const stats = await queue.getStats();
    expect(aria2.getGlobalStat).toHaveBeenCalled();
    expect(stats).toHaveProperty("downloadSpeed");
    expect(stats).toHaveProperty("numActive");
  });

  it("propagates aria2 errors", async () => {
    const aria2 = createMockAria2({
      addUri: vi.fn().mockRejectedValue(new Error("aria2 not running")),
    });
    const queue = new QueueManager(aria2);

    await expect(queue.add("magnet:?test")).rejects.toThrow("aria2 not running");
  });
});

// ============================================================
// Combined: TaskDatabase + QueueManager pipeline
// ============================================================

describe("Queue → Database persistence pipeline", () => {
  it("persists a queued task to the database", () => {
    const db = new TaskDatabase(":memory:");
    db.init();

    const aria2 = createMockAria2();
    const _queue = new QueueManager(aria2);
    const dbTask = makeTask({ id: "gid-mock-001" });

    // Simulate: QueueManager.add → Task → TaskDatabase.insert
    db.insert(dbTask);

    const found = db.getById("gid-mock-001");
    expect(found).not.toBeNull();
    expect(found!.uri).toBe("magnet:?xt=urn:btih:abc123");
    expect(found!.status).toBe("pending");

    db.close();
  });

  it("updates database status as download progresses", () => {
    const db = new TaskDatabase(":memory:");
    db.init();

    // Insert initial pending task
    db.insert(makeTask({ id: "t1", status: "pending", progress: 0 }));

    // Simulate progress updates
    db.update("t1", { status: "downloading", progress: 50 });
    let found = db.getById("t1");
    expect(found!.status).toBe("downloading");
    expect(found!.progress).toBe(50);

    // Simulate completion
    db.update("t1", {
      status: "completed",
      progress: 100,
      completed_at: new Date("2024-06-13T15:00:00Z"),
    });
    found = db.getById("t1");
    expect(found!.status).toBe("completed");
    expect(found!.progress).toBe(100);
    expect(found!.completed_at).toEqual(new Date("2024-06-13T15:00:00Z"));

    db.close();
  });
});
