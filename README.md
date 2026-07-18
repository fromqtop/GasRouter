# GasRouter

GAS(Google Apps Script)の標準エディタで手軽に導入できる、SPAルーティングライブラリです。
複数画面の高速な切り替えはもちろん、ブラウザの「戻る」「進む」ボタンへの対応や、特定ページへの直リンク(初期表示)など、Webアプリに必要なルーティング機能を網羅しています。「手軽に、でも本格的なGASアプリを作りたい」という方に最適です。

## 導入方法

`GasRouter` を自分のプロジェクトに取り込む方法は、2通りあります。

### 方法A: GasRouter.gs をそのままペーストする

一番手軽な方法です。`GasRouter.gs` の中身をコピーし、自分のGASプロジェクトに新しく `.gs` ファイルを作って貼り付けてください。
これだけで、`GasRouter.build(...)` のようにそのまま使えるようになります。

コードを直接見たい・改造したい場合や、複数プロジェクトで使い回すつもりが無い場合はこちらがおすすめです。

### 方法B: ライブラリとして利用する

複数のプロジェクトで使い回したい場合や、コードを自分のプロジェクトに混在させたくない場合は、
GAS標準の「ライブラリ」機能を使う方法もあります。

1. `GasRouter.gs` の中身を、新規に作成したGASプロジェクトに貼り付ける
2. そのプロジェクトを「デプロイ」→「新しいデプロイ」→ 種類の選択で「ライブラリ」として公開する
3. 発行されたスクリプトIDを控えておく
4. 利用したいプロジェクトのエディタで「ライブラリ」→「+」→ 手順3のスクリプトIDを入力して追加する
5. 識別子を `GasRouterLib` にして保存する(識別子は自由に決められますが、後述のコード例と合わせます)
6. 利用するプロジェクトの `.gs` ファイルに、次の1行を**トップレベル**(`doGet` などの関数の外)に追加する

   ```javascript
   const GasRouter = GasRouterLib.createGasRouter_();

   function doGet(e) {
     return GasRouter.build({ ... }); // この中からも GasRouter が参照できる
   }
   ```

これで、以降は方法Aと同じ `GasRouter.build(...)` という書き方が使えます。
この方法であれば、`GasRouter.gs` を更新したときに、利用している全プロジェクトへ反映しやすくなります。

## 使い方

`GasRouter` を取り込んだら、レイアウトファイル(`Layout.html`)と各ページファイル(`pages/xxx.html`)を作成し、
スクリプトファイル(`コード.gs`など)に少量のGASコードを記述していきます。

### 1. Layout.html

下記のコードを `Layout.html` という名前で作成してください。
「`// ここに自分のコード(スタイル)を書ける`」としている部分には、自由にスタイルやスクリプトを追加できます。

```html
<!DOCTYPE html>
<html>
  <head>
    <base target="_top" />
    <meta charset="utf-8" />
    <style>
      <?!= grHeadStyle ?>
      /* ここに自分のスタイルを書ける */
    </style>
    <script>
      <?!= grHeadScript ?>
      // ここに自分のコードを書ける
    </script>
  </head>
  <body>
    <div id="app"><?!= grContent ?></div>
    <script>
      <?!= grBodyScript ?>
      // ここに自分のコードを書ける
    </script>
  </body>
</html>
```

### 2. pages/xxx.html

ページ名の頭に `pages/` を付けた名前でhtmlファイルを作ってください(例: ページ名が `home` なら、ファイル名は `pages/home.html`)。

中身には `<html>` `<head>` `<body>` のような構造タグは書かず、
`<body>`タグの中身のみ記述してください。

ページ遷移のための`<a>`タグには`data-link`という属性を付与してください。

```html
<!-- pages/home.html -->
<h1>ホーム</h1>
<p>ようこそ!</p>
<a href="about" data-link>Aboutへ</a>
```

```html
<!-- pages/about.html -->
<h1>About</h1>
<p>このアプリについての説明ページです。</p>
<a href="home" data-link>ホームへ戻る</a>
```

`<a>` タグ以外(ボタンのクリックや、自前のJSコード)から遷移させたい場合は、
`GasRouter.navigate(path)` を呼び出してください。

```html
<button onclick="GasRouter.navigate('about')">Aboutへ</button>
```

クエリパラメータ(`?ref=email` のような部分)を付けて遷移したい場合は、
`GasRouter.navigate(path, query)` のように第2引数へオブジェクトとして渡してください。
省略した場合は、直前のクエリパラメータがそのまま維持されます。

```javascript
GasRouter.navigate('about', { ref: 'email' }); // クエリパラメータが { ref: 'email' } に更新される
```

### 3. コード.gs

`コード.gs`(名称は変更しても問題ありません)に、以下のスクリプトを記述してください。

`GasRouter.build`のオプションである`routes`には、ページ名の配列をセットしてください。(例: `routes: ['home', 'about']`)
なお、最初の要素がデフォルトで表示されるページとなります。

```javascript
function doGet(e) {
  return GasRouter.build({
    routes: ["home", "about"],
    readFile: readTemplate_,
  });
}

function readTemplate_(filename, vars) {
  const t = HtmlService.createTemplateFromFile(filename);
  Object.assign(t, vars);
  return t.evaluate().getContent();
}
```

基本の導入方法は以上です。デプロイしてウェブアプリが動作することを確認してください。

## GasRouter.build() のオプション

| キー           | 必須 | 説明                                        | 省略時        |
| -------------- | ---- | ------------------------------------------- | ------------- |
| `routes`       | ○    | ページ名の配列                              | -             |
| `readFile`     | ○    | `(filename, vars) => HTML文字列` を返す関数 | -             |
| `data`         | -    | 各ページ・レイアウトに渡す共通データ        | `{}`          |
| `defaultRoute` | -    | ルート未指定時に表示するページ名            | `routes[0]`   |
| `layoutFile`   | -    | レイアウトファイル名                        | `'Layout'`    |
| `mountId`      | -    | ルーティング結果を差し込む要素のID          | `'app'`       |
| `notFoundFile` | -    | 404ページのファイル名                       | `'pages/404'` |

`routes`(空でない配列)と `readFile`(関数)が無い場合、`GasRouter.build` はエラーを投げます。

### 使用例

```javascript
function doGet(e) {
  return GasRouter.build({
    routes: ['top', 'about', 'user/[id]'],
    readFile: readTemplate_,
    data: { appName: 'サンプルアプリ' },
    defaultRoute: 'top',       // 省略時は routes[0]('top')が使われる
    layoutFile: 'MyLayout',    // 省略時は 'Layout'
    mountId: 'content',        // 省略時は 'app'
    notFoundFile: 'pages/not-found', // 省略時は 'pages/404'
  });
}
```

### data をページ側で使う

`readTemplate_`(`readFile` に渡す関数)は、GASのテンプレート機能(`HtmlService.createTemplateFromFile`)を使って
ファイルを評価しています。渡された `data` は、`template.data` として割り当てられるので、
`pages/xxx.html` や `Layout.html` の中では、GAS標準のテンプレート構文で参照できます。

```html
<!-- pages/top.html -->
<h1><?= data.appName ?></h1>
```

## 動的パラメータ

Webアプリを作っていると、`home` や `about` のような固定のページだけでなく、
「ユーザーIDに応じて内容が変わる詳細ページ」のような、URLの一部が動的に変わるページが欲しくなることがあります。
GasRouterでは、`[id]` のように角括弧で囲んだ名前をルートに含めることで、これを実現できます。

例えば、`...exec#/user/123` にアクセスした際に `123` を `id` という動的パラメータとして扱いたい場合は、
`pages/user/[id].html` というファイルを作成し、`routes` に `user/[id]` を含めてください。

この場合、`pages/user/[id].html` が表示され、マッチした値(`123`)は `params.id` として取得できます。

マッチした値は、Layout.html側で登録する `GasRouter.on` の引数(`params`)から取得できます。

```javascript
GasRouter.on('user/[id]', function ({ params, container }) {
  console.log(params.id); // '123'
  container.querySelector('#user-id').textContent = params.id;
});
```

`user/[year]/[slug]` のように複数の角括弧を含めることもでき、その場合は
`params.year` `params.slug` のようにそれぞれ取得できます。

`GasRouter.on` に登録した処理の外(ボタンのクリック処理など、任意のタイミング)から取得したい場合は、
`GasRouter.current.params` を参照してください(詳しくは「GasRouter.current」の章を参照)。

```javascript
console.log(GasRouter.current.params.id); // '123'
```

## 404ページ

`pages/404.html` を作成すると、`routes` に無いルートへアクセスされたときに自動で表示されます。
`routes` に自分で追加する必要はありません。

```html
<!-- pages/404.html -->
<h1>ページが見つかりません</h1>
<p>お探しのページは存在しないか、移動された可能性があります。</p>
<a href="home" data-link>ホームへ戻る</a>
```

ファイル名を変更したい場合は、`run()` の `notFoundFile` オプションで指定できます
(省略時は `'pages/404'`)。作成しなかった場合は、簡易的なフォールバックのテキストが表示されます。

## GasRouter.on

ページが表示されたタイミングで、サーバーからデータを取得して画面に反映したり、
イベントリスナーを設定したりといった処理を実行したいことがあります。
`GasRouter.on` を使うと、特定のページが表示されたときに実行する処理をあらかじめ登録できます。

`pages/xxx.html` のようなページファイル自体には `<script>` を書かず、
`Layout.html` の `<script>` タグ内に記載してください。

```javascript
GasRouter.on('user/[id]', function ({ params, container, query, route, hash }) {
  console.log('ページ: user/[id]', 'id:', params.id);
});
```

引数は1つのオブジェクトとして渡ってきます。

|プロパティ|内容|
|---|---|
|`params`|URLの動的な部分の値(例: `{ id: '123' }`)|
|`container`|`pages/xxx.html` の内容が表示されているdiv要素|
|`query`|クエリパラメータ(例: `?ref=email` の場合 `{ ref: 'email' }`)|
|`route`|マッチしたルート名(例: `'user/[id]'`)|
|`hash`|現在のパス文字列(例: `'user/123'`)|

`container` は、例えば `pages/user/[id].html` の中身をラップしているdiv要素です。
`container.querySelector(...)` を使うと、そのページの中の要素だけを絞り込んで取得できます。

```html
<!-- pages/user/[id].html -->
<h1>ユーザー詳細</h1>
<p>ID: <span id="user-id"></span></p>
```

```javascript
GasRouter.on('user/[id]', function ({ params, container }) {
  // container は、上の pages/user/[id].html の内容全体を表示している要素
  container.querySelector('#user-id').textContent = params.id;
});
```

関数を返すと、次にそのページを離れるときに実行されます。

```javascript
GasRouter.on('user/[id]', function ({ params }) {
  console.log('ページ: user/[id] に入りました', 'id:', params.id);

  return function () {
    console.log('ページ: user/[id] を離れました', 'id:', params.id);
  };
});
```

## GasRouter.current

現在の状態(`route`, `params`, `query`, `hash`)を参照できます。

```javascript
GasRouter.current.route  // 'user/[id]'
GasRouter.current.params // { id: '123' }
GasRouter.current.query  // { ref: 'email' }
GasRouter.current.hash   // 'user/123'
```

## アクセス制御について

GasRouterは、doGet実行時に指定した`routes`の全ページHTMLをブラウザに送信します
(そうすることでページ切り替え時のサーバー通信を無くしています)。
そのため「見せたくないページ」がある場合、ページ側やフックでの制御では不十分です
(HTMLの中身自体はすでにブラウザに届いてしまっているため)。
必ず、doGetの時点で`routes`の配列自体を絞り込んでください。

```javascript
// 誰でも見られるページ
const PUBLIC_ROUTES = ['home', 'about', 'user/[id]'];

// 管理者だけが見られるページ
const ADMIN_ROUTES = ['admin'];

function doGet(e) {
  const routes = isAdmin_()
    ? PUBLIC_ROUTES.concat(ADMIN_ROUTES)
    : PUBLIC_ROUTES;

  return GasRouter.build({
    routes: routes,
    readFile: readTemplate_,
  });
}

/**
 * 実行しているユーザーが管理者かどうかを判定する。
 * (判定方法はプロジェクトに応じて変更してください。例: 特定メールアドレスのリストと照合する等)
 */
function isAdmin_() {
  const adminEmails = ['admin@example.com'];
  const email = Session.getActiveUser().getEmail();
  return adminEmails.includes(email);
}
```
