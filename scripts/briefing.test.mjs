import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import { loadBriefing } from "../app.js";
import {
  formatIssueDate,
  formatUpdatedAt,
  formatWhen,
  showEventDate,
} from "../format.js";
import { normalizeLink, toHttpsUrl } from "../links.js";
import { resolvePublicPath } from "./serve.mjs";
import { validateBriefing, validateJsonText } from "./validate-articles.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

function readJson(name) {
  return JSON.parse(readFileSync(join(root, name), "utf8"));
}

function sample() {
  return structuredClone(readJson("articles.json"));
}

function fixture() {
  return structuredClone(readJson("scripts/fixtures/sample-articles.json"));
}

function page() {
  return parseHTML(readFileSync(join(root, "index.html"), "utf8")).document;
}

function okResponse(data) {
  return { ok: true, json: async () => data };
}

test("Hebrew dates use Asia/Jerusalem", () => {
  assert.equal(
    formatUpdatedAt("2026-10-22T08:30:00+03:00"),
    "יום חמישי, 22 באוקטובר 2026 בשעה 08:30",
  );
  assert.equal(formatIssueDate("2026-10-22T05:30:00Z"), "יום חמישי, 22 באוקטובר 2026");
  assert.equal(formatWhen("2026-10-18"), "18 באוקטובר 2026");
  assert.equal(formatWhen("2026-10-21T16:00:00+03:00"), "21 באוקטובר 2026 בשעה 16:00");
  assert.equal(formatWhen("2026-01-15T22:30:00Z"), "16 בינואר 2026 בשעה 00:30");
  assert.equal(formatUpdatedAt("2026-10-22"), "");
  assert.equal(formatWhen("not-a-date"), "תאריך לא זמין");
});

test("event date is shown only when it differs", () => {
  assert.equal(showEventDate("2026-10-21T16:00:00+03:00", "2026-10-20"), true);
  assert.equal(
    showEventDate("2026-10-15T11:00:00+03:00", "2026-10-14T18:00:00+03:00"),
    true,
  );
  assert.equal(showEventDate("2026-10-20", "2026-10-20"), false);
  assert.equal(showEventDate("2026-10-20T10:00:00+03:00", "2026-10-20"), false);
  assert.equal(
    showEventDate("2026-10-20T10:00:00+03:00", "2026-10-20T18:00:00+03:00"),
    true,
  );
  assert.equal(showEventDate("2026-10-20", "nope"), false);
});

test("link normalization collapses cosmetic differences only", () => {
  const canonical = "https://example.com/a?a=2&b=1";
  for (const value of [
    "https://Example.com/a?b=1&a=2",
    "https://example.com/a/?b=1&a=2",
    "https://example.com/a?b=1&a=2#section",
    "https://example.com:443/a?b=1&a=2",
  ]) {
    assert.equal(normalizeLink(value), canonical);
  }
  assert.equal(normalizeLink("https://example.com/a?a=3&b=1"), "https://example.com/a?a=3&b=1");
  assert.equal(normalizeLink("http://example.com/a"), null);
  assert.equal(toHttpsUrl("javascript:alert(1)"), null);
  assert.equal(toHttpsUrl("https://user:pass@example.com/a"), null);
});

test("sample fixture passes and is labeled example data", () => {
  const data = fixture();
  const result = validateBriefing(data);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.ok(data.articles.length >= 4 && data.articles.length <= 6);
  assert.ok(data.articles.some((article) => article.image));
  assert.ok(data.articles.some((article) => !article.image));
  assert.ok(data.articles.some((article) => article.eventAt));
  for (const article of data.articles) {
    assert.ok(article.title.startsWith("דוגמה"));
    assert.equal(new URL(article.url).hostname, "example.com");
    if (article.image) assert.equal(new URL(article.image).hostname, "example.com");
  }
});

test("validator rejects broken content", () => {
  const cases = [
    ["missing title", (data) => delete data.articles[0].title, /missing "title"/],
    ["blank summary", (data) => {
      data.articles[0].summary = "  ";
    }, /must not be blank/],
    ["http url", (data) => {
      data.articles[0].url = "http://example.com/a";
    }, /https URL/],
    ["javascript url", (data) => {
      data.articles[0].url = "javascript:alert(1)";
    }, /https URL/],
    ["credentials", (data) => {
      data.articles[0].url = "https://user:pass@example.com/secret";
    }, /usable https URL/],
    ["http image", (data) => {
      data.articles[0].image = "http://example.com/a.jpg";
    }, /image must be an https URL/],
    ["bad calendar date", (data) => {
      data.articles[0].publishedAt = "2026-02-31";
    }, /not a valid calendar date/],
    ["datetime without timezone", (data) => {
      data.updatedAt = "2026-10-22T08:30:00";
    }, /RFC 3339/],
    ["notes field", (data) => {
      data.articles[0].notes = "private";
    }, /unknown field "notes"/],
    ["read field", (data) => {
      data.articles[0].read = true;
    }, /unknown field "read"/],
    ["duplicate link", (data) => {
      data.articles[1].url = "https://EXAMPLE.com/sample/ai-coding-review/";
    }, /duplicates/],
    ["missing updatedAt", (data) => delete data.updatedAt, /missing "updatedAt"/],
  ];

  for (const [name, mutate, pattern] of cases) {
    const data = name === "duplicate link" ? fixture() : sample();
    mutate(data);
    const result = validateBriefing(data);
    assert.equal(result.ok, false, name);
    assert.match(result.errors.join("\n"), pattern, `${name}: ${result.errors.join(" | ")}`);
  }
});

test("shared images and reordered queries are allowed or rejected correctly", () => {
  const shared = sample();
  shared.articles[1].image = shared.articles[0].image;
  assert.equal(validateBriefing(shared).ok, true);

  const reordered = sample();
  reordered.articles[1].url = "https://example.com/sample/ai-coding-review?b=1&a=2";
  reordered.articles[0].url = "https://example.com/sample/ai-coding-review?a=2&b=1";
  const result = validateBriefing(reordered);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicates/);
});

test("invalid JSON fails", () => {
  const result = validateJsonText("{");
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /invalid JSON/);
});

test("CLI exit codes", () => {
  const ok = spawnSync(process.execPath, ["scripts/validate-articles.mjs", "articles.json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(ok.status, 0, ok.stderr);

  const usage = spawnSync(process.execPath, ["scripts/validate-articles.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(usage.status, 2);

  const badPath = join(tmpdir(), `tech-radar-bad-${process.pid}.json`);
  writeFileSync(badPath, "{");
  const bad = spawnSync(process.execPath, ["scripts/validate-articles.mjs", badPath], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /invalid JSON/);
});

test("page is Hebrew, RTL, and does not inject markup from data", async () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /lang="he"/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)/);

  for (const file of ["app.js", "format.js", "links.js"]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(/);
  }

  const data = fixture();
  data.articles[0].title = '<img src=x onerror="alert(1)">';
  data.articles[0].summary = "<script>alert(1)</script>";
  data.articles[0].source = "<b>מעבדת דוגמה</b>";
  data.articles[0].url = "javascript:alert(1)";
  data.articles[0].image = "http://evil.example/x.jpg";
  data.articles[0].notes = "should not appear";

  const document = page();
  await loadBriefing(document, async () => okResponse(data));

  const lead = document.querySelector(".card-lead");
  assert.equal(lead.querySelector("script"), null);
  assert.equal(lead.querySelector("img"), null);
  assert.equal(lead.querySelector("a"), null);
  assert.match(lead.textContent, /<img src=x onerror="alert\(1\)">/);
  assert.match(lead.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(lead.textContent, /<b>מעבדת דוגמה<\/b>/);
  assert.doesNotMatch(lead.textContent, /should not appear/);
  assert.match(lead.textContent, /מועד האירוע/);

  const hrefs = [...document.querySelectorAll("#list a")].map((anchor) => anchor.getAttribute("href"));
  assert.ok(hrefs.every((href) => href.startsWith("https://")));
  const images = [...document.querySelectorAll("#list img")];
  assert.ok(images.length > 0);
  for (const img of images) {
    assert.ok(img.getAttribute("src").startsWith("https://"));
    assert.equal(img.hidden, false);
    assert.equal(img.hasAttribute("hidden"), false);
    assert.equal(img.classList.contains("is-pending"), true);
  }

  assert.match(document.querySelector("#dateline").textContent, /6 כתבות/);
  assert.match(document.querySelector("#dateline").textContent, /22 באוקטובר 2026 בשעה 08:30/);
  assert.equal(document.querySelector("#status").hidden, true);
});

test("empty list and fetch failure are visible", async () => {
  const empty = page();
  const data = sample();
  data.articles = [];
  await loadBriefing(empty, async () => okResponse(data));
  assert.match(empty.querySelector("#status").textContent, /אין כתבות/);
  assert.equal(empty.querySelector("#list").children.length, 0);
  assert.match(empty.querySelector("#dateline").textContent, /עודכן לאחרונה/);

  const failed = page();
  await loadBriefing(failed, async () => {
    throw new Error("offline");
  });
  assert.match(failed.querySelector("#status").textContent, /לא הצלחנו לטעון/);
  assert.equal(failed.querySelector("#status").getAttribute("role"), "alert");
  assert.equal(failed.querySelector("#list").children.length, 0);

  const denied = page();
  await loadBriefing(denied, async () => ({ ok: false, status: 500, json: async () => ({}) }));
  assert.match(denied.querySelector("#status").textContent, /לא הצלחנו לטעון/);
});

test("same-day event date stays off the card", async () => {
  const data = sample();
  data.articles = [data.articles[1]];
  data.articles[0].eventAt = data.articles[0].publishedAt;
  const document = page();
  await loadBriefing(document, async () => okResponse(data));
  assert.match(document.querySelector(".card").textContent, /פורסם/);
  assert.doesNotMatch(document.querySelector(".card").textContent, /מועד האירוע/);
  assert.match(document.querySelector("#dateline").textContent, /כתבה אחת/);
});

test("public path cannot leave the site root", () => {
  const rootDir = "/srv/tech-radar";
  assert.equal(resolvePublicPath(rootDir, "/"), "/srv/tech-radar/index.html");
  assert.equal(resolvePublicPath(rootDir, "/articles.json"), "/srv/tech-radar/articles.json");
  const escaped = resolvePublicPath(rootDir, "/../../etc/passwd");
  assert.ok(escaped.startsWith(`${rootDir}/`));
  assert.notEqual(escaped, "/etc/passwd");
  const encoded = resolvePublicPath(rootDir, "/%2e%2e/%2e%2e/etc/passwd");
  assert.ok(encoded.startsWith(`${rootDir}/`));
  assert.notEqual(encoded, "/etc/passwd");
  assert.equal(resolvePublicPath(rootDir, "http://["), null);
});

test("stage copies the site and leaves the tooling behind", () => {
  const result = spawnSync(process.execPath, ["scripts/stage-site.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, "_site/articles.json")), true);
  assert.equal(existsSync(join(root, "_site/app.js")), true);
  assert.equal(existsSync(join(root, "_site/fonts/heebo-hebrew.woff2")), true);
  assert.equal(existsSync(join(root, "_site/README.md")), false);
  assert.equal(existsSync(join(root, "_site/schema/articles.schema.json")), false);
  assert.equal(existsSync(join(root, "_site/.github/workflows/deploy-pages.yml")), false);
});
