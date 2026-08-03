/* nav.js — the one staff nav, rendered on every page.
 *
 * Include after session.js and i18n.js, then give the page's existing nav
 * container id="hh-nav" and call:
 *   HuaHinNav.renderNav('finance');
 *
 * Why it fills an existing container rather than creating one: the nine pages use
 * five different wrappers (.toplinks, .topbar-links, .userbar-nav, .dash-nav-links,
 * .nav) with their own flex/spacing CSS. Keeping the wrapper means each page's
 * layout still works and only the link list is unified. Pass linkClass for pages
 * whose CSS targets a class instead of the bare <a> (rooms.html uses .nav-link).
 *
 * Replaces nine hand-written navs that disagreed on membership, order, ids and
 * labels — and, on dashboard.html and reconcile.html, applied no role gating at
 * all. See docs/design-staff-bilingual-nav.md §5.3.
 */
(function (global) {
  'use strict';
  if (global.HuaHinNav) return;

  // Order and gates are the single source of truth for all nine pages.
  // Gates are lifted verbatim from what was live before slice 1, minus the
  // revenue/expense roles that migration_28 removed.
  var NAV_ITEMS = [
    { id: 'home',      href: 'index.html',     key: 'nav.home',      roles: null },
    { id: 'account',   href: 'index.html#account', key: 'nav.account', roles: null },
    { id: 'rooms',     href: 'rooms.html',     key: 'nav.rooms',     roles: ['owner', 'frontdesk'] },
    { id: 'finance',   href: 'finance.html',   key: 'nav.finance',   roles: ['owner', 'accountant', 'frontdesk'] },
    { id: 'billing',   href: 'billing.html',   key: 'nav.billing',   roles: ['owner', 'accountant'] },
    { id: 'reconcile', href: 'reconcile.html', key: 'nav.reconcile', roles: ['owner', 'accountant'] },
    { id: 'hr',        href: 'hr.html',        key: 'nav.hr',        roles: ['owner', 'frontdesk'] },
    { id: 'reports',   href: 'report.html',    key: 'nav.reports',   roles: ['owner', 'frontdesk'] },
    { id: 'dashboard', href: 'dashboard.html', key: 'nav.dashboard', roles: ['owner'] },
    { id: 'settings',  href: 'setting.html',   key: 'nav.settings',  roles: ['owner'] },
    // Thai-only document by decision — label stays Thai in both languages.
    { id: 'manual',    href: 'staff_manual.html', key: 'nav.manual', roles: null }
  ];

  var CSS = ''
    + '#hh-nav .hh-nav-active{color:var(--go,#0F766E);font-weight:600;}'
    + '#hh-nav .hh-lang{margin-left:auto;display:inline-flex;align-items:center;gap:4px;'
      + 'font-size:13px;white-space:nowrap;}'
    + '#hh-nav .hh-lang button{border:none;background:none;padding:2px 4px;cursor:pointer;'
      + 'font:inherit;color:var(--muted,#86868B);border-radius:4px;}'
    + '#hh-nav .hh-lang button:hover{color:var(--ink,#1D1D1F);}'
    + '#hh-nav .hh-lang button[aria-pressed="true"]{color:var(--go,#0F766E);font-weight:700;'
      + 'cursor:default;}'
    + '#hh-nav .hh-lang .hh-sep{color:var(--line,#E5E5EA);}';

  function injectStyle(doc) {
    if (doc.getElementById('hh-nav-style')) return;
    var s = doc.createElement('style');
    s.id = 'hh-nav-style';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function visibleItems(hasRole) {
    return NAV_ITEMS.filter(function (item) {
      return !item.roles || hasRole.apply(null, item.roles);
    });
  }

  function langSwitch(doc, t, current, onPick) {
    var wrap = doc.createElement('span');
    wrap.className = 'hh-lang';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', t('nav.lang_switch'));
    ['en', 'th'].forEach(function (l, i) {
      if (i) {
        var sep = doc.createElement('span');
        sep.className = 'hh-sep';
        sep.textContent = '|';
        wrap.appendChild(sep);
      }
      var b = doc.createElement('button');
      b.type = 'button';
      b.textContent = t(l === 'en' ? 'nav.lang_en' : 'nav.lang_th');
      b.setAttribute('aria-pressed', String(l === current));
      b.setAttribute('lang', l);
      if (l !== current) b.addEventListener('click', function () { onPick(l); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  // Both arguments default from the container's data-page / data-link-class, so a
  // page needs no JS wiring at all — just the container. Pages whose session is
  // established after load (index.html, post-login) call renderNav() again.
  function renderNav(current, linkClass) {
    var doc = global.document;
    var host = doc && doc.getElementById('hh-nav');
    if (!host) return null;
    var i18n = global.HuaHinI18n;
    var sess = global.HuaHinSession;
    if (!i18n || !sess) return null;
    if (current == null) current = host.getAttribute('data-page') || '';
    if (linkClass == null) linkClass = host.getAttribute('data-link-class') || '';

    injectStyle(doc);
    host.innerHTML = '';

    visibleItems(sess.hasRole).forEach(function (item) {
      var a = doc.createElement('a');
      a.href = item.href;
      a.id = 'link-' + item.id;
      a.textContent = i18n.t(item.key);
      if (linkClass) a.className = linkClass;
      if (item.id === current) {
        a.className = (a.className ? a.className + ' ' : '') + 'hh-nav-active';
        a.setAttribute('aria-current', 'page');
      }
      host.appendChild(a);
    });

    host.appendChild(langSwitch(doc, i18n.t, i18n.lang(), function (l) {
      i18n.setLang(l);
      renderNav(current, linkClass);
    }));

    return host;
  }

  global.HuaHinNav = { renderNav: renderNav, NAV_ITEMS: NAV_ITEMS };

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('DOMContentLoaded', function () { renderNav(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
