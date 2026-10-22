import { toHttpsUrl } from "./links.js";
import {
  articleCountLabel,
  formatIssueDate,
  formatUpdatedAt,
  formatWhen,
  showEventDate,
} from "./format.js";

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function replaceChildren(node, ...children) {
  if (typeof node.replaceChildren === "function") {
    node.replaceChildren(...children);
    return;
  }
  while (node.firstChild) node.removeChild(node.firstChild);
  for (const child of children) node.appendChild(child);
}

function setStatus(doc, message, kind) {
  const status = doc.querySelector("#status");
  if (!message) {
    status.hidden = true;
    status.textContent = "";
    status.classList.remove("status-error");
    status.setAttribute("role", "status");
    return;
  }
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle("status-error", kind === "error");
  status.setAttribute("role", kind === "error" ? "alert" : "status");
}

function isBriefingShape(data) {
  return Boolean(data)
    && typeof data === "object"
    && !Array.isArray(data)
    && Array.isArray(data.articles)
    && typeof data.updatedAt === "string";
}

function isRenderableArticle(value) {
  if (!value || typeof value !== "object") return false;
  return ["title", "summary", "source", "publishedAt", "url"].every(
    (key) => typeof value[key] === "string" && value[key].trim() !== "",
  );
}

function renderFallback(doc, source) {
  const fallback = el(doc, "div", "media-fallback");
  const mark = el(doc, "span", "media-mark");
  mark.setAttribute("aria-hidden", "true");
  const trimmed = typeof source === "string" ? source.trim() : "";
  const [first] = [...trimmed];
  mark.textContent = first || "ר";
  fallback.append(mark);
  return fallback;
}

function renderMedia(doc, source, imageUrl, index) {
  const media = el(doc, "div", "media");
  const fallback = renderFallback(doc, source);
  media.append(fallback);
  if (!imageUrl) return media;

  const img = el(doc, "img");
  img.alt = "";
  img.hidden = true;
  img.decoding = "async";
  img.loading = index === 0 ? "eager" : "lazy";
  if (index === 0) img.setAttribute("fetchpriority", "high");
  img.setAttribute("referrerpolicy", "no-referrer");
  img.addEventListener("load", () => {
    fallback.remove();
    img.hidden = false;
  });
  img.addEventListener("error", () => {
    img.remove();
  });
  img.src = imageUrl;
  media.append(img);
  return media;
}

function renderCard(doc, article, index) {
  const card = el(doc, "article", index === 0 ? "card card-lead" : "card");
  const safeUrl = toHttpsUrl(article.url);
  const imageUrl = typeof article.image === "string" ? toHttpsUrl(article.image) : null;

  card.append(renderMedia(doc, article.source, imageUrl, index));

  const body = el(doc, "div", "card-body");
  body.append(el(doc, "p", "source", article.source.trim()));

  const title = el(doc, "h2", "title");
  if (safeUrl) {
    const link = el(doc, "a");
    link.setAttribute("href", safeUrl);
    link.append(doc.createTextNode(article.title.trim()));
    link.append(el(doc, "span", "visually-hidden", " — לכתבה המלאה"));
    title.append(link);
  } else {
    title.textContent = article.title.trim();
  }
  body.append(title);
  body.append(el(doc, "p", "summary", article.summary.trim()));

  const meta = el(doc, "p", "meta");
  const published = el(doc, "time", null, `פורסם ${formatWhen(article.publishedAt)}`);
  published.setAttribute("datetime", article.publishedAt);
  meta.append(published);
  if (typeof article.eventAt === "string" && showEventDate(article.publishedAt, article.eventAt)) {
    const event = el(doc, "time", null, `מועד האירוע ${formatWhen(article.eventAt)}`);
    event.setAttribute("datetime", article.eventAt);
    meta.append(event);
  }
  body.append(meta);
  card.append(body);
  return card;
}

export function renderError(doc) {
  const dateline = doc.querySelector("#dateline");
  const issue = doc.querySelector("#issue-date");
  dateline.textContent = "מועד העדכון לא זמין";
  issue.textContent = "גיליון";
  replaceChildren(doc.querySelector("#list"));
  setStatus(
    doc,
    "לא הצלחנו לטעון את התדריך. בדקו את החיבור ורעננו את העמוד.",
    "error",
  );
}

export function renderBriefing(doc, data) {
  if (!isBriefingShape(data)) {
    renderError(doc);
    return;
  }

  const rendered = data.articles.filter(isRenderableArticle);
  const updated = formatUpdatedAt(data.updatedAt);
  const dateline = doc.querySelector("#dateline");
  const issue = doc.querySelector("#issue-date");
  const issueText = formatIssueDate(data.updatedAt);
  issue.textContent = issueText || "גיליון";

  const list = doc.querySelector("#list");
  replaceChildren(list);

  if (rendered.length === 0) {
    dateline.textContent = updated
      ? `עודכן לאחרונה: ${updated}`
      : "מועד העדכון לא זמין";
    setStatus(doc, "אין כתבות בתדריך הזה.", "empty");
    return;
  }

  const count = articleCountLabel(rendered.length);
  dateline.textContent = updated
    ? `${count} · עודכן לאחרונה: ${updated}`
    : `${count} · מועד העדכון לא זמין`;
  setStatus(doc, "", null);
  for (const [index, article] of rendered.entries()) {
    list.append(renderCard(doc, article, index));
  }
}

export async function loadBriefing(doc, fetcher) {
  setStatus(doc, "טוען את התדריך…", "loading");
  try {
    const response = await fetcher();
    if (!response || !response.ok) throw new Error("bad response");
    const data = await response.json();
    renderBriefing(doc, data);
  } catch {
    renderError(doc);
  }
}

if (typeof document !== "undefined") {
  const dataUrl = new URL("articles.json", import.meta.url);
  loadBriefing(document, () => fetch(dataUrl, { cache: "no-cache" }));
}
