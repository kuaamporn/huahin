
    // =====================================================================
    // CONFIG — paste your Cloudflare Worker URL here
    // (looks like https://employee-checkin-api.YOURNAME.workers.dev)
    // =====================================================================
    var WORKER_API_URL = 'https://employee-checkin-api.huahin.workers.dev';

    var sessionToken = null;
    var currentEmployeeName = null;
    var scannedOfficeId = null;
    var lastKnownPosition = null;
    var html5QrCode = null;

    function show(id) { document.getElementById(id).classList.remove('hidden'); }
    function hide(id) { document.getElementById(id).classList.add('hidden'); }

    function applyNavLinkVisibility() {
      if (HuaHinSession.hasRole('owner', 'frontdesk')) show('rooms-link');
      if (HuaHinSession.hasRole('owner', 'accountant', 'revenue', 'expense')) show('finance-link');
      if (HuaHinSession.hasRole('owner')) show('dashboard-link');
    }

    var session = HuaHinSession.getSession();
    if (session && session.token) {
      sessionToken = session.token;
      currentEmployeeName = session.name;
      document.getElementById('welcome-name').textContent = 'Hi, ' + session.name;
      hide('login-screen');
      show('main-screen');
      applyNavLinkVisibility();
      loadEmployeeTasks();
      loadTodayStatus();
    }

    function getDeviceId() {
      // Simple persistent device fingerprint stored in localStorage.
      // NOTE: this is a soft signal only, not a security boundary —
      // true device attestation needs a native app (Play Integrity API).
      var key = 'checkin_device_id';
      var id = localStorage.getItem(key);
      if (!id) {
        id = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(key, id);
      }
      return id;
    }

    /**
     * Hashes the password in the BROWSER before it's sent, using the
     * Web Crypto API (built into every modern browser, no library
     * needed). Even though the Cloudflare Worker accepts a normal POST
     * body (not a URL query string), hashing client-side is still good
     * practice: the raw password never leaves the device, and the
     * server's own salted hash is applied on top of this value.
     */
    function clientHashPassword(password) {
      var encoder = new TextEncoder();
      var data = encoder.encode(password);
      return crypto.subtle.digest('SHA-256', data).then(function(hashBuffer) {
        var hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }

    /**
     * Calls the Cloudflare Worker backend with a normal fetch() POST.
     *
     * WHY THIS WORKS (unlike the old Google Apps Script backend):
     * The Worker explicitly sets Access-Control-Allow-Origin on every
     * response (see corsHeaders() in worker.js), so the browser allows
     * this page to read the response. No JSONP, no GET-with-query-string
     * workaround needed — this is what a normal API call looks like.
     */
    function callApi(action, params) {
      return fetch(WORKER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, params: params || [] })
      }).then(function(res) {
        return res.json();
      });
    }

    // ---------- LOGIN ----------
    document.getElementById('login-btn').addEventListener('click', function() {
      var username = document.getElementById('username').value.trim();
      var password = document.getElementById('password').value;
      hide('login-error');
      if (!username || !password) {
        document.getElementById('login-error').textContent = 'Enter your username and password.';
        show('login-error');
        return;
      }
      var btn = document.getElementById('login-btn');
      btn.disabled = true;
      btn.textContent = 'Signing in...';

      clientHashPassword(password).then(function(hashedPassword) {
        return callApi('login', [username, hashedPassword]);
      }).then(function(res) {
        btn.disabled = false;
        btn.textContent = 'Sign in';
        if (res.ok) {
          sessionToken = res.token;
          currentEmployeeName = res.name;
          document.getElementById('welcome-name').textContent = 'Hi, ' + res.name;

          HuaHinSession.saveSessionPartial(res);
          callApi('adminListEmployeesWithRoles', [sessionToken]).then(function(rolesRes) {
            var myRoles = [];
            if (rolesRes.ok) {
              var me = rolesRes.employees.filter(function(e) { return e.employeeId === res.employeeId; })[0];
              myRoles = (me && me.roles) ? me.roles : [];
            }
            HuaHinSession.updateSessionRoles(myRoles);
            applyNavLinkVisibility();
            loadEmployeeTasks();
            loadTodayStatus();
          }).catch(function() {
            HuaHinSession.updateSessionRoles([]);
            applyNavLinkVisibility();
            loadEmployeeTasks();
            loadTodayStatus();
            applyNavLinkVisibility();
            loadEmployeeTasks();
          });

          hide('login-screen');
          show('main-screen');
        } else {
          document.getElementById('login-error').textContent = res.error;
          show('login-error');
        }
      }).catch(function(err) {
        btn.disabled = false;
        btn.textContent = 'Sign in';
        document.getElementById('login-error').textContent = 'Connection error: ' + err.message;
        show('login-error');
      });
    });

    document.getElementById('logout-link').addEventListener('click', function(e) {
      e.preventDefault();
      if (html5QrCode) { try { html5QrCode.stop(); } catch (e) {} }
      callApi('logout', [sessionToken]).catch(function() {});
      HuaHinSession.clearSession();
      sessionToken = null;
      location.reload();
    });

    // ---------- CAMERA PERMISSION + QR SCANNING ----------
    document.getElementById('start-camera-btn').addEventListener('click', requestCameraAndStart);

    function requestCameraAndStart() {
      hide('camera-error');
      hide('manual-entry-card');
      var btn = document.getElementById('start-camera-btn');
      btn.disabled = true;
      btn.textContent = 'Requesting camera access...';

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        btn.disabled = false;
        btn.textContent = 'Tap to start camera';
        showCameraError('This browser does not support camera access here. Use the manual code option below.');
        show('manual-entry-card');
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(function(stream) {
          stream.getTracks().forEach(function(track) { track.stop(); });
          btn.disabled = false;
          hide('start-camera-btn');
          startScanner();
        })
        .catch(function(err) {
          btn.disabled = false;
          btn.textContent = 'Tap to start camera';
          if (err.name === 'NotAllowedError') {
            showCameraError(
              'Camera permission was denied. Tap the lock/info icon next to the address bar, ' +
              'open Site settings, set Camera to Allow, then reload this page and try again.'
            );
          } else if (err.name === 'NotFoundError') {
            showCameraError('No camera was found on this device.');
          } else if (err.name === 'NotReadableError') {
            showCameraError('The camera is already in use by another app. Close other camera apps and try again.');
          } else {
            showCameraError('Camera error: ' + err.message + '. You can use the manual code option below instead.');
          }
          show('manual-entry-card');
        });
    }

    function showCameraError(message) {
      var el = document.getElementById('camera-error');
      el.textContent = message;
      show('camera-error');
    }

    function startScanner() {
      hide('confirm-card');
      show('qr-reader');
      document.getElementById('qr-status').textContent = 'Point your camera at the office QR code.';
      html5QrCode = new Html5Qrcode('qr-reader');
      html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 230 },
        onScanSuccess,
        function() { /* ignore per-frame scan errors */ }
      ).catch(function(err) {
        document.getElementById('qr-status').textContent = '';
        hide('qr-reader');
        showCameraError('Could not start the camera: ' + err + '. You can use the manual code option below instead.');
        show('manual-entry-card');
      });
    }

    function onScanSuccess(decodedText) {
      var data;
      try {
        data = JSON.parse(decodedText);
      } catch (e) {
        document.getElementById('qr-status').textContent = 'That QR code is not a valid check-in code.';
        return;
      }
      if (!data.officeId) {
        document.getElementById('qr-status').textContent = 'That QR code is not a valid check-in code.';
        return;
      }
      scannedOfficeId = data.officeId;

      html5QrCode.stop().catch(function() {});
      hide('qr-reader');
      document.getElementById('qr-status').textContent = 'Code scanned. Getting your location...';
      show('rescan-btn');
      getLocationAndConfirm();
    }

    document.getElementById('rescan-btn').addEventListener('click', function() {
      hide('rescan-btn');
      hide('confirm-card');
      startScanner();
    });

    // ---------- MANUAL OFFICE CODE FALLBACK ----------
    document.getElementById('manual-submit-btn').addEventListener('click', function() {
      var code = document.getElementById('manual-office-code').value.trim().toUpperCase();
      if (!code) return;
      scannedOfficeId = code;
      hide('manual-entry-card');
      document.getElementById('qr-status').textContent = 'Code entered. Getting your location...';
      show('rescan-btn');
      getLocationAndConfirm();
    });

    // ---------- GEOLOCATION ----------
    function getLocationAndConfirm() {
      if (!navigator.geolocation) {
        document.getElementById('qr-status').textContent = 'Your browser does not support location services.';
        return;
      }
      navigator.geolocation.getCurrentPosition(function(pos) {
        lastKnownPosition = pos;
        document.getElementById('qr-status').textContent = '';
        document.getElementById('confirm-office').textContent = 'Ready to record your check-in/out.';
        document.getElementById('confirm-loc').textContent =
          'Location accuracy: ' + Math.round(pos.coords.accuracy) + 'm';
        show('confirm-card');
        hide('checkin-error');
        hide('checkin-success');
      }, function(err) {
        document.getElementById('qr-status').textContent =
          'Could not get your location (' + err.message + '). Enable location services and tap "Scan again".';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }

    // ---------- CHECK IN / OUT ----------
    function submitCheck(type) {
      if (!lastKnownPosition) return;
      hide('checkin-error');
      hide('checkin-success');
      var btn = type === 'IN' ? document.getElementById('checkin-btn') : document.getElementById('checkout-btn');
      btn.disabled = true;
      btn.textContent = 'Recording...';

      callApi('checkIn', [
        sessionToken,
        type,
        scannedOfficeId,
        lastKnownPosition.coords.latitude,
        lastKnownPosition.coords.longitude,
        lastKnownPosition.coords.accuracy,
        getDeviceId()
      ]).then(function(res) {
        btn.disabled = false;
        btn.textContent = type === 'IN' ? 'Check In' : 'Check Out';
        if (res.ok) {
          var msg = 'Checked ' + (type === 'IN' ? 'in' : 'out') + ' at ' + res.officeName + '.';
          if (res.flagged) {
            msg += ' (Flagged for review: ' + res.reasons.join('; ') + ')';
          }
          document.getElementById('checkin-success').textContent = msg;
          show('checkin-success');
          hide('confirm-card');
          setTimeout(function() {
            hide('checkin-success');
            startScanner();
          }, 3500);
        } else {
          document.getElementById('checkin-error').textContent = res.error;
          show('checkin-error');
        }
      }).catch(function(err) {
        btn.disabled = false;
        btn.textContent = type === 'IN' ? 'Check In' : 'Check Out';
        document.getElementById('checkin-error').textContent = 'Connection error: ' + err.message;
        show('checkin-error');
      });
    }

    document.getElementById('checkin-btn').addEventListener('click', function() { submitCheck('IN'); });
    document.getElementById('checkout-btn').addEventListener('click', function() { submitCheck('OUT'); });

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = String(str == null ? '' : str);
      return div.innerHTML;
    }

    var currentOfficeId = null;

    function loadTodayStatus() {
      callApi('employeeGetTodayStatus', [sessionToken]).then(function(res) {
        if (res.ok) {
          var statusEl = document.getElementById('today-status');
          if (res.checkedIn) {
            var timeStr = new Date(res.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            statusEl.innerHTML = '<span style="color:var(--go);">✅ Checked in today at ' + timeStr + '</span>';
            hide('camera-section');
            show('quick-checkout-section');
            currentOfficeId = res.officeId;
          } else {
            statusEl.innerHTML = '<span style="color:var(--warn);">You are not checked in today.</span>';
            show('camera-section');
            hide('quick-checkout-section');
          }
        } else {
          document.getElementById('today-status').textContent = 'Could not load status.';
        }
      }).catch(function() {});
    }

    document.getElementById('quick-checkout-btn').addEventListener('click', function() {
      if (!currentOfficeId) {
        document.getElementById('quick-checkout-error').textContent = 'No office ID found. Please check out by scanning the QR code.';
        show('quick-checkout-error');
        return;
      }

      var btn = document.getElementById('quick-checkout-btn');
      btn.disabled = true;
      btn.textContent = 'Locating...';
      hide('quick-checkout-error');
      hide('quick-checkout-success');

      if (!navigator.geolocation) {
        btn.disabled = false;
        btn.textContent = 'Check Out Now';
        document.getElementById('quick-checkout-error').textContent = 'Location not supported by this browser.';
        show('quick-checkout-error');
        return;
      }

      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var acc = pos.coords.accuracy;
        var dev = getDeviceId();

        btn.textContent = 'Checking out...';
        callApi('checkIn', [sessionToken, 'OUT', lat, lng, acc, currentOfficeId, dev]).then(function(res) {
          btn.disabled = false;
          btn.textContent = 'Check Out Now';
          if (res.ok) {
            document.getElementById('quick-checkout-success').textContent = 'Checked out successfully at ' + res.officeName;
            show('quick-checkout-success');
            loadTodayStatus();
          } else {
            document.getElementById('quick-checkout-error').textContent = res.error || 'Failed to check out.';
            show('quick-checkout-error');
          }
        }).catch(function(err) {
          btn.disabled = false;
          btn.textContent = 'Check Out Now';
          document.getElementById('quick-checkout-error').textContent = 'Connection error: ' + err.message;
          show('quick-checkout-error');
        });
      }, function(err) {
        btn.disabled = false;
        btn.textContent = 'Check Out Now';
        document.getElementById('quick-checkout-error').textContent = 'Could not get your location (' + err.message + '). Enable location services and try again.';
        show('quick-checkout-error');
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

    function loadEmployeeTasks() {
      var container = document.getElementById('tasks-card');
      var list = document.getElementById('tasks-list');
      if (!sessionToken) return;

      callApi('employeeGetTasks', [sessionToken]).then(function(res) {
        if (res.ok) {
          var tasks = res.tasks || [];
          if (tasks.length === 0) {
            list.innerHTML = '<div style="color:var(--muted);font-style:italic;">No active tasks assigned to you today.</div>';
            container.classList.remove('hidden');
            return;
          }

          var html = '<div style="display:flex;flex-direction:column;gap:12px;">';
          tasks.forEach(function(task) {
            var badgeColor = task.type === 'housekeeping' ? 'var(--go)' : '#D97706';
            var badgeText = task.type === 'housekeeping' ? 'Housekeeping' : 'Technician';
            var confirmBtn = '';

            if (task.type === 'housekeeping') {
              confirmBtn = '<button class="btn-secondary" style="margin-top:8px;padding:6px 12px;font-size:13px;width:auto;" onclick="completeTask(\'housekeeping\', \''+task.roomId+'\', \''+task.date+'\')">✓ Confirm Cleaned</button>';
            } else {
              confirmBtn = '<button class="btn-secondary" style="margin-top:8px;padding:6px 12px;font-size:13px;width:auto;" onclick="completeTask(\'technician\', \''+task.roomId+'\', \'\')">🔧 Confirm Fixed</button>';
            }

            html += '<div style="border-left:3px solid '+badgeColor+';padding-left:12px;margin-bottom:4px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<span class="muted" style="background:'+badgeColor+'10;color:'+badgeColor+';padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;">'+badgeText+'</span>' +
                '<span class="muted" style="font-size:11px;margin-left:8px;">Room '+task.displayName+'</span>' +
              '</div>' +
              '<div style="font-weight:600;font-size:14px;margin-top:4px;">'+escapeHtml(task.title)+'</div>' +
              '<div class="muted" style="font-size:12px;margin-top:2px;">Description: '+escapeHtml(task.description)+'</div>' +
              confirmBtn +
            '</div>';
          });
          html += '</div>';
          list.innerHTML = html;
          container.classList.remove('hidden');
        } else {
          list.innerHTML = '<div class="error">Error loading tasks: ' + res.error + '</div>';
          container.classList.remove('hidden');
        }
      }).catch(function(err) {
        list.innerHTML = '<div class="error">Connection error: ' + err.message + '</div>';
        container.classList.remove('hidden');
      });
    }

    function completeTask(type, roomId, dateStr) {
      if (!confirm('Mark this task as completed?')) return;
      var apiName = type === 'housekeeping' ? 'roomsMarkCleaned' : 'roomsResolveMaintenance';
      var params = type === 'housekeeping' ? [sessionToken, roomId, dateStr] : [sessionToken, roomId];

      callApi(apiName, params).then(function(res) {
        if (res.ok) {
          loadEmployeeTasks();
        } else {
          alert('Error: ' + res.error);
        }
      }).catch(function(err) {
        alert('Connection error: ' + err.message);
      });
    }
  