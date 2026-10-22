// Date display for the briefing. All instants are shown in Asia/Jerusalem.
// A date-only value (YYYY-MM-DD) is that calendar date, anchored at noon UTC
// so Israel time (UTC+2/+3) does not move it to the previous day.

export const TIME_ZONE = "Asia/Jerusalem";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/;

function validYmd(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  if (!match) return false;
  return validYmd(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function isIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const match = DATETIME.exec(value);
  if (!match) return false;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!validYmd(Number(match[1]), Number(match[2]), Number(match[3]))) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (match[8] !== "Z") {
    const tzHour = Number(match[9]);
    const tzMinute = Number(match[10]);
    if (tzHour > 23 || tzMinute > 59) return false;
  }
  return !Number.isNaN(Date.parse(value));
}

export function isPublicationDate(value) {
  return isIsoDate(value) || isIsoDateTime(value);
}

export function parseBriefingDate(value) {
  if (isIsoDate(value)) return new Date(`${value}T12:00:00Z`);
  if (isIsoDateTime(value)) return new Date(value);
  return null;
}

const dateOnlyFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const issueFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const updatedFormat = new Intl.DateTimeFormat("he-IL", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatWhen(value) {
  const date = parseBriefingDate(value);
  if (!date) return "תאריך לא זמין";
  const withTime = typeof value === "string" && value.includes("T");
  return (withTime ? dateTimeFormat : dateOnlyFormat).format(date);
}

export function formatUpdatedAt(value) {
  if (!isIsoDateTime(value)) return "";
  return updatedFormat.format(new Date(value));
}

export function formatIssueDate(value) {
  if (!isIsoDateTime(value)) return "";
  return issueFormat.format(new Date(value));
}

// Show the event date when it adds information: a different Jerusalem
// calendar day, or a different clock time when both values include a time.
export function showEventDate(published, event) {
  if (!isPublicationDate(published) || !isPublicationDate(event)) return false;
  const publishedDate = parseBriefingDate(published);
  const eventDate = parseBriefingDate(event);
  if (!publishedDate || !eventDate) return false;
  const sameDay = dayKeyFormat.format(publishedDate) === dayKeyFormat.format(eventDate);
  const bothTimes = published.includes("T") && event.includes("T");
  if (bothTimes) return publishedDate.getTime() !== eventDate.getTime();
  return !sameDay;
}

export function articleCountLabel(count) {
  if (count === 1) return "כתבה אחת";
  return `${count} כתבות`;
}
