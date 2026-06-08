/**
 * Focuser i18n — Lightweight internationalization module.
 *
 * - Translation files live in `i18n/<locale>.json`
 * - Locale preference is stored via the Rust backend (`ui_language` setting)
 * - Falls back to English for missing keys
 * - Supports parameter interpolation: t('key', { count: 5 })
 */

var i18n = {
  _locale: 'en',
  _translations: {},
  _loaded: false,

  /** Current locale code (e.g., 'en', 'zh'). */
  get locale() {
    return i18n._locale;
  },

  /** Set the locale and persist the preference. Returns a Promise. */
  setLocale: async function(locale) {
    // Load the translation file
    try {
      var resp = await fetch('i18n/' + locale + '.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      i18n._translations = await resp.json();
      i18n._locale = locale;
      i18n._loaded = true;

      // Persist to backend
      try {
        await invoke('set_setting', { key: 'ui_language', value: locale });
      } catch (e) {
        // Non-Tauri context — store in localStorage as fallback
        try { localStorage.setItem('focuser-locale', locale); } catch (_) {}
      }

      // Update HTML lang attribute
      document.documentElement.lang = locale;

      // Re-render the entire UI
      i18n._applyToDOM();
      if (typeof ui !== 'undefined' && ui.navigateTo) {
        ui.navigateTo(state.currentPage || 'dashboard');
      }

      return true;
    } catch (e) {
      console.error('i18n: failed to load locale ' + locale + ' — ' + e);
      return false;
    }
  },

  /**
   * Translate a key. Supports dot-separated nested keys and parameter
   * interpolation via `{{name}}` placeholders.
   *
   *   t('dashboard.title')              → 'Dashboard'
   *   t('stats.count', { n: 5 })        → '5 blocked'
   */
  t: function(key, params) {
    params = params || {};

    // Walk nested keys
    var parts = key.split('.');
    var value = i18n._translations;
    for (var i = 0; i < parts.length; i++) {
      if (value === null || value === undefined) break;
      value = value[parts[i]];
    }

    if (typeof value !== 'string') {
      // Fallback: return the key itself (strip prefix for readability)
      return key.replace(/^.*\./, '');
    }

    // Interpolate parameters
    return value.replace(/\{\{(\w+)\}\}/g, function(_, name) {
      return params[name] !== undefined ? params[name] : '{{' + name + '}}';
    });
  },

  /** Check if a translation key exists. */
  has: function(key) {
    var parts = key.split('.');
    var value = i18n._translations;
    for (var i = 0; i < parts.length; i++) {
      if (value === null || value === undefined) return false;
      value = value[parts[i]];
    }
    return typeof value === 'string';
  },

  /**
   * Apply translations to DOM elements with `data-i18n` attributes.
   * Also handles `data-i18n-placeholder`, `data-i18n-title`, and
   * `data-i18n-html` attributes.
   */
  _applyToDOM: function() {
    // data-i18n → textContent
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = i18n.t(key);
    });

    // data-i18n-placeholder → placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = i18n.t(key);
    });

    // data-i18n-title → title
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-title');
      if (key) el.title = i18n.t(key);
    });

    // data-i18n-html → innerHTML
    document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = i18n.t(key);
    });

    // Refresh Lucide icons if available
    if (typeof refreshIcons === 'function') refreshIcons();
  },

  /**
   * Initialize i18n: load saved locale or detect from browser.
   * Must be called before any UI rendering.
   */
  init: async function() {
    var locale = null;

    // 1. Try backend setting
    try {
      locale = await invoke('get_setting', { key: 'ui_language', default: '' });
    } catch (e) {
      // 2. Try localStorage fallback
      try { locale = localStorage.getItem('focuser-locale'); } catch (_) {}
    }

    // 3. Detect from browser
    if (!locale) {
      var nav = navigator.language || '';
      if (nav.startsWith('zh')) {
        locale = 'zh';
      } else {
        locale = 'en';
      }
    }

    // Normalize to supported locales
    if (locale !== 'zh' && locale !== 'en') {
      locale = 'en';
    }

    // Load translations
    try {
      var resp = await fetch('i18n/' + locale + '.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      i18n._translations = await resp.json();
      i18n._locale = locale;
      i18n._loaded = true;
      document.documentElement.lang = locale;
    } catch (e) {
      console.error('i18n: failed to load initial locale ' + locale + ' — ' + e);
      // Load English as ultimate fallback
      try {
        var fallback = await fetch('i18n/en.json');
        if (fallback.ok) {
          i18n._translations = await fallback.json();
          i18n._locale = 'en';
          i18n._loaded = true;
          document.documentElement.lang = 'en';
        }
      } catch (_) {}
    }
  }
};

// Shorthand: expose `t` globally for convenience throughout app.js
function t(key, params) {
  return i18n.t(key, params);
}
