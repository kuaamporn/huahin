/* ui.js — shared toast + confirm modal for The Precious Moment System.
 *
 * Include on every page AFTER session.js:
 *   <script src="ui.js"></script>
 *
 * API:
 *   showToast(message, type)      type: 'success' | 'error' | 'info' (default 'info')
 *   confirmDialog(message, opts)  -> Promise<boolean>
 *       opts: { title, confirmText, cancelText, danger:true }
 *
 * Also overrides window.alert() to show a non-blocking toast, so existing
 * alert(...) calls upgrade automatically with no code changes.
 */
(function () {
  if (window.__huahinUI) return;
  window.__huahinUI = true;

  var css = ''
    + '.hh-toast-wrap{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:calc(100% - 32px);max-width:420px}'
    + '.hh-toast{pointer-events:auto;width:100%;box-sizing:border-box;font-family:"Source Sans 3","Segoe UI",sans-serif;font-size:14px;line-height:1.45;color:#1D1D1F;background:#fff;border:1px solid #E5E5EA;border-left:4px solid #0F766E;border-radius:12px;padding:12px 40px 12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.12);position:relative;opacity:0;transform:translateY(-8px);transition:opacity .2s ease,transform .2s ease}'
    + '.hh-toast.show{opacity:1;transform:none}'
    + '.hh-toast.success{border-left-color:#16A34A}'
    + '.hh-toast.error{border-left-color:#DC2626}'
    + '.hh-toast.info{border-left-color:#0F766E}'
    + '.hh-toast .hh-x{position:absolute;top:7px;right:9px;border:none;background:none;font-size:18px;line-height:1;color:#86868B;cursor:pointer;padding:2px 5px}'
    + '.hh-toast .hh-x:hover{color:#1D1D1F}'
    + '.hh-modal-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .18s ease}'
    + '.hh-modal-ov.show{opacity:1}'
    + '.hh-modal{font-family:"Source Sans 3","Segoe UI",sans-serif;background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px 22px 18px;box-shadow:0 20px 50px rgba(0,0,0,.3);transform:scale(.96);transition:transform .18s ease}'
    + '.hh-modal-ov.show .hh-modal{transform:none}'
    + '.hh-modal h3{font-family:"Lexend","Segoe UI",sans-serif;font-size:17px;font-weight:700;margin:0 0 8px;color:#1D1D1F}'
    + '.hh-modal p{font-size:14px;color:#4A4842;margin:0 0 20px;line-height:1.5;white-space:pre-wrap}'
    + '.hh-modal-btns{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}'
    + '.hh-btn{font-family:"Lexend","Segoe UI",sans-serif;font-size:14px;font-weight:600;padding:9px 18px;border-radius:10px;border:1px solid #E5E5EA;background:#fff;color:#1D1D1F;cursor:pointer;min-height:40px}'
    + '.hh-btn:hover{background:#F5F5F7}'
    + '.hh-btn-primary{background:#0F766E;border-color:#0F766E;color:#fff}'
    + '.hh-btn-primary:hover{background:#0c5f58}'
    + '.hh-btn-danger{background:#DC2626;border-color:#DC2626;color:#fff}'
    + '.hh-btn-danger:hover{background:#b91c1c}';

  function injectStyle() {
    if (document.getElementById('hh-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'hh-ui-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }
  injectStyle();

  var wrap;
  function ensureWrap() {
    if (!wrap || !wrap.parentNode) {
      wrap = document.createElement('div');
      wrap.className = 'hh-toast-wrap';
      (document.body || document.documentElement).appendChild(wrap);
    }
    return wrap;
  }

  var TYPE_ALIAS = { ok: 'success', success: 'success', err: 'error', error: 'error', danger: 'error', warn: 'info', info: 'info' };
  function showToast(message, type) {
    type = TYPE_ALIAS[type] || 'info';
    var w = ensureWrap();
    var t = document.createElement('div');
    t.className = 'hh-toast ' + type;
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    var span = document.createElement('span');
    span.textContent = message == null ? '' : String(message);
    t.appendChild(span);
    var x = document.createElement('button');
    x.className = 'hh-x';
    x.innerHTML = '&times;';
    x.setAttribute('aria-label', 'Dismiss');
    t.appendChild(x);
    w.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    var timer = setTimeout(remove, type === 'error' ? 6000 : 3500);
    function remove() {
      clearTimeout(timer);
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
    }
    x.addEventListener('click', remove);
    return t;
  }

  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.className = 'hh-modal-ov';
      ov.innerHTML =
        '<div class="hh-modal" role="dialog" aria-modal="true">' +
          '<h3></h3><p></p>' +
          '<div class="hh-modal-btns">' +
            '<button class="hh-btn hh-cancel"></button>' +
            '<button class="hh-btn hh-ok"></button>' +
          '</div>' +
        '</div>';
      ov.querySelector('h3').textContent = opts.title || 'Please confirm';
      ov.querySelector('p').textContent = message == null ? '' : String(message);
      var cancel = ov.querySelector('.hh-cancel');
      var ok = ov.querySelector('.hh-ok');
      cancel.textContent = opts.cancelText || 'Cancel';
      ok.textContent = opts.confirmText || 'Confirm';
      ok.className = 'hh-btn hh-ok ' + (opts.danger ? 'hh-btn-danger' : 'hh-btn-primary');
      (document.body || document.documentElement).appendChild(ov);
      requestAnimationFrame(function () { ov.classList.add('show'); });

      function close(val) {
        document.removeEventListener('keydown', onKey);
        ov.classList.remove('show');
        setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 200);
        resolve(val);
      }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      ok.addEventListener('click', function () { close(true); });
      cancel.addEventListener('click', function () { close(false); });
      ov.addEventListener('click', function (e) { if (e.target === ov) close(false); });
      document.addEventListener('keydown', onKey);
      setTimeout(function () { ok.focus(); }, 50);
    });
  }

  // Non-blocking replacement for native alert(). Colour by message intent.
  window.__nativeAlert = window.alert;
  window.alert = function (msg) {
    var s = String(msg == null ? '' : msg);
    var type = /error|fail|invalid|denied|cannot|unable|wrong|expired|missing|not\s|no\s|ผิดพลาด|ไม่สำเร็จ|ไม่ถูกต้อง|ไม่ได้|ล้มเหลว|หมดอายุ|ไม่พบ/i.test(s) ? 'error'
             : /success|saved|added|updated|deleted|confirmed|sent|complete|สำเร็จ|เรียบร้อย|บันทึกแล้ว|อัปเดตแล้ว|ส่งแล้ว/i.test(s) ? 'success'
             : 'info';
    showToast(s, type);
  };

  // --- Thai display translator (additive) -------------------------------
  // Maps a backend/logic value to its DISPLAY text, [English, Thai]. Used ONLY
  // when rendering — the underlying value stays as stored everywhere (state,
  // comparisons, API params). Unknown keys pass through unchanged, so it never
  // blanks a label. Free text (names, notes) is never looked up.
  var vocab = {
    // booking status
    'CHECKED_IN': ['Checked in', 'เข้าพักแล้ว'], 'CONFIRMED': ['Reserved', 'จองแล้ว'],
    'CHECKED_OUT': ['Checked out', 'เช็คเอาท์แล้ว'], 'CANCELLED': ['Cancelled', 'ยกเลิก'],
    // room status / overrides
    'CLEANING_DUE': ['Cleaning due', 'รอทำความสะอาด'], 'CLOSED': ['Closed', 'ปิดห้อง'],
    'MAINTENANCE': ['Maintenance', 'ซ่อมบำรุง'],
    // occupancy labels
    'Occupied': ['Occupied', 'มีผู้พัก'], 'Vacant': ['Vacant', 'ว่าง'],
    'Reserved': ['Reserved', 'จองแล้ว'], 'Available': ['Available', 'ว่าง'],
    // booking types (OTA names kept as-is intentionally)
    'monthly': ['Monthly', 'รายเดือน'], 'walkin': ['Daily', 'รายวัน'],
    'monthly-draft': ['Monthly draft', 'ร่างรายเดือน'],
    // finance: transaction direction + approval status (display only; values stay English)
    'Revenue': ['Revenue', 'รายรับ'], 'Expense': ['Expense', 'รายจ่าย'],
    'Reservation': ['Reservation', 'การจอง'],
    'Verified': ['Verified', 'ตรวจสอบแล้ว'], 'Approved': ['Approved', 'อนุมัติแล้ว'],
    'Pending Approval': ['Pending approval', 'รออนุมัติ'], 'Pending': ['Pending', 'รอดำเนินการ'],
    // finance: revenue categories (keys sent to worker — display only)
    'monthly rent': ['Monthly rent', 'ค่าเช่ารายเดือน'],
    'monthly deposit': ['Monthly deposit', 'เงินมัดจำรายเดือน'],
    'daily rent': ['Daily rent', 'ค่าเช่ารายวัน'],
    'daily deposit': ['Daily deposit', 'เงินมัดจำรายวัน'],
    'bk rent': ['Booking.com rent', 'ค่าเช่า Booking.com'],
    'bk deposit': ['Booking.com deposit', 'มัดจำ Booking.com'],
    'exp rent': ['Expedia rent', 'ค่าเช่า Expedia'],
    'exp deposit': ['Expedia deposit', 'มัดจำ Expedia'],
    'damage_fee': ['Damage fee', 'ค่าเสียหาย'], 'fitness': ['Fitness', 'ฟิตเนส'],
    'breakfast': ['Breakfast', 'อาหารเช้า'],
    // Registered in transaction_categories (migration_31) but unlabelled until
    // 2026-08-02 — they rendered as raw English slugs in the Thai UI.
    'as rent': ['AS rent', 'ค่าเช่า AS'],
    'as deposit': ['AS deposit', 'มัดจำ AS'],
    'tt rent': ['Thai Tour rent', 'ค่าเช่า Thai Tour'],
    'tt deposit': ['Thai Tour deposit', 'มัดจำ Thai Tour'],
    'card deposit': ['Card deposit', 'มัดจำคีย์การ์ด'],
    'reservation': ['Reservation deposit', 'เงินจอง'],
    'furniture': ['Furniture rent', 'ค่าเช่าเฟอร์นิเจอร์'],
    'refund': ['Refund', 'เงินคืน'],
    // finance: expense categories
    'electricity': ['Electricity', 'ค่าไฟฟ้า'], 'water': ['Water', 'ค่าน้ำ'],
    'water treatment': ['Water treatment', 'ค่าบำบัดน้ำ'],
    'utility': ['Utilities', 'ค่าสาธารณูปโภค'], 'repair': ['Repairs', 'ค่าซ่อม'],
    'cleaning': ['Cleaning', 'ค่าทำความสะอาด'], 'supplies': ['Supplies', 'ค่าของใช้'],
    'salaries': ['Salaries', 'เงินเดือน'], 'deposit_return': ['Deposit return', 'คืนเงินมัดจำ'],
    'other': ['Other', 'อื่น ๆ'],
    // finance: VAT wording shown in the item expander
    'Included': ['Tax included', 'รวมภาษี'], 'Excluded': ['Tax excluded', 'แยกภาษี']
  };
  function tv(v) {
    if (v == null) return v;
    var e = Object.prototype.hasOwnProperty.call(vocab, v) ? vocab[v] : null;
    return e ? e[window.HuaHinI18n && HuaHinI18n.lang() === 'en' ? 0 : 1] : v;
  }

  window.showToast = showToast;
  window.confirmDialog = confirmDialog;
  window.tv = tv;
  window.tvVocab = vocab;
})();
