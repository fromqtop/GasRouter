/**
 * @param {Object} config
 * @param {string[]} config.routes           ルート名の配列(必須)
 * @param {Function} config.readFile         (filename, vars) => 評価済みHTML文字列 を返す関数(必須)。利用者側で定義し、そのまま渡すこと。
 * @param {Object} [config.data]             各ページ・レイアウトに渡す共通データ。省略時は空オブジェクト。
 * @param {string} [config.defaultRoute]     ルート未指定時に表示するルート名。省略時は routes[0]。
 * @param {string} [config.layoutFile]       レイアウトファイル名。省略時は 'Layout'。
 * @param {string} [config.mountId]          ルーティング結果を差し込む要素のID。省略時は 'app'。
 * @param {string} [config.notFoundFile]     404ページのファイル名。省略時は 'pages/404'。
 * @return {HtmlOutput}
 * @throws {Error} config が無い、config.routes が空配列/非配列、config.readFile が関数でない場合
 */
function run(config) {
  if (!config) {
    throw new Error('GasRouter.run: config is required.');
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error('GasRouter.run: config.routes must be a non-empty array.');
  }
  if (typeof config.readFile !== 'function') {
    throw new Error('GasRouter.run: config.readFile must be a function.');
  }

  const defaultRoute = config.defaultRoute || config.routes[0];
  const layoutFile = config.layoutFile || 'Layout';
  const mountId = config.mountId || 'app';
  const notFoundFile = config.notFoundFile || 'pages/404';
  const data = config.data || {};

  const pages = {};
  config.routes.forEach(route => {
    pages[route] = config.readFile('pages/' + route, { data: data }); // 無ければ例外(設定ミスに気づけるように)
  });

  try {
    pages['404'] = config.readFile(notFoundFile, { data: data });
  } catch (err) {
    pages['404'] = '404 Not Found'; // 404ページが無い場合のフォールバック
  }

  const fragments = buildFragments_(pages, {
    routes: config.routes,
    mountId: mountId,
    defaultRoute: defaultRoute,
  });

  const layoutHtml = config.readFile(layoutFile, {
    data: data,
    grHeadStyle: fragments.grHeadStyle,
    grHeadScript: fragments.grHeadScript,
    grContent: fragments.grContent,
    grBodyScript: fragments.grBodyScript,
  });

  return HtmlService.createHtmlOutput(layoutHtml);
}

/**
 * ページ群とルート設定から、Layout.html に差し込む3つのHTML断片を組み立てる。
 * (grHeadScript: <head>に置く定義、grContent: マウント要素の中身、grBodyScript: ルーティング本体)
 */
function buildFragments_(pages, options) {
  const opts = Object.assign({
    routes: Object.keys(pages),
    mountId: 'app',
    defaultRoute: 'home',
  }, options || {});

  // 各ページを、非表示状態のdivとして組み立てる。
  // pages['404'] は run() 側で必ず何らかの値を持たせているので、常に含める。
  const pageDivs = [...new Set(opts.routes.concat('404'))]
    .map(route => {
      return `<div data-gr-route="${route}" class="gr-page">${pages[route]}</div>`;
    })
    .join('\n');

  const grHeadStyle = `
  .gr-page { display: none; }
  .gr-page.gr-active { display: block; }
  `;

  const grHeadScript = `
  window.GasRouter = {};
  GasRouter.hooks = {};

  // Layout.html などから呼ぶ。ルートに一致したときの処理を登録する。
  // 例: GasRouter.on('user/[id]', function ({ params, container, query, route, hash }) { ... });
  // 戻り値に関数を返すと、次にページを離れるときにその関数が呼ばれる。
  GasRouter.on = function (pattern, callback) {
    GasRouter.hooks[pattern] = callback;
  };
  `;

  const grBodyScript = `
(function () {
  const routePatterns = ${JSON.stringify(opts.routes)};
  const mountEl = document.getElementById('${opts.mountId}');
  if (!mountEl) {
    throw new Error('GasRouter: mount element (#${opts.mountId}) not found. Layout.html内に <div id="${opts.mountId}">...</div> があるか確認してください。');
  }

  // [id]のような動的セグメントを含まないパターンと、含むパターンに分けておく。
  // 固定ページ(user/settings)を、動的ページ(user/[id])より優先してマッチさせるため、
  // まずリテラルの配列から、無ければ動的の配列から探す。
  const literalPatterns = routePatterns.filter((p) => !p.includes('['));
  const dynamicPatterns = routePatterns.filter((p) => p.includes('['));

  // 1つのパターンに対して、URLのパスのセグメント配列が一致するか調べる。
  // 一致すればパラメータのオブジェクトを、しなければnullを返す。
  function tryMatch(patternSegs, pathSegs) {
    if (patternSegs.length !== pathSegs.length) return null;

    const params = {};
    for (let i = 0; i < patternSegs.length; i++) {
      const s = patternSegs[i];
      const isDynamic = s.startsWith('[') && s.endsWith(']');
      if (isDynamic) {
        params[s.slice(1, -1)] = pathSegs[i];
      } else if (s !== pathSegs[i]) {
        return null;
      }
    }
    return params;
  }

  // パス文字列を、まずリテラルパターン(完全一致)、次に動的パターンの順で照合する。
  function matchRoute(path) {
    if (literalPatterns.includes(path)) {
      return { pattern: path, params: {} };
    }

    const pathSegs = path.split('/');
    for (const pattern of dynamicPatterns) {
      const params = tryMatch(pattern.split('/'), pathSegs);
      if (params) return { pattern: pattern, params: params };
    }
    return null;
  }

  function findPageEl(route) {
    return mountEl.querySelector('[data-gr-route="' + route + '"]');
  }

  // 現在の状態。フック以外の場所からも GasRouter.current で参照できる。
  GasRouter.current = { route: null, params: {}, query: {}, hash: '' };

  // 直前のフックが返したクリーンアップ関数(後片付けが必要な処理があれば)
  let cleanup = null;

  function renderPage(raw, query) {
    if (typeof cleanup === 'function') {
      cleanup();
      cleanup = null;
    }

    const trimmed = (raw || '').split('/').filter(Boolean).join('/');
    const path = trimmed || '${opts.defaultRoute}';
    const matched = matchRoute(path);
    const targetRoute = matched ? matched.pattern : '404';

    mountEl.querySelectorAll('.gr-page').forEach((el) => el.classList.remove('gr-active'));
    const targetEl = findPageEl(targetRoute);
    if (!targetEl) return;
    targetEl.classList.add('gr-active');

    // 再代入ではなくプロパティ更新にすることで、
    // 利用者が GasRouter.current を何らかのリアクティブなオブジェクトでラップしていても
    // その参照が途切れない。
    Object.assign(GasRouter.current, {
      route: matched ? matched.pattern : null,
      params: matched ? matched.params : {},
      query: query || {},
      hash: raw || '',
    });

    const hook = matched && GasRouter.hooks[matched.pattern];
    if (hook) {
      const result = hook({
        params: matched.params,
        query: query || {},
        container: targetEl,
        route: matched.pattern,
        hash: raw || '',
      });
      if (typeof result === 'function') {
        cleanup = result;
      }
    }
  }

  // JSコードから直接呼べる、シンプルな遷移関数
  // 例: GasRouter.navigate('about')        → URLは #/about になる(クエリパラメータは維持される)
  // 例: GasRouter.navigate('user/123')     → URLは #/user/123 になる('user/[id]'にマッチし、登録済みフックにparams.id === '123'が渡る)
  // 例: GasRouter.navigate('about', { ref: 'email' }) → クエリパラメータを { ref: 'email' } に更新する
  function navigate(path, query) {
    path = path || '';
    query = query !== undefined ? query : GasRouter.current.query;
    google.script.history.push(null, query, '/' + path);
    renderPage(path, query);
  }
  GasRouter.navigate = navigate;

  mountEl.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (!link) return;
    e.preventDefault();
    navigate(link.getAttribute('href'));
  });

  google.script.history.setChangeHandler((e) => {
    renderPage(e.location.hash, e.location.parameter || {});
  });

  google.script.url.getLocation((location) => {
    renderPage(location.hash, location.parameter || {});
  });
})();
  `;

  return {
    grHeadStyle: grHeadStyle,
    grHeadScript: grHeadScript,
    grContent: pageDivs,
    grBodyScript: grBodyScript,
  };
}
