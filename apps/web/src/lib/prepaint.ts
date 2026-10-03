export const THEME_KEY = "retent-theme";
export const NAV_KEY = "retent-nav";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Runs in <head> before first paint: applies the saved theme and sidebar state, so neither flashes. */
export const PREPAINT_SCRIPT = `(function(){try{var e=document.documentElement;var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("${DARK_QUERY}").matches);e.dataset.theme=d?"dark":"light";if(localStorage.getItem("${NAV_KEY}")==="collapsed")e.dataset.nav="collapsed"}catch(x){}})()`;
