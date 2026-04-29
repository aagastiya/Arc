export function formatRelativeTime(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const sec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) {
    return "just now";
  }
  if (abs < 60) {
    return rtf.format(Math.round(sec / 60), "minute");
  }
  if (abs < 3600) {
    return rtf.format(Math.round(sec / 60), "minute");
  }
  if (abs < 86400) {
    return rtf.format(Math.round(sec / 3600), "hour");
  }
  if (abs < 604800) {
    return rtf.format(Math.round(sec / 86400), "day");
  }
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}
