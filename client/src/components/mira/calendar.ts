export type ShootCalendarDetails = {
  photographerName: string;
  scheduledAt: string | Date;
  timezone: string;
  durationMinutes: number | null;
  location: string | null;
  roomUrl: string;
};

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function formatUtcDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldCalendarLine(line: string) {
  const chunks = [];
  for (let index = 0; index < line.length; index += 74) chunks.push(index === 0 ? line.slice(index, index + 74) : ` ${line.slice(index, index + 73)}`);
  return chunks.join("\r\n");
}

function eventTimes(details: ShootCalendarDetails) {
  const start = new Date(details.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  const durationMinutes = details.durationMinutes && details.durationMinutes > 0 ? details.durationMinutes : 60;
  return { start, end: new Date(start.getTime() + durationMinutes * 60_000) };
}

export function buildGoogleCalendarUrl(details: ShootCalendarDetails) {
  const times = eventTimes(details);
  if (!times) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Remote photoshoot with ${details.photographerName}`,
    dates: `${formatUtcDate(times.start)}/${formatUtcDate(times.end)}`,
    location: details.location ?? "",
    details: `Your remote photography session is confirmed.\n\nPrepare for your shoot in your private MIRA Shoot Room:\n${details.roomUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(details: ShootCalendarDetails) {
  const times = eventTimes(details);
  if (!times) return null;
  const uid = `mira-${times.start.getTime()}-${encodeURIComponent(details.photographerName)}@mira`;
  const title = escapeCalendarText(`Remote photoshoot with ${details.photographerName}`);
  const location = escapeCalendarText(details.location ?? "");
  const description = escapeCalendarText(`Your remote photography session is confirmed.\n\nPrepare for your shoot in your private MIRA Shoot Room:\n${details.roomUrl}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MIRA//Shoot Room//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatUtcDate(new Date())}`,
    `DTSTART:${formatUtcDate(times.start)}`,
    `DTEND:${formatUtcDate(times.end)}`,
    `SUMMARY:${title}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].map(foldCalendarLine).join("\r\n");
}

export function downloadIcs(details: ShootCalendarDetails) {
  const ics = buildIcs(details);
  if (!ics) return;
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "mira-shoot.ics";
  link.click();
  URL.revokeObjectURL(url);
}