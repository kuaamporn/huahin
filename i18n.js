/* i18n.js — EN/TH engine for the staff pages.
 *
 * Include in <head> on every staff page, BEFORE session.js and the page script:
 *   <script src="i18n.js"></script>
 *
 * It is a plain <script>, not a fetched .json, on purpose: the dictionary is in
 * memory before the body renders, so there is no flash of the wrong language and
 * no extra request. See docs/design-staff-bilingual-nav.md §5.5.
 *
 * API (window.HuaHinI18n, plus t/applyI18n as globals for brevity in pages):
 *   t(key)             -> string in the active language
 *   lang()             -> 'en' | 'th'
 *   setLang(l)         -> persists the choice on this device and re-applies
 *   applyI18n(root)    -> fills [data-i18n] / [data-i18n-attr] under root
 *   onLangChange(fn)   -> called after setLang, for pages that re-render manually
 *
 * Markup:
 *   <span data-i18n="nav.rooms"></span>
 *   <input data-i18n-attr="placeholder:login.username_ph">
 *
 * Slice 1 ships the nav/chrome vocabulary only. Page bodies keep their hardcoded
 * Thai until their own slice adds their keys here.
 */
(function (global) {
  'use strict';
  if (global.HuaHinI18n) return;

  var LANG_KEY = 'huahin_lang';
  var SESSION_KEY = 'huahin_session';
  var FALLBACK = 'th';

  var DICT = {
    en: {
      'nav.home': 'Home',
      'nav.rooms': 'Rooms',
      'nav.finance': 'Finance',
      'nav.billing': 'Billing',
      'nav.reconcile': 'Reconcile',
      'nav.hr': 'HR',
      'nav.reports': 'Reports',
      'nav.dashboard': 'Dashboard',
      'nav.settings': 'Settings',
      'nav.manual': '📖 คู่มือ',
      'nav.signout': 'Sign out',
      'nav.lang_en': 'EN',
      'nav.lang_th': 'ไทย',
      'nav.lang_switch': 'Change language',
      'hr.emp_lang': 'Language',
      'hr.emp_lang_none': '— default (Thai) —'
    },
    th: {
      'nav.home': 'ลงเวลา',
      'nav.rooms': 'ผังห้องพัก',
      'nav.finance': 'การเงิน',
      'nav.billing': 'วางบิล',
      'nav.reconcile': 'กระทบยอด',
      'nav.hr': 'บุคคล',
      'nav.reports': 'รายงาน',
      'nav.dashboard': 'แดชบอร์ด',
      'nav.settings': 'ตั้งค่า',
      // The manual is Thai-only by decision (design doc §1), so its label stays
      // Thai in English mode too — it points at a Thai document.
      'nav.manual': '📖 คู่มือ',
      'nav.signout': 'ออกจากระบบ',
      'nav.lang_en': 'EN',
      'nav.lang_th': 'ไทย',
      'nav.lang_switch': 'เปลี่ยนภาษา',
      'hr.emp_lang': 'ภาษา',
      'hr.emp_lang_none': '— ค่าเริ่มต้น (ไทย) —'
    }
  };

  function sessionLang() {
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem(SESSION_KEY);
      if (!raw && global.localStorage) raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && (s.lang === 'en' || s.lang === 'th')) ? s.lang : null;
    } catch (e) { return null; }
  }

  // Precedence: this device's own choice > HR's default > Thai.
  function lang() {
    try {
      var own = global.localStorage && global.localStorage.getItem(LANG_KEY);
      if (own === 'en' || own === 'th') return own;
    } catch (e) { /* private mode */ }
    return sessionLang() || FALLBACK;
  }

  var listeners = [];
  function onLangChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  function setLang(l) {
    if (l !== 'en' && l !== 'th') return;
    try { global.localStorage.setItem(LANG_KEY, l); } catch (e) { /* private mode */ }
    if (global.document) {
      applyI18n(global.document);
      var html = global.document.documentElement;
      if (html) html.setAttribute('lang', l);
    }
    listeners.forEach(function (fn) { try { fn(l); } catch (e) {} });
  }

  // Never blank, never a raw key on screen: active language, then the other one,
  // then the key itself so a typo is visible in testing rather than invisible.
  function t(key) {
    var l = lang();
    var other = l === 'en' ? 'th' : 'en';
    if (DICT[l] && Object.prototype.hasOwnProperty.call(DICT[l], key)) return DICT[l][key];
    if (DICT[other] && Object.prototype.hasOwnProperty.call(DICT[other], key)) return DICT[other][key];
    return key;
  }

  function applyI18n(root) {
    root = root || global.document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      // "placeholder:login.username_ph" or several, comma-separated
      el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i < 0) return;
        el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
  }

  global.HuaHinI18n = {
    t: t, lang: lang, setLang: setLang, applyI18n: applyI18n,
    onLangChange: onLangChange, DICT: DICT
  };
  global.t = t;
  global.applyI18n = applyI18n;

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('DOMContentLoaded', function () {
      var html = global.document.documentElement;
      if (html) html.setAttribute('lang', lang());
      applyI18n(global.document);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
