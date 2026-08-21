/* DoorGorge — item customisation sheet.
   The base price is the advertisement. This screen is the invoice. */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  var NOTE_REPLIES = [
    'Noted. Special instructions are read by a system that summarises them, and the summary is discarded.',
    'Received. Your request has been forwarded to a queue that is not monitored.',
    'Understood. This text will be printed on a ticket that faces away from the kitchen.',
    'Logged. Requests are honoured in the order they are ignored.',
    'Thank you. Your instructions have been added to your permanent profile.',
  ];

  DG.openItem = function (slug, itemId, existing) {
    var store = DG.catalog.get(slug);
    var item = DG.catalog.item(slug, itemId);
    if (!store || !item) return;

    var sel = existing ? DG.deep(existing.sel) : DG.catalog.defaultSel(item);
    var qty = existing ? existing.qty : 1;
    var note = existing ? existing.note : '';
    var showErr = false;

    var handle = DG.sheet.open({
      full: true,
      title: null,
      close: false,
      noGrab: true,
      html: body(),
      footer: foot(),
      onMount: function (root, h) {
        wire(root, h);
      },
    });

    function body() {
      var h = '';
      h += '<div style="position:relative">' +
        (item.photoSrc ? '<img class="it-hero" src="' + item.photoSrc + '" alt="" onerror="this.remove()">'
          : '<div class="it-hero" style="display:grid;place-items:center;font-size:44px;background:var(--surface-2)">' +
            (DG.CAT_ICONS[(store.categories || [])[0]] || '🍽') + '</div>') +
        '<div style="position:absolute;top:12px;left:12px;right:12px;display:flex">' +
          '<button class="iconbtn iconbtn--glass" data-sheet-close aria-label="Close">' + DG.icon('x', 19) + '</button>' +
        '</div></div>';

      h += '<div class="it-head">' +
        ((item.badges || []).length ? '<div style="display:flex;gap:6px;margin-bottom:8px">' +
          item.badges.map(function (b) { return '<span class="badge badge--promo">' + DG.esc(b) + '</span>'; }).join('') + '</div>' : '') +
        '<h2>' + DG.esc(item.name) + '</h2>' +
        '<p>' + DG.esc(item.desc) + '</p>' +
        '<div class="it-price">' + DG.money(item.price) +
          '<i>' + DG.int(item.calories) + ' Cal · base price, before required selections</i></div>' +
      '</div>';

      h += (item.groups || []).map(group).join('');

      h += '<div class="grp"><div class="grp-h"><b>Special instructions<span class="grp-rule">Read by no one. Retained forever.</span></b>' +
        '<span class="grp-opt">OPTIONAL</span></div>' +
        '<div class="field"><textarea class="textarea" data-note placeholder="e.g. no onions, extra napkins, please knock">' + DG.esc(note) + '</textarea>' +
        '<div class="field-hint" data-notehint></div></div></div>';

      h += '<div style="padding:0 16px 26px"><p style="font:var(--t-cap);color:var(--ink-3);line-height:1.5;margin:0">' +
        'Allergen information is available on request. Requests are available on request.</p></div>';
      return h;
    }

    function group(g) {
      var chosen = sel[g.id] || [];
      var multi = (g.max || 1) > 1;
      var missing = showErr && g.required && chosen.length < (g.min || 1);
      var rule = g.required
        ? (multi ? 'Required · choose ' + (g.min || 1) + (g.max > g.min ? '–' + g.max : '') : 'Required · choose 1')
        : (multi ? 'Optional · up to ' + g.max : 'Optional');
      return '<div class="grp' + (missing ? ' is-missing' : '') + '" data-grp="' + g.id + '">' +
        '<div class="grp-h"><b>' + DG.esc(g.name) + '<span class="grp-rule">' + rule +
          (missing ? ' — a selection is required' : '') + '</span></b>' +
          (g.required ? '<span class="grp-req">REQUIRED</span>' : '<span class="grp-opt">OPTIONAL</span>') + '</div>' +
        g.options.map(function (o) {
          var on = chosen.indexOf(o.id) > -1;
          var full = multi && !on && chosen.length >= (g.max || 1);
          return '<button class="opt" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on + '"' +
            (full ? ' disabled' : '') + ' data-opt="' + o.id + '" data-g="' + g.id + '">' +
            '<span class="mark' + (multi ? ' mark--sq' : '') + '"></span>' +
            '<span class="opt-b"><b>' + DG.esc(o.name) + '</b>' + (o.note ? '<span>' + DG.esc(o.note) + '</span>' : '') + '</span>' +
            '<span class="opt-p' + (o.price === 0 ? ' free' : (o.price >= 8 ? ' big' : '')) + '">' +
              (o.price === 0 ? 'Included' : '+' + DG.money(o.price)) + '</span></button>';
        }).join('') + '</div>';
    }

    function foot() {
      var unit = DG.catalog.unitPrice(item, sel);
      var mods = DG.round2(unit - item.price);
      return '<div style="flex:1;display:flex;flex-direction:column;gap:8px">' +
        (mods > 0 ? '<div style="font:var(--t-cap);color:var(--ink-2);display:flex;justify-content:space-between">' +
          '<span>Base ' + DG.money(item.price) + ' + selections ' + DG.money(mods) + '</span>' +
          '<span style="color:var(--gorge);font-weight:700">' + (item.price > 0 ? '+' + Math.round(mods / item.price * 100) + '%' : '') + '</span></div>' : '') +
        '<div class="it-foot">' +
          '<span class="stepper"><button data-q="-1"' + (qty <= 1 ? ' disabled' : '') + '>' + DG.icon('minus', 15) + '</button>' +
          '<b>' + qty + '</b><button data-q="1">' + DG.icon('plus', 15) + '</button></span>' +
          '<button class="btn btn--primary btn--split" data-add>' +
            '<span>' + (existing ? 'Update' : 'Add to cart') + '</span><span>' + DG.money(unit * qty) + '</span></button>' +
        '</div></div>';
    }

    var footerWired = false;
    function wire(root, h) {
      function repaint() {
        root.innerHTML = body();
        h.setFooter(foot());
        var ta = root.querySelector('[data-note]');
        if (ta) ta.value = note;
      }
      /* the .sheet-foot element persists across setFooter(), so these delegated
         listeners must be bound exactly once — rebinding leaks a handler per repaint */
      function wireFooter(hh) {
        if (footerWired) return;
        footerWired = true;
        var f = hh.el.querySelector('.sheet-foot');
        DG.on(f, 'click', '[data-q]', function (e, t) {
          qty = DG.clamp(qty + Number(t.dataset.q), 1, 99);
          hh.setFooter(foot());
        });
        DG.on(f, 'click', '[data-add]', function () { commit(hh); });
      }

      DG.on(root, 'click', '[data-opt]', function (e, t) {
        var gid = t.dataset.g, oid = t.dataset.opt;
        var g = item.groups.filter(function (x) { return x.id === gid; })[0];
        var cur = sel[gid] || [];
        var multi = (g.max || 1) > 1;
        if (multi) {
          var i = cur.indexOf(oid);
          if (i > -1) cur.splice(i, 1);
          else if (cur.length < (g.max || 1)) cur.push(oid);
        } else {
          cur = cur[0] === oid && !g.required ? [] : [oid];
        }
        sel[gid] = cur;
        DG.tap(t);
        repaint();
      });
      DG.on(root, 'input', '[data-note]', function (e, t) {
        note = t.value;
        var hint = root.querySelector('[data-notehint]');
        if (hint) hint.textContent = note.trim().length > 3 ? DG.pick(NOTE_REPLIES, DG.seeded(note.length + 'n')) : '';
      });
      wireFooter(h);
    }

    function commit(h) {
      var missing = DG.catalog.validate(item, sel);
      if (missing.length) {
        showErr = true;
        h.body.innerHTML = body();
        wire(h.body, h);
        var el = h.body.querySelector('.grp.is-missing');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        DG.toast(missing[0].name + ' requires a selection.', { kind: 'bad', icon: 'alert' });
        return;
      }
      if (existing) {
        DG.cart.update(store.slug, existing.lid, { sel: sel, qty: qty, note: note, key: JSON.stringify([item.id, sel, note]) });
        DG.toast('Updated.');
      } else {
        DG.cart.add(store.slug, item, sel, qty, note);
        var unit = DG.catalog.unitPrice(item, sel);
        DG.toast(qty + '× ' + item.name + ' — ' + DG.money(unit * qty), {
          icon: 'checkFill', action: 'View cart', onAction: function () { DG.nav.go('cart', { slug: store.slug }); },
        });
      }
      h.close();
      DG.nav.refresh();
    }
  };

  /* global opener */
  DG.wireItemOpeners = function () {
    DG.on(document, 'click', '[data-item][data-slug]', function (e, t) {
      e.preventDefault();
      DG.openItem(t.dataset.slug, t.dataset.item);
    });
  };
})(window.DG);
