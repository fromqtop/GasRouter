/**
 * GasRouter - GAS Webアプリ用のハッシュベースSPAルーター
 */

class GasRouterImpl {
  /**
   * @param {Object} config
   * @param {string[]} config.routes           ルート名の配列(必須)
   * @param {Function} config.readFile         (filename, vars) => 評価済みHTML文字列(必須)
   * @param {Object} [config.data]             各ページ・レイアウトへの共通データ。既定値: {}
   * @param {string} [config.defaultRoute]     未指定時のルート名。既定値: routes[0]
   * @param {string} [config.layoutFile]       レイアウトファイル名。既定値: 'Layout'
   * @param {string} [config.mountId]          マウント要素のID。既定値: 'app'
   * @param {string} [config.notFoundFile]     404ページのファイル名。既定値: 'pages/404'
   * @return {HtmlOutput}
   */
  build(config) {
    if (!config) {
      throw new Error('GasRouter.build: config is required.');
    }
    if (!Array.isArray(config.routes) || config.routes.length === 0) {
      throw new Error('GasRouter.build: config.routes must be a non-empty array.');
    }
    if (typeof config.readFile !== 'function') {
      throw new Error('GasRouter.build: config.readFile must be a function.');
    }

    const defaultRoute = config.defaultRoute || config.routes[0];
    const layoutFile = config.layoutFile || 'Layout';
    const mountId = config.mountId || 'app';
    const notFoundFile = config.notFoundFile || 'pages/404';
    const data = config.data || {};

    const pages = {};
    config.routes.forEach(route => {
      pages[route] = config.readFile('pages/' + route, { data: data });
    });

    try {
      pages['404'] = config.readFile(notFoundFile, { data: data });
    } catch (err) {
      pages['404'] = '404 Not Found';
    }

    const fragments = this.buildFragments_(pages, {
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
   * pages と ルート設定から、Layout.html に差し込む4つのHTML断片を組み立てる。
   */
  buildFragments_(pages, options) {
    const opts = Object.assign({
      routes: Object.keys(pages),
      mountId: 'app',
      defaultRoute: 'home',
    }, options || {});

    // 各ページを非表示状態のdivとして組み立てる(404は常に含む)
    const pageDivs = [...new Set(opts.routes.concat('404'))]
      .map(route => `<div data-gr-route="${route}" class="gr-page">${pages[route]}</div>`)
      .join('\n');

    const grHeadStyle = `
    .gr-page { display: none; }
    .gr-page.gr-active { display: contents; }
    `;

    const grHeadScript = `
    window.GasRouter = {};
    GasRouter.hooks = {};
    GasRouter.current = { route: null, params: {}, query: {}, hash: '' };

    // ルートに一致したときの処理を登録する。
    // 例: GasRouter.on('user/[id]', function ({ params, container, query, route, hash }) { ... });
    // 戻り値に関数を返すと、次にページを離れるときにその関数が呼ばれる(後片付け用)。
    GasRouter.on = function (pattern, callback) {
      GasRouter.hooks[pattern] = callback;
    };
    `;

    const grBodyScript = `
  (function () {
    const routePatterns = ${JSON.stringify(opts.routes)};
    const mountEl = document.getElementById('${opts.mountId}');
    if (!mountEl) {
      throw new Error('GasRouter: mount element (#${opts.mountId}) not found.');
    }

    // 固定ページ(user/settings)を動的ページ(user/[id])より優先させるため、
    // リテラルパターンと動的パターンに分けて、リテラルから先に照合する。
    const literalPatterns = routePatterns.filter((p) => !p.includes('['));
    const dynamicPatterns = routePatterns.filter((p) => p.includes('['));

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

    // 直前のフックが返したクリーンアップ関数
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
      window.scrollTo(0, 0);

      // 再代入せずプロパティ更新にすることで、GasRouter.currentを
      // リアクティブなオブジェクトでラップしていても参照が途切れない
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

    // ページを切り替えるだけの関数。クエリパラメータは今の状態がそのまま引き継がれる
    // (クエリだけ変えたい場合は GasRouter.updateQuery を使うこと)。
    // 例: GasRouter.navigate('about')
    // 例: GasRouter.navigate('user/123')  → 'user/[id]'にマッチ、params.id === '123'
    function navigate(path) {
      path = path || '';
      const query = GasRouter.current.query;
      google.script.history.push(null, query, path);
      renderPage(path, query);
    }
    GasRouter.navigate = navigate;

    // 現在のパスは維持したまま、クエリパラメータだけ部分的に更新する。
    // ページ遷移ではないため、GasRouter.on のフックは発火しない。
    // 例: GasRouter.updateQuery({ page: '3' })  → 他のクエリ(sortなど)は保持したまま page だけ変わる
    // 値に null を渡すと、そのキーを削除する。
    GasRouter.updateQuery = function (partialQuery) {
      const nextQuery = Object.assign({}, GasRouter.current.query, partialQuery || {});
      Object.keys(nextQuery).forEach((key) => {
        if (nextQuery[key] === null) delete nextQuery[key];
      });
      google.script.history.push(null, nextQuery, GasRouter.current.hash);
      GasRouter.current.query = nextQuery;
    };

    document.addEventListener('click', (e) => {
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
}

/**
 * GASライブラリはトップレベルのfunction宣言しか公開できないため、
 * ライブラリとして使う場合(README「方法B」)はこのファクトリ経由でインスタンスを取得する。
 * 例: const GasRouter = Identifier.createGasRouter_();
 * (末尾の _ は google.script.run から呼べないようにするGASの慣習)
 */
function createGasRouter_() {
  return new GasRouterImpl();
}

/**
 * このファイルを直接プロジェクトに貼り付けた場合(README「方法A」)、
 * そのまま GasRouter.build(config) と書けるようにするための実体。
 */
const GasRouter = createGasRouter_();
