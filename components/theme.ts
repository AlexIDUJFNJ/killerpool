/**
 * Theme preference: stored per device, applied before the first paint.
 *
 * Deliberately not a client module — the root layout (a server component)
 * reads THEME_SCRIPT from here as a plain string. Only `.dark` on <html>
 * matters; :root already carries the light palette (app/globals.css).
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'killerpool-theme'
/** The app has always opened dark when nothing is stored */
export const DEFAULT_THEME: ThemePreference = 'dark'
export const THEME_CHANGE_EVENT = 'killerpool-theme-change'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Inline <head> script. It has to be self-contained — it runs before any
 * bundle has loaded — so it repeats resolveTheme/applyTheme in plain ES5
 * (components/__tests__/theme.test.ts checks the two agree). Besides the
 * first paint it keeps the page in step afterwards: a change of the system
 * setting while "system" is chosen, and a choice made in another tab.
 */
export const THEME_SCRIPT = `(function(){
var KEY=${JSON.stringify(THEME_STORAGE_KEY)},DEF=${JSON.stringify(DEFAULT_THEME)};
var root=document.documentElement;
var mq=window.matchMedia?window.matchMedia(${JSON.stringify(DARK_QUERY)}):null;
function pref(){try{var v=localStorage.getItem(KEY);if(v==='light'||v==='dark'||v==='system')return v}catch(e){}return DEF}
function apply(){var p=pref();var dark=p==='dark'||(p==='system'&&!!mq&&mq.matches);
if(dark){root.classList.add('dark')}else{root.classList.remove('dark')}
root.style.colorScheme=dark?'dark':'light'}
apply();
function onSystem(){if(pref()==='system')apply()}
if(mq){if(mq.addEventListener){mq.addEventListener('change',onSystem)}else if(mq.addListener){mq.addListener(onSystem)}}
window.addEventListener('storage',function(e){if(e.key===KEY)apply()});
})()`

// Used when localStorage throws (blocked storage, some private modes), so a
// choice still sticks for the rest of the visit
let memoryPreference: ThemePreference | null = null

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemePreference(stored)) return stored
  } catch {
    // fall through to the in-memory choice
  }
  return memoryPreference ?? DEFAULT_THEME
}

export function applyTheme(preference: ThemePreference): void {
  const systemPrefersDark =
    typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
  const dark = resolveTheme(preference, systemPrefersDark) === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export function setThemePreference(preference: ThemePreference): void {
  memoryPreference = preference
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // keep the in-memory choice
  }
  applyTheme(preference)
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}
