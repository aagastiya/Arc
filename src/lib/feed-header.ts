/** Time-of-day greeting for the Today feed header (local time). */
export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 11) {
    return "Good Morning";
  }
  if (hour >= 12 && hour <= 16) {
    return "Good Afternoon";
  }
  if (hour >= 17 && hour <= 20) {
    return "Good Evening";
  }
  return "Good Night";
}

function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** e.g. "SUN 17th MAY" */
export function formatDatePill(date: Date = new Date()): string {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = date.getDate();
  return `${weekday} ${day}${ordinalSuffix(day)} ${month}`;
}

/** OpenWeather `main` condition → display emoji. */
export function weatherIconForCondition(condition: string): string {
  switch (condition) {
    case "Clear":
      return "☀️";
    case "Clouds":
      return "☁️";
    case "Rain":
    case "Drizzle":
      return "🌧️";
    case "Snow":
      return "❄️";
    case "Thunderstorm":
      return "⛈️";
    case "Mist":
    case "Fog":
    case "Haze":
    case "Smoke":
      return "🌫️";
    default:
      return "☀️";
  }
}

export const DELHI_FALLBACK_COORDS = { lat: 28.7041, lon: 77.1025 };
