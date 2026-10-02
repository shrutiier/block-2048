export interface Settings { sfxVolume: number; musicVolume: number }

const SETTINGS_KEY = 'block-2048:settings';
const PROGRESS_KEY = 'block-2048:best-score';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: keep in memory */ }
}

export const loadSettings = (): Settings => read(SETTINGS_KEY, { sfxVolume: 0.8, musicVolume: 0.3 });
export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

export const loadBest = (): number => read(PROGRESS_KEY, { score: 0 }).score;

export function recordGame(score: number): number {
  const best = Math.max(loadBest(), score);
  write(PROGRESS_KEY, { score: best });
  return best;
}
