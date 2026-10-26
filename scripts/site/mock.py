"""Working copies of the app for the home page, drawn in HTML instead of screenshots so a visitor can click
through them: the projects, a project's overview, changes with their Why?, health with a Fix, the chats, the experts,
the private details, and what the model receives.
A cursor plays the tour on its own until the visitor clicks in the window. The small pictures in the feature
grid are drawn here too. The texts are M in content.py; build.py execs this after content.py."""


def ring(score, cls="ring"):
    return f'<span class="{cls}" style="--p:{score}"><b>{score}</b></span>'


# A plain arrow, the shape every system draws, so the demo cursor reads as a pointer at once.
CURSOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5v17.2l4.6-4.3 2.9 6.6 2.7-1.2-2.9-6.5 6.3-.3z"/></svg>'


def app_mock(lang):
    m = M[lang]
    side_keys = ["projects", "chats", "experts", "private"]
    side_icons = ["folder", "chat", "users", "lock"]
    side = "".join(
        f'<button type="button" class="item{" on" if i == 0 else ""}" data-side="{k}">{icon(ic)}{name}</button>'
        for i, (k, ic, name) in enumerate(zip(side_keys, side_icons, m["side"])))
    return f"""<div class="stage">
          <div class="app">
            <div class="aside">
              <span class="abrand"><img src="{{base}}logo.svg" width="18" height="18" alt="" /> Igrek</span>
              {side}
            </div>
            <div class="amain">
              <div class="atop"><span class="asearch">{icon("search")}{m["search"]}<kbd>Ctrl K</kbd></span></div>
              {projects_view(m)}
              {shop_view(m)}
              {chats_view(m)}
              {experts_view(m)}
              {private_view(m)}
              <div class="astatus"><i></i>{m["status"]}<span>{m["saved"]}</span><span class="ver">Igrek {{version}}</span></div>
            </div>
            <span class="cursor">{CURSOR}</span>
          </div>
        </div>
        <p class="try"><span>{icon("pointer")}{m["label"]}</span><button type="button" class="replay" hidden>{icon("play")}{m["replay"]}</button></p>"""


def projects_view(m):
    cards = "".join(
        f'<button type="button" class="pcard{" go" if name == "shop" else ""}"{" data-go=shop" if name == "shop" else ""}>'
        f'<span class="phead"><span class="avatar" style="background:{color}">{letter}</span><span><b>{name}</b><code>~/code/{name}</code></span>'
        f'<span class="tag ok">{m["fresh"]}</span></span><span class="pdesc">{desc}</span>'
        f'<span class="pfoot">{icon("branch")}main<span>{when}</span></span></button>'
        for letter, color, name, desc, when in m["cards"])
    return f"""<div class="view" data-view="projects">
                <div class="ahead"><b>{m["projects"]}</b></div>
                <form class="ask">{icon("bot")}<input aria-label="{m["ask"]}" placeholder="{m["ask"]} &quot;{m["ask_example"]}&quot;" data-example="{m["ask_example"]}" /><span class="pick">{m["picks"]}</span><button type="submit" aria-label="{m["ask"]}">{icon("send")}</button></form>
                <p class="reply" hidden>{m["picked"]}</p>
                <div class="pgrid">{cards}</div>
              </div>"""


def shop_view(m):
    tabs = "".join(
        f'<button type="button" class="tab{" on" if i == 0 else ""}" data-tab="{i}">{name}</button>' for i, name in enumerate(m["tabs"]))
    done = "".join(f"<li>{x}</li>" for x in m["done_list"])
    still = "".join(f"<li>{x}</li>" for x in m["open_list"])
    sessions = "".join(f'<div class="srow"><i></i><b>{a}</b><code>Opus 5.5</code><span class="tag ok">{m["fresh"]}</span><span>{w}</span></div>'
                       for a, w in m["ov_sessions"])
    flow = "".join(f'<p class="warn">{icon("info")}{x}</p>' for x in m["ov_flow_items"])
    files = "".join(file_row(m, f) for f in m["files"])
    parts = "".join(f'<div class="part">{ring(n)}<span>{name}</span></div>' for name, n in m["parts"] + m["parts_more"])
    return f"""<div class="view" data-view="shop" hidden>
                <div class="ahead"><button type="button" class="back" data-go="projects" aria-label="{m["projects"]}">{icon("back")}</button><b>shop</b><span class="tag ok">{m["fresh"]}</span></div>
                <div class="tabs">{tabs}</div>
                <div class="panel" data-panel="0">
                  <div class="ovgrid">
                    <div class="box"><small>{m["latest"]}</small><h4>{m["session"]}</h4><p>{m["goal"]}</p>
                      <h5>{m["done"]}</h5><ul>{done}</ul><h5>{m["open"]}</h5><ul>{still}</ul></div>
                    <div class="box side">
                      <small>{m["ov_folder"]}</small><code class="path">{m["ov_path"]}</code>
                      <p class="branch">{icon("branch")}main <span class="tag acc">{m["ov_ahead"]}</span><span class="tag wn">{m["ov_dirty"]}</span></p>
                      <p class="commit"><b>{m["ov_commit"]}</b><span>{m["ov_meta"]}</span></p>
                    </div>
                    <div class="box"><small>{m["ov_recent"]}</small>{sessions}</div>
                    <div class="box side"><small>{m["ov_flow"]}</small>{flow}</div>
                  </div>
                </div>
                <div class="panel" data-panel="1" hidden><div class="box flist">{files}</div></div>
                <div class="panel" data-panel="2" hidden>
                  <div class="box hbox">{ring(92, "ring big").replace('class="ring big"', 'class="ring big" id="score"')}
                    <div class="htext"><h4>{m["health"]}</h4><p>{m["health_sub"]}</p><small class="scanned">{m["scanned"]}</small></div>
                    <div class="trend"><small>{m["trend"]}</small><svg viewBox="0 0 120 36" aria-hidden="true"><polyline points="0,30 20,26 40,27 60,18 80,14 100,12 120,8" /></svg></div>
                    <button type="button" class="abtn" id="scan" data-scanning="{m["scanning"]}" data-scanned="{m["scanned"]}">{m["scan"]}</button>
                  </div>
                  <div class="parts">{parts}</div>
                  <div class="box finding" id="finding"><div><b>{m["finding"]}</b><p>{m["finding_sub"]}</p>
                    <div class="fixcmd" hidden><code>{m["fix_cmd"]}</code><button type="button" class="abtn" id="run">{m["run"]}</button></div>
                    <p class="fixed" hidden>{icon("check")}{m["fixed"]}</p></div>
                    <button type="button" class="abtn" id="fix">{icon("wrench")}{m["fix"]}</button></div>
                  <div class="box finding"><div><b>{m["finding2"]}</b><p>{m["finding2_sub"]}</p>
                    <p class="answer" hidden>{icon("users")}{m["sec_reply"]}</p></div>
                    <button type="button" class="abtn" id="asksec">{icon("users")}{m["ask_sec"]}</button></div>
                </div>
              </div>"""


def chats_view(m):
    rows = "".join(
        f'<button type="button" class="crow{" on" if i == 0 else ""}" data-chat="{i}"><b>{t}</b><span>{p} · {w}</span></button>'
        for i, (t, p, w, *_rest) in enumerate(m["chats"]))
    panes = "".join(
        f'<div class="cpane" data-pane="{i}"{"" if i == 0 else " hidden"}><div class="chead"><b>{t}</b><span>{p}</span></div>'
        f'<div class="msgs"><p class="umsg">{u}</p><div class="amsg">{icon("bot")}<p data-text="{a}">{a}</p></div>'
        f'<p class="tool">{icon("file")}<code>{f}</code><span class="add">{add}</span><span class="del">{rem}</span></p></div></div>'
        for i, (t, p, w, u, a, f, add, rem) in enumerate(m["chats"]))
    return f"""<div class="view chats" data-view="chats" hidden>
                <div class="clist"><div class="ahead"><b>{m["chats_h"]}</b></div>{rows}</div>
                <div class="cmain">{panes}
                  <div class="composer"><span>{m["composer"]}</span><code>Opus 5.5</code>{icon("send")}</div>
                  <p class="limit"><i style="--p:29"></i>{m["limit"]}</p>
                </div>
              </div>"""


def experts_view(m):
    cards = "".join(
        f'<div class="ecard"><div class="ehead"><span class="avatar e">{name[0]}</span><span><b>{name}</b><small>{field}</small></span></div>'
        f'<p class="answer" hidden>{reply}</p><div class="efoot"><span class="tag">{m["readonly"]}</span><button type="button" class="abtn ask-ex">{m["ask_btn"]}</button></div></div>'
        for name, field, reply in m["experts"])
    return f"""<div class="view" data-view="experts" hidden>
                <div class="ahead"><b>{m["experts_h"]}</b><span class="sub">{m["experts_sub"]}</span></div>
                <div class="egrid">{cards}</div>
              </div>"""


def private_view(m):
    rows = "".join(
        f'<tr><td>{name}</td><td><code class="val" data-real="{real}" data-mask="{mask}">{mask}</code></td>'
        f'<td><code class="ph">{ph}</code></td><td><button type="button" class="abtn show" data-show="{m["show"]}" data-hide="{m["hide"]}">{m["show"]}</button></td></tr>'
        for name, mask, real, ph in m["priv"])
    c = m["priv_cols"]
    return f"""<div class="view" data-view="private" hidden>
                <div class="ahead"><b>{m["priv_h"]}</b><span class="sub">{m["priv_sub"]}</span></div>
                <div class="box ptable"><table><thead><tr><th>{c[0]}</th><th>{c[1]}</th><th>{c[2]}</th><th></th></tr></thead><tbody>{rows}</tbody></table></div>
              </div>"""


def file_row(m, f, open_=False):
    path, add, rem, req, step, exp = f
    return (f'<div class="frow"><span class="fname">{icon("file")}<code>{path}</code><span class="add">{add}</span><span class="del">{rem}</span></span>'
            f'<button type="button" class="why{" on" if open_ else ""}">{m["why"]}</button>'
            f'<dl class="whybox"{"" if open_ else " hidden"}><dt>{m["w_req"]}</dt><dd>{req}</dd><dt>{m["w_step"]}</dt><dd>{step}</dd><dt>{m["w_exp"]}</dt><dd>{exp}</dd></dl></div>')


def bento(lang, features):
    """The feature grid: each cell has a small moving picture of the thing it describes."""
    m = M[lang]
    real = m["p_real"]
    chips = "".join(f'<span class="chip" style="--i:{i}">{x}</span>' for i, x in enumerate(m["b_experts"]))
    vis = [
        f'<div class="box flist">{file_row(m, m["files"][1], True)}</div>',
        f'<div class="ask static">{icon("bot")}<span class="typed" style="--n:{len(m["b_task"])}">{m["b_task"]}</span></div>'
        f'<div class="picked"><span class="chip" style="--i:0">shop</span><span class="chip" style="--i:1">invoice-api</span></div>',
        '<span class="ring big grow"><b>100</b></span>',
        f'<div class="swap"><span class="lbl">IBAN</span><span class="vals"><code class="real">{real["iban"]}</code><code class="ph">[[private:iban]]</code></span></div>'
        f'<div class="swap"><span class="lbl">.env</span><span class="vals"><code class="real">STRIPE_KEY={real["key"]}</code><code class="ph">[[env:STRIPE_KEY]]</code></span></div>',
        f'<div class="chips">{chips}</div>',
        f'<div class="rules"><span class="fchip">{icon("file")}CLAUDE.md</span><span class="flow"></span><span class="fchip">{icon("file")}AGENTS.md</span></div>'
        f'<div class="rnote"><span>{m["b_rules"]}</span><span class="abtn">{m["b_merge"]}</span></div>',
    ]
    spans = [2, 1, 1, 2, 1, 2]
    return "\n".join(
        f'            <div class="cell reveal span{spans[i]}"><div class="vis mini">{vis[i]}</div><h3>{a}</h3><p>{b}</p></div>'
        for i, (a, b) in enumerate(features))


def privacy_mock(lang):
    m = M[lang]
    real = m["p_real"]
    you = m["p_msg"].format(**{k: f"<mark>{v}</mark>" for k, v in real.items()})
    model = m["p_msg"].format(amount="<mark>[[private:amount]]</mark>", iban="<mark>[[private:iban]]</mark>", key="<mark>[[env:STRIPE_KEY]]</mark>")
    return f"""<div class="app chat">
              <div class="seg"><button type="button" class="on" data-see="you">{icon("eye")}{m["p_you"]}</button><button type="button" data-see="model">{icon("lock")}{m["p_model"]}</button></div>
              <div class="bubble" data-show="you">{you}</div>
              <div class="bubble model" data-show="model" hidden>{model}</div>
              <p class="cnote" data-show="you">{m["p_note_you"]}</p>
              <p class="cnote" data-show="model" hidden>{m["p_note_model"]}</p>
            </div>"""


MOCK_JS = """    <script>
      // The working copies: plain clicks, nothing leaves the page.
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const app = document.querySelector(".app:not(.chat)");
      const $ = (s) => app.querySelector(s);
      const show = (all, on) => {
        for (const el of all) el.hidden = !on(el);
      };
      const side = (k) => {
        for (const b of app.querySelectorAll("[data-side]")) b.classList.toggle("on", b.dataset.side === k);
      };
      const go = (v) => {
        show(app.querySelectorAll("[data-view]"), (el) => el.dataset.view === v);
        side(v === "shop" ? "projects" : v);
        if (v === "chats") openChat(app.querySelector(".crow.on").dataset.chat);
      };
      const tab = (n) => {
        for (const b of app.querySelectorAll(".tab")) b.classList.toggle("on", b.dataset.tab === n);
        show(app.querySelectorAll("[data-panel]"), (el) => el.dataset.panel === n);
      };
      const setScore = (n) => {
        const s = $("#score");
        s.style.setProperty("--p", n);
        s.querySelector("b").textContent = n;
      };
      // An answer is written out the way a model streams it, not dropped in whole.
      let streaming = 0;
      const openChat = (i) => {
        for (const b of app.querySelectorAll(".crow")) b.classList.toggle("on", b.dataset.chat === i);
        show(app.querySelectorAll("[data-pane]"), (el) => el.dataset.pane === i);
        const p = app.querySelector(`[data-pane="${i}"] [data-text]`);
        const tool = p.closest(".msgs").querySelector(".tool");
        const words = p.dataset.text.split(" ");
        clearInterval(streaming);
        tool.hidden = true;
        if (calm) {
          tool.hidden = false;
          return;
        }
        let n = 0;
        p.textContent = "";
        streaming = setInterval(() => {
          p.textContent = words.slice(0, ++n).join(" ");
          if (n >= words.length) {
            clearInterval(streaming);
            tool.hidden = false;
          }
        }, 45);
      };
      const reveal = (btn) => {
        btn.closest(".finding, .ecard").querySelector(".answer").hidden = false;
        btn.disabled = true;
      };
      app.addEventListener("click", (e) => {
        const t = e.target.closest("button");
        if (!t) return;
        if (t.dataset.go) go(t.dataset.go);
        if (t.dataset.side) go(t.dataset.side);
        if (t.dataset.tab) tab(t.dataset.tab);
        if (t.dataset.chat) openChat(t.dataset.chat);
        if (t.id === "asksec" || t.classList.contains("ask-ex")) reveal(t);
        if (t.classList.contains("show")) {
          const v = t.closest("tr").querySelector(".val");
          const open = v.textContent === v.dataset.mask;
          v.textContent = open ? v.dataset.real : v.dataset.mask;
          t.textContent = open ? t.dataset.hide : t.dataset.show;
        }
        if (t.classList.contains("why")) {
          const box = t.nextElementSibling;
          box.hidden = !box.hidden;
          t.classList.toggle("on", !box.hidden);
        }
        if (t.id === "scan") {
          const note = $(".scanned");
          note.textContent = t.dataset.scanning;
          $(".hbox").classList.add("scanning");
          setTimeout(() => {
            note.textContent = t.dataset.scanned;
            $(".hbox").classList.remove("scanning");
          }, 1400);
        }
        if (t.id === "fix") {
          t.hidden = true;
          $(".fixcmd").hidden = false;
        }
        if (t.id === "run") {
          $(".fixcmd").hidden = true;
          $(".fixed").hidden = false;
          $("#finding").classList.add("done");
          // Count up so the change is seen, not just swapped.
          let n = Number($("#score b").textContent);
          const step = () => {
            setScore(++n);
            if (n < 96) setTimeout(step, 70);
          };
          step();
        }
      });
      $(".ask").addEventListener("submit", (e) => {
        e.preventDefault();
        $(".reply").hidden = false;
        const card = $(".pcard.go");
        card.classList.add("flash");
        setTimeout(() => card.classList.remove("flash"), 1600);
      });
      const reset = () => {
        go("projects");
        tab("0");
        $(".ask input").value = "";
        $(".reply").hidden = true;
        for (const b of app.querySelectorAll(".why")) {
          b.classList.remove("on");
          b.nextElementSibling.hidden = true;
        }
        for (const a of app.querySelectorAll(".answer")) a.hidden = true;
        for (const b of app.querySelectorAll("#asksec, .ask-ex")) b.disabled = false;
        for (const t of app.querySelectorAll(".show")) {
          const v = t.closest("tr").querySelector(".val");
          v.textContent = v.dataset.mask;
          t.textContent = t.dataset.show;
        }
        for (const b of app.querySelectorAll(".crow")) b.classList.toggle("on", b.dataset.chat === "0");
        $("#fix").hidden = false;
        $(".fixcmd").hidden = true;
        $(".fixed").hidden = true;
        $("#finding").classList.remove("done");
        setScore(92);
      };

      // The tour: a cursor that does what a visitor would, until the visitor does it themselves.
      const cursor = $(".cursor");
      const replay = document.querySelector(".replay");
      let run = 0;
      const live = (id) => {
        if (id !== run) throw new Error("stopped");
      };
      const moveTo = async (id, el, ms = 800) => {
        live(id);
        const a = app.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        cursor.style.transform = `translate(${r.left - a.left + r.width * 0.5}px, ${r.top - a.top + r.height * 0.55}px)`;
        await wait(ms);
      };
      // The tour waits while the window is off screen or the tab is hidden, so it costs nothing there.
      let onScreen = false;
      new IntersectionObserver((seen) => {
        onScreen = seen[seen.length - 1].isIntersecting;
      }).observe(app);
      const press = async (id, el, after = 650) => {
        while (!onScreen || document.hidden) {
          live(id);
          await wait(300);
        }
        await moveTo(id, el);
        cursor.classList.add("press");
        await wait(140);
        live(id);
        el.click();
        cursor.classList.remove("press");
        await wait(after);
      };
      const type = async (id, input, text) => {
        for (const ch of text) {
          live(id);
          input.value += ch;
          await wait(38 + Math.random() * 40);
        }
      };
      const tour = async () => {
        const id = ++run;
        app.classList.add("touring");
        replay.hidden = true;
        try {
          for (;;) {
            reset();
            await wait(700);
            const input = $(".ask input");
            await press(id, input, 200);
            await type(id, input, input.dataset.example);
            await press(id, $(".ask button"), 1500);
            await press(id, $(".pcard.go"), 1800);
            await press(id, app.querySelector(".tab[data-tab='1']"), 500);
            await press(id, app.querySelectorAll(".why")[1], 2200);
            await press(id, app.querySelector(".tab[data-tab='2']"), 700);
            await press(id, $("#scan"), 1700);
            await press(id, $("#fix"), 900);
            await press(id, $("#run"), 1500);
            await press(id, $("#asksec"), 2200);
            await press(id, app.querySelector("[data-side='chats']"), 3600);
            await press(id, app.querySelector(".crow[data-chat='1']"), 4200);
            await press(id, app.querySelector("[data-side='experts']"), 700);
            await press(id, app.querySelectorAll(".ask-ex")[3], 2000);
            await press(id, app.querySelector("[data-side='private']"), 900);
            await press(id, app.querySelector(".show"), 2200);
            await press(id, app.querySelector("[data-side='projects']"), 900);
          }
        } catch {
          // The visitor took over; their clicks now drive the window.
        }
      };
      const stop = () => {
        if (!app.classList.contains("touring")) return;
        run++;
        app.classList.remove("touring");
        replay.hidden = false;
      };
      app.addEventListener("pointerdown", (e) => e.isTrusted && stop());
      app.addEventListener("keydown", (e) => e.isTrusted && stop());
      replay.addEventListener("click", () => tour());
      if (calm) replay.hidden = false;
      else
        new IntersectionObserver((seen, o) => {
          if (seen.some((s) => s.isIntersecting)) {
            o.disconnect();
            tour();
          }
        }, { threshold: 0.35 }).observe(app);

      // The window lies back a little and stands up as it scrolls into view.
      const stage = document.querySelector(".stage");
      const tilt = () => {
        const r = stage.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (r.top - innerHeight * 0.12) / (innerHeight * 0.55)));
        stage.style.setProperty("--tilt", `${(t * 16).toFixed(2)}deg`);
        stage.style.setProperty("--lift", t.toFixed(3));
      };
      let frame = 0;
      if (!calm) {
        addEventListener(
          "scroll",
          () => {
            if (!frame)
              frame = requestAnimationFrame(() => {
                frame = 0;
                tilt();
              });
          },
          { passive: true },
        );
        tilt();
      }

      // What the model receives: it switches by itself until someone picks a side.
      const chat = document.querySelector(".app.chat");
      const see = (v) => {
        for (const b of chat.querySelectorAll("[data-see]")) b.classList.toggle("on", b.dataset.see === v);
        show(chat.querySelectorAll("[data-show]"), (el) => el.dataset.show === v);
      };
      let flip = calm ? 0 : setInterval(() => see(chat.querySelector("[data-see].on").dataset.see === "you" ? "model" : "you"), 3200);
      chat.addEventListener("click", (e) => {
        const t = e.target.closest("[data-see]");
        if (!t) return;
        clearInterval(flip);
        flip = 0;
        see(t.dataset.see);
      });

      // Sections come in as they are reached; feature cells light up under the pointer.
      const io = new IntersectionObserver(
        (seen) => {
          for (const s of seen)
            if (s.isIntersecting) {
              s.target.classList.add("in");
              io.unobserve(s.target);
            }
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
      );
      for (const el of document.querySelectorAll(".reveal")) io.observe(el);
      for (const c of document.querySelectorAll(".cell"))
        c.addEventListener("pointermove", (e) => {
          const r = c.getBoundingClientRect();
          c.style.setProperty("--x", `${e.clientX - r.left}px`);
          c.style.setProperty("--y", `${e.clientY - r.top}px`);
        });
    </script>
"""
