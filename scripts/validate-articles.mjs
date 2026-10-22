import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { isIsoDateTime, isPublicationDate } from "../format.js";
import { normalizeLink, toHttpsUrl } from "../links.js";

const schema = JSON.parse(
  readFileSync(new URL("../schema/articles.schema.json", import.meta.url), "utf8"),
);
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;
const DATETIME_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function formatAjvError(error) {
  const path = error.instancePath || "/";
  if (error.keyword === "required") {
    return `${path} is missing "${error.params.missingProperty}"`;
  }
  if (error.keyword === "additionalProperties") {
    return `${path} has unknown field "${error.params.additionalProperty}"`;
  }
  if (error.keyword === "minLength") {
    return `${path} must not be empty`;
  }
  if (error.keyword === "type") {
    return `${path} must be ${error.params.type}`;
  }
  if (error.keyword === "pattern" && path.endsWith("updatedAt")) {
    return `${path} must be an RFC 3339 date-time with a timezone`;
  }
  if (error.keyword === "pattern" && (path.endsWith("publishedAt") || path.endsWith("eventAt"))) {
    return `${path} must be a YYYY-MM-DD date or an RFC 3339 date-time with a timezone`;
  }
  if (error.keyword === "pattern" && (path.endsWith("url") || path.endsWith("image"))) {
    return `${path} must be an https URL`;
  }
  return `${path} ${error.message}`;
}

function checkDate(path, value, kind, errors) {
  if (typeof value !== "string") return;
  const shape = kind === "date-time" ? DATETIME_SHAPE : DATE_SHAPE;
  if (!shape.test(value)) return;
  const valid = kind === "date-time" ? isIsoDateTime(value) : isPublicationDate(value);
  if (!valid) errors.push(`${path} is not a valid calendar date`);
}

function checkHttps(path, value, errors) {
  if (typeof value !== "string" || !/^https:\/\/\S+$/.test(value)) return;
  if (!toHttpsUrl(value)) errors.push(`${path} must be a usable https URL`);
}

export function validateBriefing(data) {
  const errors = [];
  if (!validate(data)) {
    for (const error of validate.errors) errors.push(formatAjvError(error));
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: errors.length === 0, errors };
  }

  checkDate("/updatedAt", data.updatedAt, "date-time", errors);

  if (!Array.isArray(data.articles)) {
    return { ok: errors.length === 0, errors };
  }

  const seen = new Map();
  data.articles.forEach((article, index) => {
    if (!article || typeof article !== "object" || Array.isArray(article)) return;
    const base = `/articles/${index}`;
    for (const field of ["title", "summary", "source"]) {
      if (typeof article[field] === "string" && article[field].trim() === "") {
        errors.push(`${base}/${field} must not be blank`);
      }
    }
    checkDate(`${base}/publishedAt`, article.publishedAt, "date", errors);
    if (Object.hasOwn(article, "eventAt")) {
      checkDate(`${base}/eventAt`, article.eventAt, "date", errors);
    }
    checkHttps(`${base}/url`, article.url, errors);
    if (Object.hasOwn(article, "image")) checkHttps(`${base}/image`, article.image, errors);

    const normalized = normalizeLink(article.url);
    if (!normalized) return;
    if (seen.has(normalized)) {
      errors.push(
        `${base}/url duplicates /articles/${seen.get(normalized)}/url after normalization (${normalized})`,
      );
    } else {
      seen.set(normalized, index);
    }
  });

  return { ok: errors.length === 0, errors };
}

export function validateJsonText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${error.message}`] };
  }
  return validateBriefing(data);
}

function main() {
  const file = process.argv[2];
  if (!file || process.argv.length > 3) {
    console.error("Usage: node scripts/validate-articles.mjs <articles.json>");
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    console.error(`Cannot read ${file}: ${error.message}`);
    process.exit(1);
  }
  const result = validateJsonText(text);
  if (!result.ok) {
    console.error(`${file} is invalid:`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const data = JSON.parse(text);
  console.log(`${file}: ${data.articles.length} articles, updatedAt ${data.updatedAt}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
