(function (global) {
  'use strict';

  var SESSION_KEY = 'huahin_session';

  function saveSession(loginResponse, roles) {
    var session = {
      token: loginResponse.token,
      employeeId: loginResponse.employeeId,
      name: loginResponse.name,
      isAdmin: !!loginResponse.isAdmin,
      roles: roles || []
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        sessionStorage.setItem(SESSION_KEY, raw);
      }
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function logout() {
    var session = getSession();
    if (session && session.token) {
      fetch('https://huahin-api.huahin.workers.dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout', params: [session.token] })
      }).catch(function() {});
    }
    clearSession();
    sessionStorage.removeItem('huahin_role_override');
    window.location.href = 'index.html';
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('huahin_role_override');
  }

  function hasRole() {
    var session = getSession();
    if (!session) return false;
    var roles = session.roles || [];

    // Client-side testing override for owners
    var isOwner = roles.indexOf('owner') >= 0;
    if (isOwner) {
      var override = sessionStorage.getItem('huahin_role_override');
      if (override && override !== 'owner') {
        for (var i = 0; i < arguments.length; i++) {
          if (arguments[i] === override) return true;
        }
        return false;
      }
    }

    for (var i = 0; i < arguments.length; i++) {
      if (roles.indexOf(arguments[i]) >= 0) return true;
    }
    return false;
  }

  function saveSessionPartial(loginResponse) {
    return saveSession(loginResponse, []);
  }

  function updateSessionRoles(roles) {
    var session = getSession();
    if (!session) return null;
    session.roles = roles || [];
    var serialized = JSON.stringify(session);
    sessionStorage.setItem(SESSION_KEY, serialized);
    localStorage.setItem(SESSION_KEY, serialized);
    return session;
  }

  function requireSession() {
    var session = getSession();
    if (!session || !session.token) {
      window.location.href = 'index.html';
      return null;
    }
    return session;
  }

  function requireRole() {
    var args = Array.prototype.slice.call(arguments);
    var redirectTo = args[0] || 'index.html';
    var allowedRoles = args.slice(1);

    var session = requireSession();
    if (!session) return null;

    if (allowedRoles.length === 0) return session;

    var ok = allowedRoles.some(function (r) {
      return hasRole(r);
    });

    if (!ok) {
      window.location.href = redirectTo;
      return null;
    }
    return session;
  }

  // Inject floating view-as dropdown for owners
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function() {
      var session = getSession();
      if (session && (session.roles || []).indexOf('owner') >= 0) {
        var widget = document.createElement('div');
        widget.id = 'owner-view-as-widget';
        widget.style.position = 'fixed';
        widget.style.bottom = '10px';
        widget.style.right = '10px';
        widget.style.background = '#1F2937';
        widget.style.color = '#fff';
        widget.style.padding = '8px 12px';
        widget.style.borderRadius = '8px';
        widget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
        widget.style.zIndex = '999999';
        widget.style.fontSize = '12px';
        widget.style.fontFamily = 'sans-serif';
        widget.style.display = 'flex';
        widget.style.alignItems = 'center';
        widget.style.gap = '8px';
        widget.style.border = '1px solid #4B5563';
        widget.className = 'no-print';

        var currentOverride = sessionStorage.getItem('huahin_role_override') || 'owner';

        var label = document.createElement('span');
        label.textContent = 'View As:';
        widget.appendChild(label);

        var select = document.createElement('select');
        select.style.background = '#374151';
        select.style.color = '#fff';
        select.style.border = '1px solid #4B5563';
        select.style.borderRadius = '4px';
        select.style.padding = '2px 6px';
        select.style.cursor = 'pointer';

        var roles = [
          { val: 'owner', label: 'Owner (Default)' },
          { val: 'frontdesk', label: 'Frontdesk' },
          { val: 'accountant', label: 'Accountant' },
          { val: 'revenue', label: 'Revenue Admin' },
          { val: 'expense', label: 'Expense Admin' },
          { val: 'housekeeping', label: 'Housekeeper' }
        ];

        roles.forEach(function(r) {
          var opt = document.createElement('option');
          opt.value = r.val;
          opt.textContent = r.label;
          if (r.val === currentOverride) opt.selected = true;
          select.appendChild(opt);
        });

        select.onchange = function() {
          sessionStorage.setItem('huahin_role_override', select.value);
          window.location.reload();
        };

        widget.appendChild(select);
        document.body.appendChild(widget);
      }
    });
  }

  // Intercept global fetch to handle session expiration globally
  if (typeof window !== 'undefined' && window.fetch) {
    var originalFetch = window.fetch;
    window.fetch = function () {
      return originalFetch.apply(this, arguments).then(function (response) {
        if (response && response.clone) {
          var clone = response.clone();
          return clone.json().then(function (data) {
            if (data && data.ok === false && (data.error === 'Session expired.' || data.error === 'Session expired. Please log in again.')) {
              clearSession();
              if (!window.sessionExpiredAlerted) {
                window.sessionExpiredAlerted = true;
                alert('Session expired. Redirecting to login page.');
                window.location.href = 'index.html';
              }
            }
            return response;
          }).catch(function () {
            return response;
          });
        }
        return response;
      });
    };
  }

  global.HuaHinSession = {
    saveSession: saveSession,
    saveSessionPartial: saveSessionPartial,
    updateSessionRoles: updateSessionRoles,
    getSession: getSession,
    logout: logout,
    clearSession: clearSession,
    hasRole: hasRole,
    requireSession: requireSession,
    requireRole: requireRole
  };
})(window);
