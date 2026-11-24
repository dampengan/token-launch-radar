// Token Launch Radar — the page. It reads window.RADAR (written beside
// dashboard/ by main.ts as data.js) and renders three views from it:
// the ranked board, one protocol's detail, and the filtered board.
// No network: every number on the page comes from data.js.
//
// Routing is all in the hash, so every view is shareable:
//   #/board
//   #/protocol/<slug>
//   #/board?category=Lending&minScore=60
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  var meta = document.getElementById('meta');
  if (!DATA || !app) return;

  var rows = DATA.rows || [];
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown age';
    if (days >= 365) return (days / 365).toFixed(1) + 'y tracked';
    return days + 'd tracked';
  }
  function catOf(r) { return r.category || 'Uncategorised'; }

  // The model, recomputed in the page from the row's own figures, so the
  // page's number and board.json's number are visibly the same arithmetic:
  // implied = TVL x category multiple x growth x tenure.
  function impliedOf(r) {
    var growth = 1 + (Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, r.change_7d || 0)) / 100) * DATA.model.growth_weight;
    var age = r.age_days === null || r.age_days === undefined ? DATA.model.unknown_age_days : r.age_days;
    var tenure = DATA.model.tenure_floor + (Math.min(Math.max(age, 0), DATA.model.tenure_days) / DATA.model.tenure_days) * DATA.model.tenure_range;
    return Math.max(1, Math.round(r.tvl_usd * r.category_multiple * growth * tenure));
  }

  var categories = [];
  var chains = [];
  rows.forEach(function (r) {
    if (categories.indexOf(catOf(r)) < 0) categories.push(catOf(r));
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();

  function stateFromHash() {
    var h = location.hash || '#/board';
    var qi = h.indexOf('?');
    var params = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    return {
      view: path.indexOf('#/protocol/') === 0 ? 'detail' : 'board',
      slug: path.indexOf('#/protocol/') === 0 ? decodeURIComponent(path.slice(11)) : null,
      q: params.get('q') || '',
      category: params.get('category') || '',
      chain: params.get('chain') || '',
      minScore: Number(params.get('minScore') || 0),
      sort: params.get('sort') || 'implied'
    };
  }

  function boardLink(s) {
    var p = new URLSearchParams();
    if (s.q) p.set('q', s.q);
    if (s.category) p.set('category', s.category);
    if (s.chain) p.set('chain', s.chain);
    if (s.minScore) p.set('minScore', String(s.minScore));
    if (s.sort && s.sort !== 'implied') p.set('sort', s.sort);
    var q = p.toString();
    return '#/board' + (q ? '?' + q : '');
  }

  function filtered(s) {
    var out = rows.filter(function (r) {
      return (!s.q || r.name.toLowerCase().indexOf(s.q.toLowerCase()) >= 0 || r.slug.indexOf(s.q.toLowerCase()) >= 0) &&
        (!s.category || catOf(r) === s.category) &&
        (!s.chain || (r.chains || []).indexOf(s.chain) >= 0) &&
        r.score >= s.minScore;
    });
    var by = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      score: function (a, b) { return b.score - a.score || b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); }
    };
    return out.sort(by[s.sort] || by.implied);
  }

  function rowHtml(r) {
    var check = impliedOf(r) === r.implied_value_usd ? '' : ' *';
    return '<tr>' +
      '<td class="rank">#' + r.rank + '</td>' +
      '<td><a href="#/protocol/' + esc(r.slug) + '"><strong>' + esc(r.name) + '</strong></a><div class="sub">' + esc(r.slug) + '</div></td>' +
      '<td>' + esc(catOf(r)) + '</td>' +
      '<td>' + esc((r.chains || []).join(', ')) + '</td>' +
      '<td class="num">' + usd(r.tvl_usd) + '</td>' +
      '<td class="num ' + ((r.change_7d || 0) >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td>' +
      '<td><span class="scorebar"><i style="width:' + r.score + '%"></i></span><span class="num">' + r.score.toFixed(1) + '</span></td>' +
      '<td class="num">' + usd(r.implied_value_usd) + check + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td></tr>';
  }

  function renderBoard(s) {
    var list = filtered(s);
    var top = rows.slice(0, 5);
    var opts = function (items, current, allLabel) {
      return '<option value="">' + allLabel + '</option>' + items.map(function (v) {
        return '<option' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
    };
    var live = (DATA.live || []).slice(0, 8).map(function (l) {
      return '<li><b>' + esc(l.name) + '</b> — market cap ' + usd(l.mcap_usd) + ' on ' + usd(l.tvl_usd) + ' TVL (' + esc(catOf(l)) + ')</li>';
    }).join('');
    app.innerHTML =
      '<section class="cards">' +
        '<div class="card"><b class="amber">' + rows.length + '</b><span>pre-token protocols ranked</span></div>' +
        '<div class="card"><b>' + DATA.watchlist_size + '</b><span>on the watchlist (floor ' + usd(DATA.floor_usd) + ')</span></div>' +
        '<div class="card"><b>' + DATA.early_size + '</b><span>early finds below the floor</span></div>' +
        '<div class="card"><b>' + usd(rows[0].implied_value_usd) + '</b><span>top implied value: ' + esc(rows[0].name) + '</span></div>' +
      '</section>' +
      '<h2>The board</h2>' +
      '<div class="toolbar">' +
        '<label>Search<input type="search" id="q" value="' + esc(s.q) + '" placeholder="name or slug"></label>' +
        '<label>Category<select id="cat">' + opts(categories, s.category, 'All categories') + '</select></label>' +
        '<label>Chain<select id="chain">' + opts(chains, s.chain, 'All chains') + '</select></label>' +
        '<label>Min score<input type="number" id="minScore" min="0" max="100" value="' + s.minScore + '"></label>' +
        '<label>Sort<select id="sort">' +
          '<option value="implied"' + (s.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
          '<option value="score"' + (s.sort === 'score' ? ' selected' : '') + '>Radar score</option>' +
          '<option value="tvl"' + (s.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
          '<option value="growth"' + (s.sort === 'growth' ? ' selected' : '') + '>7-day growth</option>' +
          '<option value="age"' + (s.sort === 'age' ? ' selected' : '') + '>Time tracked</option>' +
        '</select></label>' +
        '<span class="spacer"></span><span class="count" id="count"></span>' +
      '</div>' +
      '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th>Score</th><th class="num">Implied value</th><th class="num">Tracked</th></tr></thead>' +
      '<tbody id="tbody">' + list.map(rowHtml).join('') + '</tbody></table>' +
      (list.length === 0 ? '<p class="empty">No protocols match these filters. Loosen them to see the board again.</p>' : '') +
      '<p class="note">* The page recomputes each implied value from the row\u2019s own figures; a star would mark a row whose recomputed value differs from the board\u2019s. Top five by implied value: ' +
        top.map(function (r) { return '#' + r.rank + ' ' + esc(r.name); }).join(', ') + '.</p>' +
      '<h2>Already trading — for comparison only</h2>' +
      '<p class="note">These protocols already record a token, so they are never ranked. Their market caps are the comparables the multiples come from.</p>' +
      '<ul class="live">' + live + '</ul>';

    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' shown';
    var sync = function () {
      var next = {
        q: document.getElementById('q').value,
        category: document.getElementById('cat').value,
        chain: document.getElementById('chain').value,
        minScore: Number(document.getElementById('minScore').value || 0),
        sort: document.getElementById('sort').value
      };
      var link = boardLink(next);
      if (link !== location.hash) history.replaceState(null, '', link);
      var fresh = filtered(next);
      document.getElementById('tbody').innerHTML = fresh.map(rowHtml).join('');
      document.getElementById('count').textContent = fresh.length + ' of ' + rows.length + ' shown';
    };
    ['q', 'cat', 'chain', 'minScore', 'sort'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', sync);
    });
  }

  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) {
      app.innerHTML = '<p class="empty">No protocol on the board has the slug “' + esc(slug) + '”. <a href="#/board">Back to the board</a>.</p>';
      return;
    }
    var growth = 1 + (Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, r.change_7d || 0)) / 100) * DATA.model.growth_weight;
    var age = r.age_days === null || r.age_days === undefined ? DATA.model.unknown_age_days : r.age_days;
    var tenure = DATA.model.tenure_floor + (Math.min(Math.max(age, 0), DATA.model.tenure_days) / DATA.model.tenure_days) * DATA.model.tenure_range;
    app.innerHTML =
      '<a class="back" href="#/board">← Back to the board</a>' +
      '<section class="detail"><span class="pill">Rank #' + r.rank + ' of ' + rows.length + '</span> ' +
      '<span class="pill ghost">records no token</span>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p>' + esc(catOf(r)) + ' on ' + esc((r.chains || []).join(', ')) + ' · ' + ageText(r.age_days) + ' · snapshot ' + esc(DATA.as_of) + '.</p>' +
      '<dl class="kv">' +
      '<dt>Implied launch value</dt><dd>' + usd(r.implied_value_usd) + '</dd>' +
      '<dt>TVL</dt><dd>' + usd(r.tvl_usd) + ' (' + pct(r.change_7d) + ' over 7 days)</dd>' +
      '<dt>Radar score</dt><dd>' + r.score.toFixed(1) + ' / 100</dd>' +
      '<dt>Category multiple</dt><dd>' + r.category_multiple.toFixed(2) + '× (median of the category\u2019s tokened protocols)</dd>' +
      '</dl>' +
      '<h3>How the implied value is derived</h3>' +
      '<p class="derivation">' + usd(r.tvl_usd) + ' TVL × ' + r.category_multiple.toFixed(2) + ' multiple × ' + growth.toFixed(2) + ' growth × ' + tenure.toFixed(2) + ' tenure = ' + usd(r.implied_value_usd) + '</p>' +
      '<p class="note">The multiple is the median market-cap-to-TVL ratio of tokened protocols in the same category, read from this snapshot — not a hand-picked number. Growth uses the 7-day TVL change; tenure grows with the time tracked with no token recorded.</p>' +
      '<h3>Score breakdown — ' + r.score.toFixed(1) + ' / 100</h3>' +
      '<div class="breakdown">' +
      [['size', r.score_breakdown.size, 'weight 30'], ['momentum', r.score_breakdown.momentum, 'weight 25'], ['breadth', r.score_breakdown.breadth, 'weight 10'], ['tenure', r.score_breakdown.tenure, 'weight 20'], ['headroom', r.score_breakdown.headroom, 'weight 15'], ['risk', r.score_breakdown.risk, 'reported, not scored']].map(function (b) {
        return '<div><b>' + b[1].toFixed(1) + '</b><span>' + b[0] + ' · ' + b[2] + '</span></div>';
      }).join('') + '</div>' +
      '<p class="note">The score is a second opinion; the rank follows the implied value. Risk is reported, never added to the score.</p>' +
      '<p class="note">This row\u2019s page recomputation matches the board: ' + usd(impliedOf(r)) + '.</p>' +
      '<h3>Farm plan</h3><ol class="farm">' +
      r.farm_steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') +
      '</ol><p class="note">A token launch is never guaranteed. Never share a seed phrase, and claim only from the protocol\u2019s official site.</p>' +
      '</section>';
    window.scrollTo(0, 0);
  }

  function route() {
    var s = stateFromHash();
    meta.innerHTML = 'Snapshot <b>' + esc(DATA.as_of) + '</b><br>' + rows.length + ' rows · model <b>' + esc(DATA.model_version) + '</b>';
    if (s.view === 'detail') renderDetail(s.slug);
    else renderBoard(s);
  }

  window.addEventListener('hashchange', route);
  route();
})();
