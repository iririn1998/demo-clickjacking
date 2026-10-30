// HTML for the victim site. Kept in one place so the markup is easy to read.
// The 退会 (withdraw) button on the account page uses a fixed position so the
// attacker can line its decoy up with it reliably — see packages/attacker.

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );

const shell = (title: string, body: string): string => `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #f1f5f9;
        color: #0f172a;
      }
      .brand {
        background: #1d4ed8;
        color: #fff;
        padding: 14px 20px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .card {
        max-width: 420px;
        margin: 40px auto;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
        padding: 28px;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 16px;
      }
      label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin: 14px 0 6px;
      }
      input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 15px;
      }
      .primary {
        margin-top: 20px;
        width: 100%;
        padding: 11px 12px;
        border: 0;
        border-radius: 8px;
        background: #1d4ed8;
        color: #fff;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      .hint {
        margin-top: 16px;
        font-size: 13px;
        color: #475569;
        background: #f8fafc;
        border: 1px dashed #cbd5e1;
        border-radius: 8px;
        padding: 10px 12px;
      }
      .error {
        margin: 12px 0 0;
        color: #b91c1c;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="brand">SecureBook アカウント</div>
    ${body}
  </body>
</html>`;

export const loginPage = (error?: string): string =>
  shell(
    "ログイン - SecureBook",
    `<main class="card">
      <h1>ログイン</h1>
      <form method="post" action="/login">
        <label for="username">ユーザー名</label>
        <input id="username" name="username" autocomplete="username" value="alice" />
        <label for="password">パスワード</label>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          value="password123"
        />
        ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
        <button class="primary" type="submit">ログイン</button>
      </form>
      <p class="hint">
        デモ用アカウント: <strong>alice</strong> / <strong>password123</strong><br />
        （入力済みなのでそのままログインできます）
      </p>
    </main>`,
  );

// The account page is the one that gets framed by the attacker. The withdraw
// button is intentionally placed at a fixed screen position.
export const accountPage = (username: string): string =>
  shell(
    "アカウント設定 - SecureBook",
    `<style>
      .account {
        max-width: 480px;
        margin: 28px auto 0;
        padding: 0 20px;
      }
      .account h1 {
        font-size: 22px;
      }
      .account p {
        line-height: 1.6;
        color: #334155;
      }
      .danger-zone {
        margin-top: 20px;
        border: 1px solid #fecaca;
        background: #fff1f2;
        border-radius: 12px;
        padding: 16px 18px;
      }
      .danger-zone h2 {
        margin: 0 0 6px;
        font-size: 15px;
        color: #b91c1c;
      }
      .danger-zone p {
        margin: 0;
        font-size: 13px;
        color: #7f1d1d;
      }
      /* Fixed position so the attacker can align a decoy over it. */
      .withdraw {
        position: fixed;
        top: 360px;
        left: 50%;
        transform: translateX(-50%);
        width: 260px;
        height: 56px;
        border: 0;
        border-radius: 10px;
        background: #dc2626;
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
      }
    </style>
    <main class="account">
      <h1>こんにちは、${escapeHtml(username)} さん</h1>
      <p>ここは SecureBook のアカウント設定ページです。プロフィールの編集や退会ができます。</p>
      <div class="danger-zone">
        <h2>危険な操作</h2>
        <p>退会すると、アカウントと投稿がすべて削除されます。この操作は取り消せません。</p>
      </div>
      <form method="post" action="/account/delete">
        <button class="withdraw" type="submit">退会する（アカウント削除）</button>
      </form>
    </main>`,
  );

export const deletedPage = (): string =>
  shell(
    "退会が完了しました - SecureBook",
    `<main class="card">
      <h1>退会が完了しました</h1>
      <p>アカウントは削除されました。ご利用ありがとうございました。</p>
      <p class="hint">
        デモを再実行するには、攻撃側ページの「アカウントを復活（リセット）」を押してから、
        もう一度ログインしてください。
      </p>
    </main>`,
  );
