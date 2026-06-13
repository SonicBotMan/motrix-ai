// search/__tests__/providers.test.ts — Tests for search providers

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseBtdigHtml, parseSizeToBytes } from "../btdig.js";
import { parseMikanRss, parseAnimeTitle } from "../mikan.js";

// ============================================================
// BtdigSearchProvider tests
// ============================================================

describe("parseSizeToBytes", () => {
  it("parses GB values", () => {
    expect(parseSizeToBytes("1.2 GB")).toBe(Math.floor(1.2 * 1024 ** 3));
  });

  it("parses MB values", () => {
    expect(parseSizeToBytes("500 MB")).toBe(500 * 1024 ** 2);
  });

  it("parses TB values", () => {
    expect(parseSizeToBytes("2 TB")).toBe(2 * 1024 ** 4);
  });

  it("parses KB values", () => {
    expect(parseSizeToBytes("1024 KB")).toBe(1024 * 1024);
  });

  it("parses plain bytes", () => {
    expect(parseSizeToBytes("1024 B")).toBe(1024);
  });

  it("returns 0 for empty string", () => {
    expect(parseSizeToBytes("")).toBe(0);
  });

  it("returns 0 for unparseable input", () => {
    expect(parseSizeToBytes("unknown")).toBe(0);
  });

  it("handles case-insensitive units", () => {
    expect(parseSizeToBytes("1.5 gb")).toBe(Math.floor(1.5 * 1024 ** 3));
  });
});

describe("parseBtdigHtml", () => {
  const sampleHtml = `
<html>
<body>
<div class="one_result">
  <div class="torrent_name">Ubuntu 22.04 Desktop amd64</div>
  <span class="torrent_size">4.7 GB</span>
  <div class="torrent_magnet">
    <a href="magnet:?xt=urn:btih:abc123&amp;dn=Ubuntu+22.04">magnet</a>
  </div>
</div>
<div class="one_result">
  <div class="torrent_name">Some Movie 1080p BluRay x264</div>
  <span class="torrent_size">2.1 GB</span>
  <div class="torrent_magnet">
    <a href="magnet:?xt=urn:btih:def456&amp;dn=Some+Movie">magnet</a>
  </div>
</div>
<div class="one_result">
  <div class="torrent_name">Small File</div>
  <span class="torrent_size">500 MB</span>
  <div class="torrent_magnet">
    <a href="magnet:?xt=urn:btih:ghi789&amp;dn=Small">magnet</a>
  </div>
</div>
</body>
</html>`;

  it("extracts all results from HTML", () => {
    const results = parseBtdigHtml(sampleHtml);
    expect(results).toHaveLength(3);
  });

  it("extracts title correctly", () => {
    const results = parseBtdigHtml(sampleHtml);
    expect(results[0].title).toBe("Ubuntu 22.04 Desktop amd64");
    expect(results[1].title).toBe("Some Movie 1080p BluRay x264");
  });

  it("extracts magnet links correctly", () => {
    const results = parseBtdigHtml(sampleHtml);
    expect(results[0].magnet).toBe("magnet:?xt=urn:btih:abc123&dn=Ubuntu+22.04");
    expect(results[1].magnet).toBe("magnet:?xt=urn:btih:def456&dn=Some+Movie");
  });

  it("extracts and converts size to bytes", () => {
    const results = parseBtdigHtml(sampleHtml);
    expect(results[0].size).toBe(Math.floor(4.7 * 1024 ** 3));
    expect(results[1].size).toBe(Math.floor(2.1 * 1024 ** 3));
    expect(results[2].size).toBe(500 * 1024 ** 2);
  });

  it("sets source to btdig", () => {
    const results = parseBtdigHtml(sampleHtml);
    expect(results[0].source).toBe("btdig");
  });

  it("detects quality from title", () => {
    const results = parseBtdigHtml(sampleHtml);
    expect(results[0].quality).toBeUndefined();
    expect(results[1].quality).toBe("1080p");
  });

  it("returns empty array for HTML with no results", () => {
    const results = parseBtdigHtml("<html><body>No results found</body></html>");
    expect(results).toHaveLength(0);
  });

  it("handles results without magnet links", () => {
    const html = `
    <div class="one_result">
      <div class="torrent_name">No Magnet File</div>
      <span class="torrent_size">100 MB</span>
    </div>`;
    const results = parseBtdigHtml(html);
    // Should be skipped since no magnet link
    expect(results).toHaveLength(0);
  });
});

// ============================================================
// MikanSearchProvider tests
// ============================================================

describe("parseMikanRss", () => {
  const sampleRss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Mikan Project</title>
    <item>
      <title><![CDATA[[SubGroup] My Anime - 01 [1080p].mkv]]></title>
      <enclosure url="https://mikanani.me/Download/12345.torrent" length="1572864000" type="application/x-bittorrent" />
      <link><![CDATA[magnet:?xt=urn:btih:aaaa1111&dn=My+Anime]]></link>
      <description>10 seeders</description>
    </item>
    <item>
      <title><![CDATA[[Another] Cool Show - 12 END [720p].mkv]]></title>
      <enclosure url="https://mikanani.me/Download/67890.torrent" length="524288000" type="application/x-bittorrent" />
      <link><![CDATA[magnet:?xt=urn:btih:bbbb2222&dn=Cool+Show]]></link>
    </item>
    <item>
      <title><![CDATA[[NoMagnet] Test Anime - 03 [4K].mkv]]></title>
      <enclosure url="https://mikanani.me/Download/11111.torrent" length="8589934592" type="application/x-bittorrent" />
    </item>
  </channel>
</rss>`;

  it("extracts items from RSS XML", () => {
    const results = parseMikanRss(sampleRss);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("extracts titles correctly", () => {
    const results = parseMikanRss(sampleRss);
    expect(results[0].title).toBe("[SubGroup] My Anime - 01 [1080p].mkv");
  });

  it("extracts magnet links", () => {
    const results = parseMikanRss(sampleRss);
    expect(results[0].magnet).toBe("magnet:?xt=urn:btih:aaaa1111&dn=My+Anime");
    expect(results[1].magnet).toBe("magnet:?xt=urn:btih:bbbb2222&dn=Cool+Show");
  });

  it("falls back to enclosure URL when no magnet", () => {
    const results = parseMikanRss(sampleRss);
    const noMagnet = results.find((r) => r.title.includes("NoMagnet"));
    expect(noMagnet).toBeDefined();
    expect(noMagnet!.magnet).toContain(".torrent");
  });

  it("extracts size from enclosure length", () => {
    const results = parseMikanRss(sampleRss);
    expect(results[0].size).toBe(1572864000);
  });

  it("sets source to mikan", () => {
    const results = parseMikanRss(sampleRss);
    expect(results[0].source).toBe("mikan");
  });

  it("detects quality from title", () => {
    const results = parseMikanRss(sampleRss);
    expect(results[0].quality).toBe("1080p");
    expect(results[1].quality).toBe("720p");

    const noMagnet = results.find((r) => r.title.includes("4K"));
    expect(noMagnet?.quality).toBe("4K");
  });

  it("returns empty for empty XML", () => {
    const results = parseMikanRss("<rss></rss>");
    expect(results).toHaveLength(0);
  });

  it("handles RSS without CDATA sections", () => {
    const rss = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Plain Title Anime EP01</title>
    <link>magnet:?xt=urn:btih:cccc3333</link>
  </item>
</channel></rss>`;
    const results = parseMikanRss(rss);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Plain Title Anime EP01");
    expect(results[0].magnet).toBe("magnet:?xt=urn:btih:cccc3333");
  });
});

describe("parseAnimeTitle", () => {
  it("extracts subgroup from bracket notation", () => {
    const result = parseAnimeTitle("[SubGroup] My Anime - 01 [1080p].mkv");
    expect(result.subgroup).toBe("SubGroup");
  });

  it("extracts quality", () => {
    const result = parseAnimeTitle("[SubGroup] My Anime - 01 [1080p].mkv");
    expect(result.quality).toBe("1080p");
  });

  it("extracts episode number from EP format", () => {
    const result = parseAnimeTitle("[SubGroup] My Anime EP01 [1080p].mkv");
    expect(result.episode).toBe("01");
  });

  it("extracts episode from bracket number format", () => {
    const result = parseAnimeTitle("[SubGroup] My Anime [01] [1080p].mkv");
    expect(result.episode).toBe("01");
  });

  it("extracts anime title", () => {
    const result = parseAnimeTitle("[SubGroup] My Anime EP01 [1080p].mkv");
    expect(result.animeTitle).toContain("My Anime");
  });

  it("handles S01E01 format", () => {
    const result = parseAnimeTitle("Show.Name.S01E05.1080p.WEB-DL.mkv");
    expect(result.episode).toBe("05");
    expect(result.quality).toBe("1080p");
  });
});
