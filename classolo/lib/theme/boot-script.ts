/** localStorage key。设置页覆盖「跟随系统」时写入 `light` | `dark`，删除或 `system` 即跟随 OS。 */
export const THEME_STORAGE_KEY = 'classolo-theme'

export type ThemePreference = 'system' | 'light' | 'dark'

/** 阻塞式内联脚本：首屏前给 html 打上 .light / .dark，避免跟随系统时闪一下。 */
export const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k)||'light';var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(dark?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`
