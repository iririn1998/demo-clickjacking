import { useEffect, useState } from "react";

const victimOrigin = `http://${window.location.hostname}:5174`;
const protections = {
  none: { label: "対策なし", header: "埋め込みを制限するヘッダーなし" },
  csp: { label: "CSP", header: "Content-Security-Policy: frame-ancestors 'none'" },
  deny: { label: "X-Frame-Options: DENY", header: "X-Frame-Options: DENY" },
  sameorigin: { label: "X-Frame-Options: SAMEORIGIN", header: "X-Frame-Options: SAMEORIGIN" },
} as const;
type Protection = keyof typeof protections;
type DemoState = { isPublic: boolean; publications: number; lastChanged: string | null };

const App = () => {
  const [protection, setProtection] = useState<Protection>("none");
  const [opacity, setOpacity] = useState(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const accountUrl = `${victimOrigin}/account?protection=${protection}`;

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`${victimOrigin}/api/state`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("状態を取得できませんでした。");
        const nextState: DemoState = await response.json();
        if (!controller.signal.aborted) {
          setState(nextState);
          setError("");
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(
            "デモサーバーに接続できません。pnpm dev を起動し、http://127.0.0.1:5173 を開いてください。",
          );
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 700);
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision, busy]);

  const reset = async (nextProtection: Protection = protection) => {
    setProtection(nextProtection);
    setBusy(true);
    setState(null);
    try {
      const response = await fetch(`${victimOrigin}/api/reset`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("リセットに失敗しました。");
      setRevision((value) => value + 1);
      setError("");
    } catch {
      setError("リセットできませんでした。デモサーバーの起動を確認して、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>クリックジャッキングのデモ</h1>
      <p>
        「景品を受け取る」を押したつもりが、別サイトの「プロフィールを全体公開する」を押してしまう仕組みを体験します。
      </p>
      <p>
        <small>
          ローカルの架空サービスだけを使用します。デモ用のログイン状態を用意し、認証手順は省略しています。
        </small>
      </p>

      <section aria-labelledby="controls-title">
        <h2 id="controls-title">1. 条件を選ぶ</h2>
        <div className="controls">
          <label>
            被害側の対策：{" "}
            <select
              value={protection}
              disabled={busy}
              onChange={(event) => void reset(event.target.value as Protection)}
            >
              {Object.entries(protections).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void reset()}>
            非公開に戻してやり直す
          </button>
        </div>
        <p>
          被害ページが返す HTTP レスポンスヘッダー：
          <br />
          <code>{protections[protection].header}</code>
        </p>
        <label className="opacity-control">
          iframe の不透明度：{" "}
          <input
            type="range"
            min="0"
            max="100"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />{" "}
          <output>{opacity}%</output>
        </label>
        <p>
          <small>
            0% = 見えない罠、50% = 重なりを確認、100% =
            被害ページを表示。対策の切り替え時は公開設定をリセットします。
          </small>
        </p>
      </section>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="demo-columns">
        <section aria-labelledby="trap-title">
          <h2 id="trap-title">2. 罠ページをクリックする</h2>
          <p className="origin">
            罠：<code>{window.location.origin}</code>
          </p>
          <div className="trap">
            <h3>プレゼントキャンペーン</h3>
            <p>下のボタンで景品を受け取れます。</p>
            <button className="bait" type="button">
              景品を受け取る
            </button>
            <small>※ クリック誘導のための架空の表示です。</small>
            {state && !busy && !error && (
              <iframe
                key={revision}
                src={accountUrl}
                title="罠の上に重ねたデモ SNS の公開設定"
                className="attack-frame"
                style={{ opacity: opacity / 100 }}
                tabIndex={-1}
              />
            )}
            {(!state || busy || error) && (
              <div className="loading">{error ? "接続を確認してください" : "準備中…"}</div>
            )}
          </div>
          <p>
            <small>iframe が前面にあり、見えなくてもクリックを受け取ります。</small>
          </p>
        </section>

        <section aria-labelledby="result-title">
          <h2 id="result-title">3. 被害側の結果を確認する</h2>
          <p className="origin">
            被害側：<code>{victimOrigin}</code>
          </p>
          <div className="result" aria-live="polite" aria-atomic="true">
            <p>
              プロフィールの公開範囲：
              <strong>{state ? (state.isPublic ? "全体公開" : "非公開") : "確認中…"}</strong>
            </p>
            {state?.isPublic ? (
              <p className="error">
                公開処理が実行されました。景品の取得ではなく、被害ページのフォームが送信されています。
              </p>
            ) : (
              <p>まだ公開処理は実行されていません。</p>
            )}
            <p>公開処理の実行回数：{state?.publications ?? "—"}</p>
            {state?.lastChanged && (
              <p>実行時刻：{new Date(state.lastChanged).toLocaleTimeString("ja-JP")}</p>
            )}
          </div>
          <p>
            <a href={accountUrl} target="_blank" rel="noreferrer">
              被害ページを別タブで開く
            </a>
            （通常の操作も確認できます）
          </p>
          {protection !== "none" && (
            <p>
              この設定ではブラウザーが iframe への表示を拒否します。不透明度を 100%
              にして拒否表示を確認してください。詳細は開発者ツールの Console に表示されます。
            </p>
          )}
        </section>
      </div>

      <section aria-labelledby="explanation-title">
        <h2 id="explanation-title">デモの進め方と仕組み</h2>
        <ol>
          <li>
            「対策なし」「0%」で「景品を受け取る」をクリックし、公開範囲が変わることを確認します。
          </li>
          <li>
            非公開に戻し、不透明度を 50% にすると、2 つのボタンが同じ位置にあることが分かります。
          </li>
          <li>
            CSP または X-Frame-Options を選び、同じクリックで公開されなくなることを確認します。
          </li>
        </ol>
        <p>
          罠ページは別オリジンの被害ページを iframe
          で読み込み、透明にして手前に重ねています。クリックを受けた本物の被害ページが、自分のログイン
          Cookie と CSRF トークン付きで公開処理を送信します。CSRF
          トークンがあっても、この操作は防げません。
        </p>
        <p>
          CSP の <code>frame-ancestors 'none'</code> と X-Frame-Options の <code>DENY</code>{" "}
          は埋め込みを禁止します。<code>SAMEORIGIN</code>{" "}
          は同一オリジンだけを許可しますが、このデモはポート番号が異なるため拒否されます。これらは
          HTML の meta タグではなく、被害ページの HTTP レスポンスヘッダーで設定します。
        </p>
        <p>
          <small>
            結果欄は発表用の観測 API で約 0.7
            秒ごとにサーバーの状態を確認しています。この読み取り・リセット用の CORS
            許可はデモ専用です。攻撃自体には不要です。2
            つのサイトは別オリジンですが同一サイトなので、SameSite=Lax の Cookie
            も送信されます。実際の別サイト間では Cookie 制限により挙動が変わることがあります。
          </small>
        </p>
        <p>
          参考：
          <a
            href="https://www.ipa.go.jp/security/vuln/websecurity/clickjacking.html"
            target="_blank"
            rel="noreferrer"
          >
            IPA：安全なウェブサイトの作り方
          </a>{" "}
          ／{" "}
          <a
            href="https://community.owasp.org/attacks/Clickjacking"
            target="_blank"
            rel="noreferrer"
          >
            OWASP：Clickjacking
          </a>
        </p>
      </section>
    </main>
  );
};

export default App;
