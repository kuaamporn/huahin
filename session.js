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
    return session;
  }

  function getSession() {
    var raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
    clearSession: clearSession,
    hasRole: hasRole,
    requireSession: requireSession,
    requireRole: requireRole
  };
})(window);
