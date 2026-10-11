/* Token Burn Theater — client math only; never invents usage numbers */
(function () {
  "use strict";

  const LS_KEY = "token-burn-override-v1";
  const CAP = 95;
  const WEEK_H = 168;
  const TZ = "America/New_York";

  /** @type {any} */
  let DATA = window.__DATA__ || null;
  let sparks = [];
  let animT = 0;
  let displayUsed = 0;
  let targetUsed = 0;

  const $ = (id) => document.getElementById(id);

  function parseET(iso) {
    // Accept ...-04:00 / -0400 / Z
    if (!iso) return null;
    const s = String(iso).replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtET(d, opts) {
    if (!d) return "—";
    return d.toLocaleString("en-US", { timeZone: TZ, ...(opts || {}) });
  }

  function hoursBetween(a, b) {
    return (b.getTime() - a.getTime()) / 3600000;
  }

  function paceAt(when, lastReset) {
    const elapsed = Math.max(0, Math.min(WEEK_H, hoursBetween(lastReset, when)));
    const weekFrac = elapsed / WEEK_H;
    return {
      elapsed_h: elapsed,
      remaining_h: Math.max(0, WEEK_H - elapsed),
      week_elapsed_pct: weekFrac * 100,
      target_pct: weekFrac * CAP,
    };
  }

  function statusOf(used, target) {
    const gap = target - used;
    if (gap > 1) return { id: "behind", label: "BEHIND", gap };
    if (gap < -1) return { id: "ahead", label: "AHEAD", gap };
    return { id: "onpace", label: "ON PACE", gap };
  }

  function loadOverride() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveOverride(obj) {
    if (!obj) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(obj));
  }

  function resolveReading(bundle) {
    const u = bundle.usage || {};
    const ov = loadOverride();
    const lastReset = parseET(bundle.history.last_reset || u.reset_at || "2026-10-08T19:42:00-04:00");
    const nextReset = parseET(bundle.history.next_reset || u.reset_at || "2026-10-15T19:42:00-04:00");

    let used = Number(u.used_pct);
    let checkedAt = parseET(u.checked_at);
    let sourceNote = u.source || "usage.json";
    let overrideActive = false;

    if (ov && ov.used_pct != null && !isNaN(Number(ov.used_pct))) {
      used = Number(ov.used_pct);
      checkedAt = ov.when ? parseET(ov.when) : new Date();
      sourceNote = "localStorage override · " + (ov.note || "manual paste");
      overrideActive = true;
    }

    const now = new Date();
    // Live target for theater; used% stays from logged reading (or override)
    const live = paceAt(now, lastReset);
    const atCheck = checkedAt ? paceAt(checkedAt, lastReset) : live;
    const st = statusOf(used, live.target_pct);

    // Projection from logged history points only
    const pts = (bundle.history.points || []).slice().sort((a, b) => parseET(a.t) - parseET(b.t));
    let rate = null;
    let projEOW = null;
    let projNote = "Need ≥2 logged points for burn-rate projection.";
    if (pts.length >= 2) {
      const a = pts[0], b = pts[pts.length - 1];
      const ta = parseET(a.t), tb = parseET(b.t);
      const dh = hoursBetween(ta, tb);
      if (dh > 0) {
        rate = (Number(b.used_pct) - Number(a.used_pct)) / dh;
        const hoursLeftFromLast = hoursBetween(tb, nextReset);
        projEOW = Number(b.used_pct) + rate * hoursLeftFromLast;
        projNote =
          `Projected finish = last_logged% + ((last% − first%) ÷ hours_between) × hours_to_reset` +
          ` = ${Number(b.used_pct).toFixed(1)} + (${rate.toFixed(4)} pts/h × ${hoursLeftFromLast.toFixed(1)} h)` +
          ` ≈ ${Math.max(0, projEOW).toFixed(1)}% (from ${pts.length} logged points only).`;
      }
    }

    return {
      used,
      checkedAt,
      lastReset,
      nextReset,
      live,
      atCheck,
      status: st,
      sourceNote,
      overrideActive,
      label: u.label || "Grok Bot weekly included usage",
      account: u.account || "",
      on_demand: u.on_demand || "disabled",
      cursor_models_pct: u.cursor_models_pct,
      other_models_pct: u.other_models_pct,
      rate,
      projEOW,
      projNote,
      points: pts,
      ships: (bundle.ships && bundle.ships.ships) || [],
      resetNote: u.reset_note || "",
    };
  }

  async function fetchBundle() {
    if (DATA) return DATA;
    const [usage, history, ships] = await Promise.all([
      fetch("/data/usage.json").then((r) => r.json()),
      fetch("/data/history.json").then((r) => r.json()),
      fetch("/data/ships.json").then((r) => r.json()),
    ]);
    DATA = { usage, history, ships };
    return DATA;
  }

  function renderShips(ships) {
    const grid = $("ship-grid");
    grid.innerHTML = ships
      .map((s) => {
        const port = s.port != null ? `<span class="port">:${s.port}</span>` : `<span class="port">local</span>`;
        return `<article class="ship-card">
          <span class="tag">${escapeHtml(s.tag || "")}</span>
          <p class="name">${escapeHtml(s.name)}</p>
          <p class="meta">${escapeHtml(s.when || "")}</p>
          ${port}
        </article>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHistList(points) {
    $("hist-list").innerHTML = points
      .map((p) => {
        const d = parseET(p.t);
        const label = fmtET(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return `<li>${escapeHtml(label)} → <strong>${Number(p.used_pct)}%</strong></li>`;
      })
      .join("");
  }

  function updateCountdown(nextReset) {
    const tick = () => {
      const now = new Date();
      let ms = nextReset.getTime() - now.getTime();
      if (ms < 0) ms = 0;
      const totalSec = Math.floor(ms / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      const txt = `${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      $("countdown").textContent = txt;
      $("sc-cd").textContent = `Reset in ${txt}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  function briefing(state) {
    const gap = state.status.gap;
    const hrs = state.live.remaining_h;
    const check = fmtET(state.checkedAt, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const ov = state.overrideActive ? " (manual override)" : "";
    if (gap > 1) {
      return (
        `You're <strong>${gap.toFixed(1)} points behind</strong> the straight-line 95% pace. ` +
        `Logged use is <strong>${state.used}%</strong> as of ${check}${ov}; ` +
        `live target right now is <strong>${state.live.target_pct.toFixed(1)}%</strong>. ` +
        `About <strong>${hrs.toFixed(0)} hours</strong> remain until Thursday ~7:42 PM ET reset.`
      );
    }
    if (gap < -1) {
      return (
        `You're <strong>${Math.abs(gap).toFixed(1)} points ahead</strong> of pace. ` +
        `Logged ${state.used}% (check ${check}${ov}) vs live target ${state.live.target_pct.toFixed(1)}%. ` +
        `${hrs.toFixed(0)} hours left in the week.`
      );
    }
    return (
      `You're roughly <strong>on pace</strong>. Logged ${state.used}% (check ${check}${ov}) ` +
      `vs live target ${state.live.target_pct.toFixed(1)}%. ${hrs.toFixed(0)} hours left.`
    );
  }

  function paintUI(state) {
    targetUsed = state.used;
    $("used-pct").textContent = String(state.used);
    $("check-time").textContent = fmtET(state.checkedAt, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    $("target-pct").textContent = state.live.target_pct.toFixed(1);
    const badge = $("status-badge");
    badge.textContent = state.status.label;
    badge.className = "badge " + state.status.id;

    $("gap-briefing").innerHTML = briefing(state);
    $("gap-pts").textContent =
      (state.status.gap >= 0 ? "−" : "+") + Math.abs(state.status.gap).toFixed(1) + " pts";
    $("week-elapsed").textContent = state.live.week_elapsed_pct.toFixed(1) + "%";
    $("hours-left").textContent = state.live.remaining_h.toFixed(1) + " h";
    $("proj-eow").textContent =
      state.projEOW != null ? Math.max(0, state.projEOW).toFixed(1) + "%" : "n/a";
    $("formula").textContent =
      "target = (hours since last reset ÷ 168) × 95  ·  live target now = " +
      state.live.target_pct.toFixed(2) +
      "%  ·  at check = " +
      state.atCheck.target_pct.toFixed(2) +
      "%";
    $("source-line").textContent =
      state.label +
      " · " +
      state.sourceNote +
      (state.account ? " · " + state.account : "") +
      " · on-demand " +
      state.on_demand;
    $("proj-note").textContent = state.projNote;
    $("timeline-caption").textContent =
      fmtET(state.lastReset, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) +
      " → " +
      fmtET(state.nextReset, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) +
      " ET";

    // Share card
    $("sc-used").textContent = String(state.used);
    $("sc-target").textContent = state.live.target_pct.toFixed(1);
    $("sc-status").textContent = state.status.label;
    $("sc-gap").textContent =
      state.status.gap > 1
        ? `${state.status.gap.toFixed(1)} pts behind pace`
        : state.status.gap < -1
          ? `${Math.abs(state.status.gap).toFixed(1)} pts ahead of pace`
          : "On pace (±1 pt)";

    renderShips(state.ships);
    renderHistList(state.points);
    drawTimeline(state);
    drawHistory(state);
    setupScenario(state);
    updateCountdown(state.nextReset);

    // particle intensity when behind
    window.__burnState = state;
  }

  /* ---------- Hero canvas: arc + sparks ---------- */
  function drawHero(ctx, w, h, used, target, behind) {
    const cx = w / 2, cy = h / 2 + 10;
    const R = Math.min(w, h) * 0.38;
    ctx.clearRect(0, 0, w, h);

    // outer glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 18, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(61,224,255,0.08)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // track
    const start = -Math.PI * 0.75;
    const end = Math.PI * 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, end);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.stroke();

    // target tick arc (faint cyan)
    const tAng = start + (Math.min(100, target) / 100) * (end - start);
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, tAng);
    ctx.strokeStyle = "rgba(61,224,255,0.35)";
    ctx.lineWidth = 18;
    ctx.stroke();

    // used burn arc
    const uAng = start + (Math.min(100, used) / 100) * (end - start);
    const grad = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, "#ffb347");
    grad.addColorStop(0.5, "#ff6b2c");
    grad.addColorStop(1, "#ff3d6d");
    ctx.beginPath();
    ctx.arc(cx, cy, R, start, uAng);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 18;
    ctx.stroke();

    // target marker
    const tx = cx + Math.cos(tAng) * R;
    const ty = cy + Math.sin(tAng) * R;
    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#3de0ff";
    ctx.shadowColor = "#3de0ff";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // used tip ember
    const ux = cx + Math.cos(uAng) * R;
    const uy = cy + Math.sin(uAng) * R;
    ctx.beginPath();
    ctx.arc(ux, uy, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#ff6b2c";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;

    // center labels
    ctx.fillStyle = "rgba(232,237,247,0.55)";
    ctx.font = "600 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("USED", cx, cy - 28);
    ctx.fillStyle = "#ffe0c2";
    ctx.font = "800 42px system-ui";
    ctx.fillText(used.toFixed(used % 1 ? 1 : 0) + "%", cx, cy + 12);
    ctx.fillStyle = "rgba(125,240,255,0.85)";
    ctx.font = "600 13px ui-monospace, monospace";
    ctx.fillText("target " + target.toFixed(1) + "%", cx, cy + 36);

    // sparks when behind
    if (behind) {
      if (sparks.length < 40 && Math.random() < 0.45) {
        const a = start + Math.random() * (uAng - start + 0.2);
        sparks.push({
          x: cx + Math.cos(a) * (R + (Math.random() * 10 - 2)),
          y: cy + Math.sin(a) * (R + (Math.random() * 10 - 2)),
          vx: (Math.random() - 0.5) * 1.8,
          vy: -1.2 - Math.random() * 2.2,
          life: 40 + Math.random() * 40,
          hue: 20 + Math.random() * 30,
        });
      }
    }
    sparks = sparks.filter((p) => p.life > 0);
    for (const p of sparks) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.life -= 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5 + (p.life / 80), 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,65%,${Math.min(1, p.life / 30)})`;
      ctx.fill();
    }
  }

  let heroBooted = false;
  function loopHero() {
    const canvas = $("burn-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = 520;
    if (canvas.width !== css * dpr) {
      canvas.width = css * dpr;
      canvas.height = css * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    animT += 1;
    // Snap on first frame so screenshots / first paint show the real logged %, then ease
    if (!heroBooted && targetUsed > 0) {
      displayUsed = targetUsed;
      heroBooted = true;
    } else {
      displayUsed += (targetUsed - displayUsed) * 0.12;
    }
    const st = window.__burnState;
    const target = st ? st.live.target_pct : 0;
    const behind = st ? st.status.gap > 1 : false;
    drawHero(ctx, css, css, displayUsed, target, behind);
    requestAnimationFrame(loopHero);
  }

  /* ---------- Timeline ---------- */
  function drawTimeline(state) {
    const canvas = $("timeline-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 1100, H = 160;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const pad = 48;
    const y = 78;
    const span = state.nextReset - state.lastReset;
    const xAt = (d) => pad + ((d - state.lastReset) / span) * (W - pad * 2);

    // rail
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();

    // day ticks
    for (let i = 0; i <= 7; i++) {
      const d = new Date(state.lastReset.getTime() + i * 86400000);
      const x = xAt(d);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x, y + 10);
      ctx.stroke();
      ctx.fillStyle = "rgba(138,147,168,0.9)";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      const label = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", day: "numeric" });
      ctx.fillText(label, x, y + 28);
    }

    // logged points
    for (const p of state.points) {
      const t = parseET(p.t);
      if (!t) continue;
      const x = xAt(t);
      const yy = y - 28 - Number(p.used_pct) * 0.6;
      ctx.fillStyle = "#ff6b2c";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffb347";
      ctx.font = "600 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(p.used_pct + "%", x, y - 14);
    }

    // now cursor
    const now = new Date();
    const nx = xAt(now);
    ctx.strokeStyle = "#3de0ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nx, 20);
    ctx.lineTo(nx, H - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#3de0ff";
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("NOW", nx, 16);

    // projected finish marker (if rate known)
    if (state.rate != null && state.rate > 0 && state.projEOW != null) {
      // where on the week would we hit 95%?
      const last = state.points[state.points.length - 1];
      const tb = parseET(last.t);
      const need = CAP - Number(last.used_pct);
      const hoursTo95 = need / state.rate;
      const hit = new Date(tb.getTime() + hoursTo95 * 3600000);
      if (hit <= state.nextReset) {
        const hx = xAt(hit);
        ctx.fillStyle = "#4dffb0";
        ctx.beginPath();
        ctx.moveTo(hx, y - 40);
        ctx.lineTo(hx - 6, y - 28);
        ctx.lineTo(hx + 6, y - 28);
        ctx.closePath();
        ctx.fill();
        ctx.font = "10px system-ui";
        ctx.fillText("→95%", hx, y - 44);
      } else {
        ctx.fillStyle = "rgba(255,77,109,0.9)";
        ctx.font = "11px system-ui";
        ctx.textAlign = "right";
        ctx.fillText("at current rate: miss 95% before reset", W - pad, 18);
      }
    }

    // reset markers
    ctx.fillStyle = "#ffb347";
    ctx.font = "700 10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("RESET", pad - 4, y - 18);
    ctx.textAlign = "right";
    ctx.fillText("RESET", W - pad + 4, y - 18);
  }

  /* ---------- History chart ---------- */
  function drawHistory(state) {
    const canvas = $("history-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 1100, H = 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const pts = state.points;
    if (!pts.length) return;

    const padL = 48, padR = 24, padT = 24, padB = 36;
    const t0 = state.lastReset.getTime();
    const t1 = state.nextReset.getTime();
    const maxY = Math.max(CAP, ...pts.map((p) => Number(p.used_pct)), state.live.target_pct) * 1.05;

    const xAt = (t) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
    const yAt = (v) => padT + (1 - v / maxY) * (H - padT - padB);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.fillStyle = "rgba(138,147,168,0.8)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "right";
    for (let v = 0; v <= maxY; v += 10) {
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(v + "%", padL - 8, y + 3);
    }

    // pace target line (live linear from 0 at last reset to 95 at next)
    ctx.strokeStyle = "rgba(61,224,255,0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(xAt(t0), yAt(0));
    ctx.lineTo(xAt(t1), yAt(CAP));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(61,224,255,0.8)";
    ctx.textAlign = "left";
    ctx.fillText("95% pace line", xAt(t0) + 8, yAt(0) - 8);

    // used polyline
    ctx.strokeStyle = "#ff6b2c";
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const t = parseET(p.t).getTime();
      const x = xAt(t), y = yAt(Number(p.used_pct));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    pts.forEach((p) => {
      const t = parseET(p.t).getTime();
      const x = xAt(t), y = yAt(Number(p.used_pct));
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb347";
      ctx.fill();
      ctx.fillStyle = "#e8edf7";
      ctx.font = "600 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(p.used_pct + "%", x, y - 10);
    });
  }

  /* ---------- Scenario pad ---------- */
  const ARRIVE_LABELS = ["Sat", "Sun", "Mon", "Tue", "Wed"];
  // day offsets from last reset Thursday: Sat=2? Actually arrive-by relative to week.
  // Slider 0..4 maps to calendar days before next reset Wednesday = day before Thu reset.
  // We'll compute "arrive moment" as nextReset - (4-slider)*24h - some hours → Wed 7:42 when slider=3? 
  // Simpler: base = lastReset + (3+slider)*24h roughly Fri..Wed. Better: use fixed Wed Oct 14 7:42 for "Wed".
  function arriveDate(state, slider) {
    // 0=Sat 10, 1=Sun 11, 2=Mon 12, 3=Tue 13, 4=Wed 14 — all ~7:42 PM ET
    const base = new Date(state.lastReset.getTime());
    // lastReset is Thu 8 19:42; Sat = +2d, Sun +3, Mon +4, Tue +5, Wed +6
    const addDays = 2 + slider;
    return new Date(base.getTime() + addDays * 86400000);
  }

  function setupScenario(state) {
    const extra = $("extra-burn");
    const day = $("arrive-day");
    const out = $("scenario-out");
    const render = () => {
      $("extra-label").textContent = extra.value;
      $("arrive-label").textContent = ARRIVE_LABELS[Number(day.value)];
      const add = Number(extra.value);
      const when = arriveDate(state, Number(day.value));
      const hypoUsed = state.used + add;
      const pace = paceAt(when, state.lastReset);
      const gap = pace.target_pct - hypoUsed;
      const leftAfter = hoursBetween(when, state.nextReset);
      const needAfter = Math.max(0, CAP - hypoUsed);
      const reqRate = leftAfter > 0 ? needAfter / leftAfter : 0;
      out.innerHTML =
        `<strong>Hypothetical:</strong> if logged use reaches <strong>${hypoUsed.toFixed(1)}%</strong> by ` +
        `${fmtET(when, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET, ` +
        `pace target then is <strong>${pace.target_pct.toFixed(1)}%</strong> ` +
        `(${gap > 1 ? gap.toFixed(1) + " pts still behind" : gap < -1 ? Math.abs(gap).toFixed(1) + " pts ahead" : "on pace"}). ` +
        `Then you'd need ~<strong>${reqRate.toFixed(2)} pts/h</strong> ` +
        `(${(reqRate * 24).toFixed(1)} pts/day) over the remaining ${leftAfter.toFixed(0)} h to hit 95%.`;
    };
    extra.oninput = render;
    day.oninput = render;
    render();
  }

  /* ---------- Override dialog ---------- */
  function setupOverride(state) {
    const dlg = $("override-dialog");
    $("btn-override").onclick = () => {
      $("ov-used").value = state.used;
      dlg.showModal();
    };
    $("ov-clear").onclick = () => {
      saveOverride(null);
      dlg.close();
      location.reload();
    };
    $("override-form").addEventListener("submit", (e) => {
      const submitter = e.submitter;
      if (submitter && submitter.value === "cancel") return;
      e.preventDefault();
      const used = Number($("ov-used").value);
      const whenRaw = $("ov-when").value;
      let whenIso = new Date().toISOString();
      if (whenRaw) {
        // treat as local ET-ish: browser local
        whenIso = new Date(whenRaw).toISOString();
      }
      saveOverride({
        used_pct: used,
        when: whenIso,
        note: $("ov-note").value || "manual paste",
      });
      dlg.close();
      location.reload();
    });
  }

  /* ---------- Share card ---------- */
  function setupShare() {
    const card = $("share-card");
    $("btn-share").onclick = () => {
      card.classList.toggle("hidden");
      card.setAttribute("aria-hidden", card.classList.contains("hidden") ? "true" : "false");
    };
    card.addEventListener("click", (e) => {
      if (e.target === card) {
        card.classList.add("hidden");
        card.setAttribute("aria-hidden", "true");
      }
    });
    if (new URLSearchParams(location.search).get("view") === "card") {
      document.body.classList.add("card-only");
      card.classList.remove("hidden");
    }
  }

  async function main() {
    const bundle = await fetchBundle();
    const state = resolveReading(bundle);
    paintUI(state);
    setupOverride(state);
    setupShare();
    requestAnimationFrame(loopHero);
  }

  main().catch((err) => {
    console.error(err);
    $("gap-briefing").textContent = "Failed to load usage data: " + err.message;
  });
})();
