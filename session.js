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
    window.location.href = 'index.html';
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }

  function hasRole() {
    var session = getSession();
    if (!session) return false;
    var roles = session.roles || [];
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
      return (session.roles || []).indexOf(r) >= 0;
    });

    if (!ok) {
      window.location.href = redirectTo;
      return null;
    }
    return session;
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
