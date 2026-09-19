/**
 * Thermo Plus — Home Assistant Lovelace.
 * Round thermostat dial, heat/cool runtime, and daily high/low history.
 */
(function () {
  const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
  const { html, css } = LitElement.prototype;

  const DEFAULTS = Object.freeze({
    name: "Thermostat",
    look: "classic",
    size: "100",
    show_history: false,
    history_days: 14,
    show_dial: true,
    show_outdoor: true,
    show_humidity: true,
    unit_system: "auto",
  });

  const LOOKS = Object.freeze({
    classic: { label: "Classic round" },
    modern: { label: "Modern dial" },
    digital: { label: "Digital face" },
  });

  const LEGACY_LOOKS = Object.freeze({
    lab: "classic",
    mercury: "classic",
    galileo: "modern",
    nixie: "digital",
  });

  const MODE_LABEL = Object.freeze({
    off: "Off",
    heat: "Heat",
    cool: "Cool",
    heat_cool: "Auto",
    auto: "Auto",
    fan_only: "Fan",
    dry: "Dry",
  });

  const FAN_LABEL = Object.freeze({
    auto: "Fan auto",
    on: "Fan on",
    diffuse: "Diffuse",
    circulate: "Circulate",
  });

  function lookIdOf(config) {
    const raw = config?.look;
    const id = LEGACY_LOOKS[raw] || raw;
    return LOOKS[id] ? id : "classic";
  }

  function sizeOf(config) {
    const id = String(config?.size ?? "100");
    return id === "50" || id === "75" || id === "100" ? id : "100";
  }

  function mergeConfig(config) {
    const merged = { ...DEFAULTS, ...(config || {}) };
    merged.size = sizeOf(merged);
    merged.look = lookIdOf(merged);
    return merged;
  }

  function num(config, key, fallback) {
    const v = config[key];
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function entityState(hass, entityId) {
    if (!entityId || !hass?.states?.[entityId]) return null;
    return hass.states[entityId];
  }

  function parseNumber(v) {
    if (v == null || v === "" || v === "unknown" || v === "unavailable") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function unitOf(st) {
    return String(st?.attributes?.unit_of_measurement || "").toLowerCase();
  }

  function nativeUnit(hass, st) {
    const u = String(st?.attributes?.temperature_unit || hass?.config?.unit_system?.temperature || "°F");
    return /c/i.test(u) ? "C" : "F";
  }

  function displayUnit(cfg, hass, st) {
    if (cfg.unit_system === "c" || cfg.unit_system === "metric") return "C";
    if (cfg.unit_system === "f" || cfg.unit_system === "imperial") return "F";
    return nativeUnit(hass, st);
  }

  function toDisplay(value, fromUnit, toUnit) {
    if (value == null || !Number.isFinite(value)) return null;
    if (fromUnit === toUnit) return value;
    if (fromUnit === "F" && toUnit === "C") return ((value - 32) * 5) / 9;
    if (fromUnit === "C" && toUnit === "F") return (value * 9) / 5 + 32;
    return value;
  }

  function fromDisplay(value, displayUnitName, native) {
    return toDisplay(value, displayUnitName, native);
  }

  function sensorUnit(st) {
    const u = unitOf(st);
    if (u.includes("c") && !u.includes("f")) return "C";
    return "F";
  }

  function roundTemp(n) {
    if (n == null || !Number.isFinite(n)) return null;
    return Math.round(n * 10) / 10;
  }

  function formatTemp(n, unit, digits) {
    if (n == null || !Number.isFinite(n)) return "—";
    const d = digits != null ? digits : Math.abs(n) >= 100 ? 0 : Number.isInteger(n) ? 0 : 1;
    const shown = Number(n).toFixed(d).replace(/\.0$/, "");
    return `${shown}°${unit}`;
  }

  function formatTempShort(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    const shown = Number(n).toFixed(Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 1).replace(/\.0$/, "");
    return `${shown}°`;
  }

  function formatClock(now = new Date()) {
    let h = now.getHours();
    const mins = String(now.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${mins} ${ap}`;
  }

  function shortFan(fan) {
    if (!fan) return "—";
    const id = String(fan).toLowerCase();
    if (id === "auto") return "Auto";
    if (id === "on") return "On";
    if (id === "diffuse") return "Diffuse";
    return String(FAN_LABEL[id] || fan).replace(/^Fan\s+/i, "");
  }

  function formatHours(ms) {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return "0h";
    const h = ms / 3600000;
    if (h < 0.05) return "0h";
    if (h < 10) return `${h.toFixed(1)}h`;
    return `${Math.round(h)}h`;
  }

  function stamp(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  function dayKey(ms, hass) {
    try {
      return new Intl.DateTimeFormat(hass?.locale?.language || undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }
  }

  function weekdayLetter(ms, hass) {
    try {
      return new Intl.DateTimeFormat(hass?.locale?.language || undefined, {
        weekday: "narrow",
      }).format(new Date(ms));
    } catch {
      return ["S", "M", "T", "W", "T", "F", "S"][new Date(ms).getDay()];
    }
  }

  function dayNum(ms) {
    return String(new Date(ms).getDate());
  }

  function monthDay(ms, hass) {
    try {
      return new Intl.DateTimeFormat(hass?.locale?.language || undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
  }

  function startOfLocalDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function historyRows(payload, entityId) {
    if (!payload) return [];
    if (Array.isArray(payload)) {
      if (payload.length && Array.isArray(payload[0])) return payload[0];
      return payload;
    }
    return payload[entityId] || [];
  }

  function rowTime(row) {
    return stamp(row.lu ?? row.last_updated ?? row.last_changed ?? row.a?.last_updated);
  }

  function rowTemp(row) {
    const attrs = row.a || row.attributes || {};
    return parseNumber(attrs.current_temperature) ?? parseNumber(row.s ?? row.state);
  }

  function rowAction(row) {
    const attrs = row.a || row.attributes || {};
    return String(attrs.hvac_action || row.s || row.state || "").toLowerCase();
  }

  function actionBadge(action, mode, current, target) {
    if (action === "heating") return { label: "Heating", kind: "heat" };
    if (action === "cooling") return { label: "Cooling", kind: "cool" };
    if (action === "fan" || action === "faning") return { label: "Fan", kind: "fan" };
    if (action === "drying") return { label: "Drying", kind: "cool" };
    if (mode === "off" || action === "off") return { label: "Off", kind: "off" };
    if (current != null && target != null && Math.abs(current - target) <= 0.6) {
      return { label: "At target", kind: "idle" };
    }
    return { label: "Idle", kind: "idle" };
  }

  function furnaceState(action, mode) {
    if (action === "heating") return "Heating";
    if (action === "cooling") return "Cooling";
    if (action === "fan" || action === "faning") return "Fan";
    if (action === "drying") return "Drying";
    if (mode === "off" || action === "off") return "Off";
    return "Idle";
  }

  function fluidColors(action, look) {
    if (look === "mercury") return { top: "#d5dee6", bot: "#8e9aa6", glow: "#c5d0d8" };
    if (action === "heating") return { top: "#ff9448", bot: "#c43a12", glow: "#ff7a2d" };
    if (action === "cooling") return { top: "#8ad4ff", bot: "#1a73b0", glow: "#5ec4ff" };
    return { top: "#ef4d4d", bot: "#9a1c1c", glow: "#ff6b6b" };
  }

  function yOf(temp, min, max, top, bot) {
    if (temp == null || max === min) return bot;
    const t = Math.max(0, Math.min(1, (temp - min) / (max - min)));
    return bot - t * (bot - top);
  }

  function tempFrac(temp, min, max) {
    if (temp == null || !Number.isFinite(temp) || max === min) return 0;
    return Math.max(0, Math.min(1, (temp - min) / (max - min)));
  }

  function tempDeg(temp, min, max) {
    return 270 + tempFrac(temp, min, max) * 180;
  }

  function indoorDeg(temp, min, max) {
    return 270 - tempFrac(temp, min, max) * 180;
  }

  function degFromPointer(el, ev) {
    const r = el.getBoundingClientRect();
    const x = ev.clientX - r.left - r.width / 2;
    const y = ev.clientY - r.top - r.height / 2;
    let deg = (Math.atan2(x, -y) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }

  function tempFromDeg(deg, min, max) {
    let pos;
    if (deg >= 270) pos = deg - 270;
    else if (deg <= 90) pos = deg + 90;
    else return null;
    const frac = Math.max(0, Math.min(1, pos / 180));
    return min + frac * (max - min);
  }

  function snapTemp(n, step, min, max) {
    const s = step > 0 ? step : 1;
    let v = Math.round(n / s) * s;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return roundTemp(v);
  }

  function polar(cx, cy, r, deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + Math.cos(rad) * r, cy + Math.sin(rad) * r];
  }

  function arcPath(cx, cy, r, d0, d1) {
    let sweep = d1 - d0;
    while (sweep < 0) sweep += 360;
    while (sweep >= 360) sweep -= 360;
    const [x0, y0] = polar(cx, cy, r, d0);
    const [x1, y1] = polar(cx, cy, r, d1);
    const large = sweep > 180 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  class ThermoPlusCard extends LitElement {
    static get properties() {
      return {
        hass: {},
        config: {},
        _historyDays: { state: true },
        _points: { state: true },
        _days: { state: true },
        _selectedDay: { state: true },
        _histError: { state: true },
        _busy: { state: true },
        _dragTemps: { state: true },
        _editSetpoint: { state: true },
      };
    }

    set hass(value) {
      const old = this._hassVal;
      this._hassVal = value;
      this._syncDragToHass();
      this.requestUpdate("hass", old);
    }

    get hass() {
      return this._hassVal;
    }

    static getConfigElement() {
      return document.createElement("thermo-plus-card-editor");
    }

    static getStubConfig(hass) {
      const ids = Object.keys(hass?.states || {});
      const climates = ids.filter((id) => id.startsWith("climate."));
      const entity =
        climates.find((id) => /home_2|thermostat|hvac/i.test(id)) ||
        climates.find((id) => (hass.states[id].attributes.hvac_modes || []).includes("cool")) ||
        climates[0] ||
        "";
      const outdoor =
        ids.find((id) => id === "sensor.outside_temp_and_humidity_temperature") ||
        ids.find((id) => /outside.*temperature/i.test(id) && hass.states[id].attributes.device_class === "temperature") ||
        "";
      return {
        type: "custom:thermo-plus-card",
        entity,
        outdoor_entity: outdoor,
        look: "classic",
        size: "100",
        name: hass.states[entity]?.attributes?.friendly_name || "Thermostat",
      };
    }

    constructor() {
      super();
      this._points = [];
      this._days = [];
      this._historyDays = 14;
      this._selectedDay = null;
      this._histError = "";
      this._histKey = "";
      this._busy = false;
      this._dragTemps = null;
      this._dragging = false;
      this._editSetpoint = false;
      this._editTimer = 0;
    }

    getCardSize() {
      const size = Number(sizeOf(this.config));
      const base = this.config?.show_history === true ? 6 : 3;
      return Math.max(2, Math.round((base * size) / 100));
    }

    setConfig(config) {
      if (!config) throw new Error("Invalid configuration");
      this.config = mergeConfig(config);
      this._historyDays = num(this.config, "history_days", 14);
      this.dataset.size = sizeOf(this.config);
    }

    updated(changed) {
      this.dataset.size = sizeOf(this.config);
      if (changed.has("hass") || changed.has("config")) {
        this._loadHistory();
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this._histKey = "";
      window.clearTimeout(this._editTimer);
    }

    _moreInfo(entityId) {
      if (!entityId) return;
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId },
        })
      );
    }

    _histEntity(cfg) {
      return cfg.temp_entity || cfg.entity;
    }

    async _loadHistory() {
      const cfg = mergeConfig(this.config || {});
      const entity = this._histEntity(cfg);
      const hass = this.hass;
      if (!entity || !hass?.callWS) return;
      const showHist = cfg.show_history === true;
      const days = Math.max(7, Number(this._historyDays) || 14);
      const key = `${entity}|${cfg.entity}|${showHist ? days : "today"}|${Math.floor(Date.now() / 120000)}`;
      if (key === this._histKey) return;
      this._histKey = key;
      const end = new Date();
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const startDaily = showHist ? new Date(end.getTime() - (days + 1) * 86400000) : midnight;
      try {
        const tasks = [
          hass.callWS({
            type: "history/history_during_period",
            start_time: startDaily.toISOString(),
            end_time: end.toISOString(),
            entity_ids: [entity],
            significant_changes_only: false,
            minimal_response: false,
            no_attributes: false,
          }),
        ];
        if (cfg.temp_entity && cfg.temp_entity !== cfg.entity) {
          tasks.push(
            hass.callWS({
              type: "recorder/statistics_during_period",
              start_time: startDaily.toISOString(),
              end_time: end.toISOString(),
              statistic_ids: [cfg.temp_entity],
              period: "day",
              types: ["min", "max", "mean"],
            })
          );
        } else {
          tasks.push(
            hass.callWS({
              type: "recorder/statistics_during_period",
              start_time: startDaily.toISOString(),
              end_time: end.toISOString(),
              statistic_ids: [entity],
              period: "day",
              types: ["min", "max", "mean"],
            }).catch(() => ({}))
          );
        }
        if (cfg.entity && cfg.entity !== entity) {
          tasks.push(
            hass.callWS({
              type: "history/history_during_period",
              start_time: midnight.toISOString(),
              end_time: end.toISOString(),
              entity_ids: [cfg.entity],
              significant_changes_only: false,
              minimal_response: false,
              no_attributes: false,
            })
          );
        }
        const [hist, daily, todayHist] = await Promise.all(tasks);
        this._points = historyRows(hist, entity);
        if (cfg.entity && cfg.entity !== entity && todayHist) {
          this._points = this._points.concat(historyRows(todayHist, cfg.entity));
        }
        this._days = daily?.[cfg.temp_entity || entity] || [];
        this._histError = "";
      } catch (err) {
        this._histError = err?.message || "history unavailable";
        this._points = [];
        this._days = [];
      }
    }

    _model() {
      const cfg = mergeConfig(this.config || {});
      const st = entityState(this.hass, cfg.entity);
      const outSt = entityState(this.hass, cfg.outdoor_entity);
      const native = nativeUnit(this.hass, st);
      const unit = displayUnit(cfg, this.hass, st);
      const attrs = st?.attributes || {};
      const mode = String(st?.state || "off").toLowerCase();
      const action = String(attrs.hvac_action || (mode === "off" ? "off" : "idle")).toLowerCase();
      const currentN = parseNumber(attrs.current_temperature);
      const targetN = parseNumber(attrs.temperature);
      const lowN = parseNumber(attrs.target_temp_low);
      const highN = parseNumber(attrs.target_temp_high);
      const humSt = entityState(this.hass, cfg.humidity_entity);
      const humidity =
        parseNumber(humSt?.state) ??
        parseNumber(attrs.current_humidity) ??
        parseNumber(attrs.humidity);
      const outdoorN = outSt ? toDisplay(parseNumber(outSt.state), sensorUnit(outSt), native) : null;
      const minN = num(cfg, "min_scale", parseNumber(attrs.min_temp) ?? (native === "C" ? 10 : 50));
      const maxN = num(cfg, "max_scale", parseNumber(attrs.max_temp) ?? (native === "C" ? 32 : 90));
      const stepN = parseNumber(attrs.target_temp_step) ?? (native === "C" ? 0.5 : 1);
      const current = toDisplay(currentN, native, unit);
      const target = toDisplay(targetN, native, unit);
      const low = toDisplay(lowN, native, unit);
      const high = toDisplay(highN, native, unit);
      const outdoor = toDisplay(outdoorN, native, unit);
      const scaleMin = toDisplay(Math.min(minN, maxN), native, unit);
      const scaleMax = toDisplay(Math.max(minN, maxN), native, unit);
      const modes = (attrs.hvac_modes || []).map((m) => String(m).toLowerCase());
      const fanModes = attrs.fan_modes || [];
      const unavailable = !st || ["unavailable", "unknown"].includes(String(st.state));
      const dual = (mode === "heat_cool" || mode === "auto") && (low != null || high != null);
      return {
        cfg,
        st,
        outSt,
        native,
        unit,
        mode,
        action,
        current: roundTemp(current),
        target: roundTemp(this._dragTemps?.target ?? target),
        low: roundTemp(this._dragTemps?.low ?? low),
        high: roundTemp(this._dragTemps?.high ?? high),
        outdoor: roundTemp(outdoor),
        humidity: humidity == null ? null : Math.round(humidity),
        scaleMin: roundTemp(scaleMin) ?? (unit === "C" ? 10 : 50),
        scaleMax: roundTemp(scaleMax) ?? (unit === "C" ? 32 : 90),
        step: toDisplay(stepN, native, unit) || (unit === "C" ? 0.5 : 1),
        modes,
        fanModes,
        fan: attrs.fan_mode,
        dual,
        unavailable,
        lookId: lookIdOf(cfg),
        size: sizeOf(cfg),
        title: cfg.name || attrs.friendly_name || "Thermostat",
        badge: actionBadge(action, mode, current, dual ? (low + high) / 2 : target),
        furnace: furnaceState(action, mode),
      };
    }

    _todayRange(unit, native, live) {
      const start = startOfLocalDay(Date.now());
      let min = live;
      let max = live;
      for (const row of this._points || []) {
        const t = rowTime(row);
        if (!Number.isFinite(t) || t < start) continue;
        const raw = rowTemp(row);
        const v = toDisplay(raw, native, unit);
        if (v == null) continue;
        min = min == null ? v : Math.min(min, v);
        max = max == null ? v : Math.max(max, v);
      }
      return { min: roundTemp(min), max: roundTemp(max) };
    }

    _runtimeMs() {
      const start = startOfLocalDay(Date.now());
      const rows = (this._points || [])
        .map((row) => ({ t: rowTime(row), action: rowAction(row) }))
        .filter((r) => Number.isFinite(r.t))
        .sort((a, b) => a.t - b.t);
      let heat = 0;
      let cool = 0;
      let prevT = start;
      let prevA = "idle";
      const first = rows.find((r) => r.t <= start) || rows[0];
      if (first && first.t <= start) prevA = first.action;
      for (const row of rows) {
        if (row.t < start) {
          prevA = row.action;
          continue;
        }
        const dt = Math.max(0, row.t - Math.max(prevT, start));
        if (prevA === "heating") heat += dt;
        if (prevA === "cooling") cool += dt;
        prevT = row.t;
        prevA = row.action;
      }
      const tail = Math.max(0, Date.now() - Math.max(prevT, start));
      if (prevA === "heating") heat += tail;
      if (prevA === "cooling") cool += tail;
      return { heat, cool };
    }

    _historyBars(m) {
      const want = Number(this._historyDays) || 14;
      const today = startOfLocalDay(Date.now());
      const byStart = new Map();
      for (const row of this._days || []) {
        const min = toDisplay(parseNumber(row.min) ?? parseNumber(row.mean), m.native, m.unit);
        const max = toDisplay(parseNumber(row.max) ?? parseNumber(row.mean), m.native, m.unit);
        if (min == null && max == null) continue;
        byStart.set(stamp(row.start), {
          min: roundTemp(min ?? max),
          max: roundTemp(max ?? min),
        });
      }
      if (!byStart.size) {
        for (const row of this._points || []) {
          const t = rowTime(row);
          const raw = rowTemp(row);
          const v = toDisplay(raw, m.native, m.unit);
          if (!Number.isFinite(t) || v == null) continue;
          const key = startOfLocalDay(t);
          const cur = byStart.get(key) || { min: v, max: v };
          cur.min = Math.min(cur.min, v);
          cur.max = Math.max(cur.max, v);
          byStart.set(key, cur);
        }
      }
      const bars = [];
      for (let i = want - 1; i >= 0; i--) {
        const startMs = today - i * 86400000;
        let range = null;
        for (const [ms, val] of byStart) {
          if (Math.abs(ms - startMs) < 3 * 3600000) {
            range = val;
            break;
          }
        }
        if (!range) {
          const key = dayKey(startMs, this.hass);
          for (const [ms, val] of byStart) {
            if (dayKey(ms, this.hass) === key) {
              range = val;
              break;
            }
          }
        }
        if (i === 0 && m.current != null) {
          range = range || { min: m.current, max: m.current };
          range = {
            min: roundTemp(Math.min(range.min, m.current)),
            max: roundTemp(Math.max(range.max, m.current)),
          };
        }
        bars.push({
          start: startMs,
          min: range?.min ?? null,
          max: range?.max ?? null,
          label:
            want <= 7
              ? weekdayLetter(startMs, this.hass)
              : want <= 14 || i === 0 || (want - 1 - i) % 5 === 0
                ? dayNum(startMs)
                : "",
          title: range
            ? `${monthDay(startMs, this.hass)} · ${formatTempShort(range.min)}–${formatTemp(range.max, m.unit)}`
            : `${monthDay(startMs, this.hass)} · no data`,
        });
      }
      return bars;
    }

    _statusChip(m) {
      const heating = m.action === "heating" || m.mode === "heat";
      const cooling = m.action === "cooling" || m.mode === "cool";
      if (m.action === "heating" || (heating && !cooling)) {
        const live = m.action === "heating";
        return html`
          <span class="chip flame ${live ? "live" : ""}" title=${live ? "Heating" : "Heat"}>
            <ha-icon icon="mdi:fire"></ha-icon>
          </span>
        `;
      }
      if (m.action === "cooling" || cooling) {
        const live = m.action === "cooling";
        return html`
          <span class="chip snow ${live ? "live" : ""}" title=${live ? "Cooling" : "Cool"}>
            <ha-icon icon="mdi:snowflake"></ha-icon>
          </span>
        `;
      }
      return "";
    }

    async _setMode(mode) {
      if (!this.config?.entity || this._busy) return;
      this._busy = true;
      try {
        await this.hass.callService("climate", "set_hvac_mode", {
          entity_id: this.config.entity,
          hvac_mode: mode,
        });
      } finally {
        this._busy = false;
      }
    }

    async _setFan(mode) {
      if (!this.config?.entity || this._busy) return;
      this._busy = true;
      try {
        await this.hass.callService("climate", "set_fan_mode", {
          entity_id: this.config.entity,
          fan_mode: mode,
        });
      } finally {
        this._busy = false;
      }
    }

    _previewSet(temps) {
      this._dragTemps = temps;
      this._editSetpoint = true;
      this._previewAt = Date.now();
      window.clearTimeout(this._editTimer);
      this._editTimer = window.setTimeout(() => {
        this._editSetpoint = false;
        this._syncDragToHass();
      }, 3500);
    }

    _syncDragToHass() {
      if (this._dragging || !this._dragTemps) return;
      const st = this.hass?.states?.[this.config?.entity];
      const attrs = st?.attributes || {};
      const drag = this._dragTemps;
      if (drag.target != null) {
        const live = parseNumber(attrs.temperature);
        if (live != null && Math.abs(live - drag.target) < 0.15) {
          this._dragTemps = null;
          return;
        }
      } else if (drag.low != null || drag.high != null) {
        const low = parseNumber(attrs.target_temp_low);
        const high = parseNumber(attrs.target_temp_high);
        const lowOk = drag.low == null || (low != null && Math.abs(low - drag.low) < 0.15);
        const highOk = drag.high == null || (high != null && Math.abs(high - drag.high) < 0.15);
        if (lowOk && highOk) {
          this._dragTemps = null;
          return;
        }
      }
      if (Date.now() - (this._previewAt || 0) > 60000) {
        this._dragTemps = null;
      }
    }

    async _nudge(delta) {
      const m = this._model();
      if (!m.cfg.entity || m.unavailable) return;
      const step = m.step;
      if (m.dual) {
        const low = (m.low ?? m.target ?? m.current) + (delta < 0 ? -step : 0);
        const high = (m.high ?? m.target ?? m.current) + (delta > 0 ? step : 0);
        this._previewSet({ low, high });
        await this._applyTemps(low, high);
        return;
      }
      if (m.target == null) return;
      const next = snapTemp(m.target + delta * step, step, m.scaleMin, m.scaleMax);
      if (next == null) return;
      this._previewSet({ target: next });
      await this._applyTemps(next);
    }

    async _applyTemps(lowOrSingle, high) {
      const m = this._model();
      const payload = { entity_id: m.cfg.entity };
      if (high != null) {
        payload.target_temp_low = fromDisplay(lowOrSingle, m.unit, m.native);
        payload.target_temp_high = fromDisplay(high, m.unit, m.native);
      } else {
        let next = fromDisplay(lowOrSingle, m.unit, m.native);
        const min = parseNumber(m.st?.attributes?.min_temp);
        const max = parseNumber(m.st?.attributes?.max_temp);
        if (min != null) next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        payload.temperature = next;
      }
      this._busy = true;
      try {
        await this.hass.callService("climate", "set_temperature", payload);
      } finally {
        this._busy = false;
      }
    }

    _dialHost(ev) {
      return ev.currentTarget;
    }

    _tempFromDialEvent(ev) {
      const host = this._dialHost(ev);
      const m = this._model();
      const deg = degFromPointer(host, ev);
      const raw = tempFromDeg(deg, m.scaleMin, m.scaleMax);
      if (raw == null) return null;
      return snapTemp(raw, m.step, m.scaleMin, m.scaleMax);
    }

    _setFromDial(ev) {
      const m = this._model();
      const t = this._tempFromDialEvent(ev);
      if (t == null) return;
      if (m.dual) {
        const low = m.low ?? t;
        const high = m.high ?? t;
        const step = m.step || 1;
        if (Math.abs(t - low) <= Math.abs(t - high)) {
          this._dragTemps = { low: Math.min(t, high - step), high };
        } else {
          this._dragTemps = { low, high: Math.max(t, low + step) };
        }
        return;
      }
      this._dragTemps = { target: t };
    }

    _dialPointerDown(ev) {
      const m = this._model();
      if (m.lookId === "digital" || m.unavailable || !m.cfg.entity) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._dragging = true;
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId);
      } catch (_) {}
      this._setFromDial(ev);
    }

    _dialPointerMove(ev) {
      if (!this._dragging) return;
      ev.preventDefault();
      this._setFromDial(ev);
    }

    async _dialPointerUp(ev) {
      if (!this._dragging) return;
      ev.preventDefault();
      this._dragging = false;
      try {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      const drag = this._dragTemps;
      if (drag && !this._busy) {
        if (drag.low != null && drag.high != null) {
          await this._applyTemps(drag.low, drag.high);
        } else if (drag.target != null) {
          await this._applyTemps(drag.target);
        }
      }
      window.setTimeout(() => {
        if (!this._dragging) this._dragTemps = null;
      }, 1200);
    }

    render() {
      if (!this.hass || !this.config) return html``;
      const m = this._model();
      if (!m.cfg.entity) {
        return html`
          <ha-card>
            <div class="wrap setup">
              <p>Pick a climate entity in the card editor.</p>
            </div>
          </ha-card>
        `;
      }
      const today = this._todayRange(m.unit, m.native, m.current);
      const runtime = this._runtimeMs();
      const showHist = m.cfg.show_history === true;
      const bars = showHist ? this._historyBars(m) : [];
      const vals = bars.flatMap((b) => [b.min, b.max]).filter((v) => v != null);
      const chartMin = vals.length ? Math.min(...vals) - 1 : m.scaleMin;
      const chartMax = vals.length ? Math.max(...vals) + 1 : m.scaleMax;
      const selected =
        this._selectedDay != null
          ? bars.find((b) => b.start === this._selectedDay) || null
          : bars[bars.length - 1] || null;
      const swing = vals.length ? roundTemp(Math.max(...vals) - Math.min(...vals)) : null;
      const showOutdoor = m.cfg.show_outdoor !== false && (m.cfg.outdoor_entity || m.outdoor != null);
      const showHumidity = m.cfg.show_humidity !== false && m.humidity != null;
      const showHeatRun = m.mode === "heat" || m.action === "heating";
      const showCoolRun = m.mode === "cool" || m.action === "cooling";
      const showDial = m.cfg.show_dial !== false;

      return html`
        <ha-card>
          <div class="wrap ${showHist ? "" : "compact"} ${showDial ? "" : "nodial"}">
            <div class="header">
              <button class="title" @click=${() => this._moreInfo(m.cfg.entity)}>
                ${m.title}
              </button>
              ${m.unavailable
                ? html`<span class="badge warn">Unavailable</span>`
                : this._statusChip(m)}
              <div class="modes">
                ${m.modes.map(
                  (mode) => html`
                    <button
                      class="mode ${m.mode === mode ? `on ${mode}` : ""}"
                      @click=${() => this._setMode(mode)}
                    >
                      ${MODE_LABEL[mode] || mode}
                    </button>
                  `
                )}
              </div>
            </div>

            <div class="body ${m.lookId === "digital" ? "digital" : ""} ${showDial ? "" : "nodial"}">
              ${showDial
                ? html`
              <div class="gauge-col">
                <div
                  class="thermo look-${m.lookId} ${m.lookId !== "digital" && !m.unavailable ? "interactive" : ""}"
                  title=${m.lookId !== "digital" ? "Drag the dial to set temperature" : ""}
                  role=${m.lookId !== "digital" ? "slider" : "img"}
                  aria-valuemin=${m.scaleMin}
                  aria-valuemax=${m.scaleMax}
                  aria-valuenow=${m.dual ? (m.low ?? m.high) : m.target}
                  aria-label="Temperature setpoint"
                  @pointerdown=${(e) => this._dialPointerDown(e)}
                  @pointermove=${(e) => this._dialPointerMove(e)}
                  @pointerup=${(e) => this._dialPointerUp(e)}
                  @pointercancel=${(e) => this._dialPointerUp(e)}
                >
                  ${m.lookId === "digital"
                    ? this._digitalFace(m)
                    : html`<div class="thermo-svg" .innerHTML=${this._thermoSvg(m, today)}></div>`}
                </div>
              </div>`
                : ""}

              <div class="info-col">
                <div class="tiles">
                  <div class="tile" @click=${() => this._moreInfo(m.cfg.entity)}>
                    <span class="tile-k ${m.badge.kind}">${m.furnace}</span>
                    <span class="tile-v">${formatTemp(m.current, m.unit)}</span>
                  </div>
                  <div class="tile target">
                    <span class="tile-k">Target</span>
                    <div class="nudge">
                      <button class="adj" @click=${() => this._nudge(-1)} aria-label="Lower target">−</button>
                      <span class="tile-v set">${m.dual
                          ? `${formatTempShort(m.low)}–${formatTempShort(m.high)}`
                          : formatTemp(m.target, m.unit)}</span>
                      <button class="adj" @click=${() => this._nudge(1)} aria-label="Raise target">+</button>
                    </div>
                  </div>
                </div>

                <div class="stats n${[showOutdoor, showHeatRun, showCoolRun, showHumidity].filter(Boolean).length}">
                  ${showOutdoor
                    ? html`
                        <div class="stat" @click=${() => this._moreInfo(m.cfg.outdoor_entity)}>
                          <span class="stat-k">Outdoor</span>
                          <span class="stat-v">${formatTemp(m.outdoor, m.unit)}</span>
                        </div>
                      `
                    : ""}
                  ${showHeatRun
                    ? html`
                        <div class="stat run">
                          <span class="stat-k">Heat today</span>
                          <span class="stat-v">${formatHours(runtime.heat)}</span>
                        </div>
                      `
                    : ""}
                  ${showCoolRun
                    ? html`
                        <div class="stat run">
                          <span class="stat-k">Cool today</span>
                          <span class="stat-v">${formatHours(runtime.cool)}</span>
                        </div>
                      `
                    : ""}
                  ${showHumidity
                    ? html`
                        <div class="stat" @click=${() => this._moreInfo(m.cfg.humidity_entity || m.cfg.entity)}>
                          <span class="stat-k">Humidity</span>
                          <span class="stat-v">${m.humidity}%</span>
                        </div>
                      `
                    : ""}
                </div>

                ${m.fanModes.length
                  ? html`
                      <div class="fans">
                        ${m.fanModes.map((fan) => {
                          const id = String(fan).toLowerCase();
                          const on = String(m.fan || "").toLowerCase() === id;
                          return html`
                            <button
                              class="mode fan ${on ? "on" : ""}"
                              @click=${() => this._setFan(fan)}
                            >
                              ${FAN_LABEL[id] || fan}
                            </button>
                          `;
                        })}
                      </div>
                    `
                  : ""}

                ${showHist
                  ? html`
                      <div class="hist">
                        <div class="hist-head">
                          <span class="hist-title">Daily range</span>
                          <div class="pills">
                            ${[7, 14, 30].map(
                              (d) => html`
                                <button
                                  class="pill ${this._historyDays === d ? "on" : ""}"
                                  @click=${() => {
                                    this._historyDays = d;
                                    this._histKey = "";
                                    this._loadHistory();
                                  }}
                                >
                                  ${d}d
                                </button>
                              `
                            )}
                          </div>
                        </div>
                        <div class="chart ${bars.length > 16 ? "dense" : ""}" role="img" aria-label="Daily temperature range">
                          ${bars.map((b) => {
                            const has = b.min != null && b.max != null;
                            const span = chartMax - chartMin || 1;
                            const bottom = has ? ((b.min - chartMin) / span) * 100 : 0;
                            const height = has ? Math.max(12, ((b.max - b.min) / span) * 100) : 2;
                            return html`
                              <button
                                class="stem-col ${selected?.start === b.start ? "sel" : ""} ${has ? "has" : ""}"
                                title=${b.title}
                                @click=${() => {
                                  this._selectedDay = b.start;
                                }}
                              >
                                <span class="stem-track">
                                  <span
                                    class="stem"
                                    style="bottom:${bottom}%;height:${height}%"
                                  ></span>
                                </span>
                                <span class="bar-l">${b.label}</span>
                              </button>
                            `;
                          })}
                        </div>
                        <div class="hist-foot">
                          <span
                            >${selected?.min != null
                              ? `${monthDay(selected.start, this.hass)} · ${formatTempShort(selected.min)}–${formatTemp(selected.max, m.unit)}`
                              : ""}</span
                          >
                          <span>${this._historyDays}d swing ${swing == null ? "—" : formatTemp(swing, m.unit)}</span>
                        </div>
                        ${this._histError
                          ? html`<div class="hist-err">${this._histError}</div>`
                          : ""}
                      </div>
                    `
                  : ""}
              </div>
            </div>
          </div>
        </ha-card>
      `;
    }

    _thermoSvg(m, today) {
      if (m.lookId === "modern") return this._svgModern(m, today);
      return this._svgClassic(m, today);
    }

    _digitalFace(m) {
      const room = m.current == null ? "—" : String(Math.round(m.current));
      const setNum = m.dual
        ? m.low != null && m.high != null
          ? `${Math.round(m.low)}–${Math.round(m.high)}`
          : "—"
        : m.target == null
          ? "—"
          : String(Math.round(m.target));
      const editing = !!(this._editSetpoint || this._dragTemps);
      const big = editing ? setNum : room;
      const footLeft =
        editing
          ? `Room ${room === "—" ? "—" : `${room}°`}`
          : `Set ${setNum === "—" ? "—" : `${setNum}°`}`;
      return html`
        <div class="t6">
          <div class="t6-glass">
            <div class="t6-top">
              <span class="t6-clock">${formatClock()}</span>
              <span class="t6-pip ${m.action}" title=${m.furnace}></span>
            </div>
            <div class="t6-row">
              <button
                class="t6-adj"
                ?disabled=${m.unavailable}
                @click=${() => this._nudge(-1)}
                aria-label="Lower target"
              >−</button>
              <div class="t6-meta left">
                <span>Mode</span>
                <strong>${MODE_LABEL[m.mode] || m.mode}</strong>
              </div>
              <div class="t6-temp ${editing ? "setting" : ""}">${big}</div>
              <div class="t6-meta right">
                <span>Fan</span>
                <strong>${shortFan(m.fan)}</strong>
              </div>
              <button
                class="t6-adj"
                ?disabled=${m.unavailable}
                @click=${() => this._nudge(1)}
                aria-label="Raise target"
              >+</button>
            </div>
            <div class="t6-foot">
              <span>${footLeft}</span>
              <span class="t6-act ${m.badge.kind}">${m.furnace}</span>
            </div>
          </div>
        </div>
      `;
    }

    _uid() {
      return `th${lookIdOf(this.config)}${String(this.config?.entity || "x").replace(/[^a-z0-9]/gi, "")}`;
    }

    _dialTicks(min, max, cx, cy, rInner, rOuter, rLabel, color, labelColor, degFn, skipEnds) {
      const toDeg = degFn || tempDeg;
      const every = max - min > 40 ? 10 : 5;
      const step = max - min > 40 ? 2 : 1;
      let out = "";
      for (let t = Math.ceil(min); t <= max; t += step) {
        const deg = toDeg(t, min, max);
        const major = t % every === 0;
        const [x1, y1] = polar(cx, cy, major ? rInner - 4 : rInner, deg);
        const [x2, y2] = polar(cx, cy, rOuter, deg);
        out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${major ? 2.2 : 1}" stroke-linecap="round"/>`;
        const atEnd = Math.abs(t - min) < 0.01 || Math.abs(t - max) < 0.01;
        if (major && !(skipEnds && atEnd)) {
          const [lx, ly] = polar(cx, cy, rLabel, deg);
          out += `<text x="${lx.toFixed(1)}" y="${(ly + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="${labelColor}">${t}</text>`;
        }
      }
      return out;
    }

    _setpointMark(deg, cx, cy, r, fill) {
      const [tipX, tipY] = polar(cx, cy, r - 2, deg);
      const [aX, aY] = polar(cx, cy, r + 14, deg - 7);
      const [bX, bY] = polar(cx, cy, r + 14, deg + 7);
      return `<polygon points="${tipX.toFixed(1)},${tipY.toFixed(1)} ${aX.toFixed(1)},${aY.toFixed(1)} ${bX.toFixed(1)},${bY.toFixed(1)}" fill="${fill}" stroke="#1a140e" stroke-width="0.8"/>`;
    }

    _needle(deg, cx, cy, r, color) {
      const [x, y] = polar(cx, cy, r, deg);
      return `
        <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="6" fill="${color}"/>
      `;
    }

    _scalePip(deg, cx, cy, r, fill) {
      if (deg == null || !Number.isFinite(deg)) return "";
      const [x1, y1] = polar(cx, cy, r - 6, deg);
      const [x2, y2] = polar(cx, cy, r + 8, deg);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fill}" stroke-width="2.6" stroke-linecap="round"/>`;
    }

    _actionArc(m, cx, cy, r) {
      const cur = m.current;
      const tgt = m.dual ? (m.low + m.high) / 2 : m.target;
      if (cur == null || tgt == null || Math.abs(cur - tgt) < 0.3) return "";
      const d0 = tempDeg(Math.min(cur, tgt), m.scaleMin, m.scaleMax);
      const d1 = tempDeg(Math.max(cur, tgt), m.scaleMin, m.scaleMax);
      const color = m.action === "cooling" || (m.mode === "cool" && tgt < cur) ? "#3aa0d8" : "#e25a1c";
      return `<path d="${arcPath(cx, cy, r, d0, d1)}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" opacity="0.85"/>`;
    }

    _dayMarks(today, m, cx, cy, r, degFn) {
      if (today.min == null || today.max == null) return "";
      const toDeg = degFn || tempDeg;
      const hi = polar(cx, cy, r, toDeg(today.max, m.scaleMin, m.scaleMax));
      const lo = polar(cx, cy, r, toDeg(today.min, m.scaleMin, m.scaleMax));
      return `
        <circle cx="${hi[0].toFixed(1)}" cy="${hi[1].toFixed(1)}" r="3.2" fill="#e25a1c"/>
        <circle cx="${lo[0].toFixed(1)}" cy="${lo[1].toFixed(1)}" r="3.2" fill="#3aa0d8"/>
      `;
    }

    _svgClassic(m, today) {
      const uid = this._uid();
      const cx = 110;
      const cy = 110;
      const inDeg = indoorDeg(m.current, m.scaleMin, m.scaleMax);
      const setDeg = tempDeg(m.dual ? (m.low + m.high) / 2 : m.target, m.scaleMin, m.scaleMax);
      const now = m.current == null ? "—" : String(Math.round(m.current));
      const set = m.dual
        ? `${Math.round(m.low)}–${Math.round(m.high)}`
        : m.target == null
          ? "—"
          : String(Math.round(m.target));
      return `
        <svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${uid}-bezel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f2ebe0"/>
              <stop offset="45%" stop-color="#cfc6b6"/>
              <stop offset="100%" stop-color="#8d8576"/>
            </linearGradient>
            <radialGradient id="${uid}-face" cx="38%" cy="32%" r="70%">
              <stop offset="0%" stop-color="#f7f1e6"/>
              <stop offset="100%" stop-color="#d8d0c2"/>
            </radialGradient>
          </defs>
          <circle cx="${cx}" cy="${cy}" r="106" fill="url(#${uid}-bezel)" stroke="#5c564c" stroke-width="2"/>
          <circle cx="${cx}" cy="${cy}" r="92" fill="url(#${uid}-face)" stroke="#b7ae9e" stroke-width="1.2"/>
          <path d="${arcPath(cx, cy, 80, 270, 450)}" fill="none" stroke="#c8c0b2" stroke-width="7"/>
          <path d="${arcPath(cx, cy, 80, 90, 270)}" fill="none" stroke="#d4cdc2" stroke-width="7"/>
          ${this._dialTicks(m.scaleMin, m.scaleMax, cx, cy, 72, 86, 60, "#2c261e", "#2c261e")}
          ${this._dialTicks(m.scaleMin, m.scaleMax, cx, cy, 72, 86, 60, "#6a6256", "#6a6256", indoorDeg, true)}
          ${this._dayMarks(today, m, cx, cy, 86, indoorDeg)}
          ${this._setpointMark(setDeg, cx, cy, 90, "#c4311b")}
          ${this._scalePip(inDeg, cx, cy, 80, "#c4311b")}
          <circle cx="${cx}" cy="${cy}" r="32" fill="#efe8db" stroke="#b7ae9e" stroke-width="1"/>
          <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="26" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="#2c261e">${esc(now)}</text>
          <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="8" font-weight="700" font-family="Arial, Helvetica, sans-serif" fill="#6a6256">SET ${esc(set)}°${esc(m.unit)}</text>
        </svg>
      `;
    }

    _svgModern(m, today) {
      const uid = this._uid();
      const cx = 110;
      const cy = 110;
      const inDeg = indoorDeg(m.current, m.scaleMin, m.scaleMax);
      const setDeg = tempDeg(m.dual ? (m.low + m.high) / 2 : m.target, m.scaleMin, m.scaleMax);
      const now = m.current == null ? "—" : String(Math.round(m.current));
      const set = m.dual
        ? `${Math.round(m.low)}–${Math.round(m.high)}`
        : m.target == null
          ? "—"
          : String(Math.round(m.target));
      const accent = m.action === "cooling" ? "#5ec4ff" : m.action === "heating" ? "#ff9448" : "#d9e2ea";
      return `
        <svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="${uid}-ring" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#d7dee6"/>
              <stop offset="100%" stop-color="#8b97a3"/>
            </linearGradient>
            <radialGradient id="${uid}-face" cx="50%" cy="38%" r="70%">
              <stop offset="0%" stop-color="#3a4550"/>
              <stop offset="100%" stop-color="#1b2228"/>
            </radialGradient>
          </defs>
          <circle cx="${cx}" cy="${cy}" r="106" fill="url(#${uid}-ring)"/>
          <circle cx="${cx}" cy="${cy}" r="96" fill="url(#${uid}-face)" stroke="#0e1418" stroke-width="1.5"/>
          <path d="${arcPath(cx, cy, 80, 270, 450)}" fill="none" stroke="#243038" stroke-width="8"/>
          <path d="${arcPath(cx, cy, 80, 90, 270)}" fill="none" stroke="#1c252c" stroke-width="8"/>
          ${this._dialTicks(m.scaleMin, m.scaleMax, cx, cy, 72, 88, 60, "#9aa7b4", "#e8eef4")}
          ${this._dialTicks(m.scaleMin, m.scaleMax, cx, cy, 72, 88, 60, "#7d8b96", "#9aa7b4", indoorDeg, true)}
          ${this._dayMarks(today, m, cx, cy, 88, indoorDeg)}
          ${this._setpointMark(setDeg, cx, cy, 92, accent)}
          ${this._scalePip(inDeg, cx, cy, 80, accent)}
          <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="30" font-weight="800" font-family="Arial, Helvetica, sans-serif" fill="#f4f7fa">${esc(now)}</text>
          <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="9" font-weight="700" font-family="Arial" fill="#9aa7b4">SET ${esc(set)}°${esc(m.unit)}</text>
        </svg>
      `;
    }


    static get styles() {
      return css`
        :host {
          display: block;
        }
        :host([data-size="75"]) {
          zoom: 0.75;
        }
        :host([data-size="50"]) {
          zoom: 0.5;
        }
        ha-card {
          overflow: hidden;
          height: 100%;
          background: var(--card-background-color, var(--ha-card-background));
        }
        .wrap {
          padding: 10px 12px 12px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
          box-sizing: border-box;
        }
        .wrap.compact {
          padding: 8px 12px 10px;
        }
        .setup {
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--secondary-text-color);
        }
        .header {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 6px;
        }
        .header .modes {
          margin-left: auto;
          margin-bottom: 0;
        }
        .title {
          border: 0;
          background: none;
          padding: 0;
          font-size: 1.05rem;
          font-weight: 650;
          color: var(--primary-text-color);
          cursor: pointer;
          text-align: left;
        }
        .badge {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          padding: 3px 8px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .badge.heat {
          color: #3b1400;
          background: #ff9448;
        }
        .badge.cool {
          color: #042033;
          background: #5ec4ff;
        }
        .badge.idle {
          color: var(--secondary-text-color);
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
        }
        .badge.off,
        .badge.fan {
          color: #e8eef4;
          background: #3a4550;
        }
        .badge.warn {
          color: #3b1d00;
          background: #f8c15c;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          flex: 0 0 26px;
        }
        .chip ha-icon {
          --mdc-icon-size: 18px;
          width: 18px;
          height: 18px;
        }
        .chip.flame {
          color: #ff9448;
          background: rgba(255, 148, 72, 0.2);
        }
        .chip.flame.live {
          color: #fff8f0;
          background: #c43a12;
        }
        .chip.snow {
          color: #5ec4ff;
          background: rgba(94, 196, 255, 0.2);
        }
        .chip.snow.live {
          color: #042033;
          background: #5ec4ff;
        }
        .modes {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
        }
        .fans {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          flex: 0 0 auto;
        }
        .fans .mode {
          width: 100%;
          text-align: center;
        }
        .mode.fan.on {
          background: #3a4550;
          color: #fff;
        }
        .mode {
          border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.04));
          color: var(--secondary-text-color);
          font-size: 0.74rem;
          font-weight: 750;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border-radius: 999px;
          padding: 5px 11px;
          cursor: pointer;
        }
        .mode.on {
          color: #fff;
          background: #3a4550;
        }
        .mode.on.heat {
          background: #c43a12;
        }
        .mode.on.cool {
          background: #1a73b0;
        }
        .mode.on.off {
          background: #2a3036;
        }
        .body {
          display: grid;
          grid-template-columns: minmax(172px, 1.05fr) minmax(200px, 1.15fr);
          gap: 8px 12px;
          align-items: stretch;
          flex: 1 1 auto;
          min-height: 0;
        }
        .body.digital {
          grid-template-columns: minmax(184px, 1.05fr) minmax(200px, 1.15fr);
          align-items: center;
        }
        .gauge-col {
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .thermo {
          width: 100%;
          max-width: 250px;
        }
        .thermo.interactive {
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .thermo.interactive:active {
          cursor: grabbing;
        }
        .wrap.compact .thermo {
          max-width: 270px;
        }
        .thermo-svg,
        .thermo-svg svg {
          width: 100%;
          height: auto;
          display: block;
          filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.28));
        }
        .thermo.look-digital {
          max-width: 230px;
          filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.28));
        }
        .t6 {
          aspect-ratio: 1;
          border-radius: 24%;
          background: linear-gradient(180deg, #fcfcfc 0%, #efefef 48%, #cfd0d4 100%);
          border: 1px solid #c4c4c8;
          padding: 3.4%;
          box-sizing: border-box;
        }
        .t6-glass {
          height: 100%;
          border-radius: 21%;
          background: radial-gradient(120% 80% at 50% 12%, #2a2a2a 0%, #101010 55%, #070707 100%);
          color: #f3f3f3;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 12% 5.5% 11%;
          box-sizing: border-box;
          box-shadow: inset 0 0 0 1px #000, inset 0 10px 20px rgba(255, 255, 255, 0.04);
        }
        .t6-top {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
          min-height: 1em;
        }
        .t6-clock {
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          color: #ececec;
        }
        .t6-pip {
          position: absolute;
          right: 8%;
          top: 50%;
          width: 7px;
          height: 7px;
          margin-top: -3.5px;
          border-radius: 50%;
          background: #5a5a5a;
        }
        .t6-pip.heating {
          background: #ff9448;
          box-shadow: 0 0 8px #ff9448;
        }
        .t6-pip.cooling {
          background: #5ec4ff;
          box-shadow: 0 0 8px #5ec4ff;
        }
        .t6-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 5px;
        }
        .t6-temp {
          flex: 0 0 auto;
          font-family: "Segoe UI Light", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
          font-size: 3.55rem;
          font-weight: 200;
          line-height: 0.85;
          letter-spacing: 0.01em;
          font-variant-numeric: tabular-nums;
        }
        .t6-temp.setting {
          font-weight: 300;
        }
        .t6-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          font-size: 0.52rem;
          letter-spacing: 0.05em;
          color: #b8b8b8;
          text-transform: none;
        }
        .t6-meta.left {
          align-items: flex-end;
          text-align: right;
        }
        .t6-meta.right {
          align-items: flex-start;
          text-align: left;
        }
        .t6-meta strong {
          font-size: 0.7rem;
          font-weight: 600;
          color: #f4f4f4;
        }
        .t6-adj {
          flex: 0 0 auto;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1.5px dotted #d0d0d0;
          background: transparent;
          color: #f2f2f2;
          font-size: 1.05rem;
          line-height: 1;
          padding: 0;
          cursor: pointer;
        }
        .t6-adj:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .t6-foot {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 0.62rem;
          letter-spacing: 0.05em;
          color: #b4b4b4;
        }
        .t6-act.heat,
        .t6-act.cool {
          color: #f0f0f0;
        }
        .wrap.nodial {
          min-height: 269px;
        }
        .wrap.nodial .body,
        .wrap.nodial .body.digital {
          grid-template-columns: 1fr;
          justify-items: center;
        }
        .wrap.nodial .info-col {
          width: 100%;
          max-width: 440px;
          height: 100%;
        }
        .wrap.nodial .tile-v {
          font-size: 2.35rem;
        }
        .wrap.nodial .stat-v {
          font-size: 1.2rem;
        }
        .wrap.nodial .adj {
          width: 32px;
          height: 32px;
        }
        .wrap.nodial .fans .mode {
          padding: 8px 12px;
        }
        .info-col {
          min-width: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          justify-content: space-evenly;
        }
        .tiles {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          align-items: start;
          justify-items: center;
          flex: 0 0 auto;
          min-height: 0;
        }
        .tile {
          border: 0;
          background: none;
          color: var(--primary-text-color);
          border-radius: 0;
          padding: 0;
          text-align: center;
          cursor: default;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          width: 100%;
        }
        .tile-k {
          display: block;
          font-size: 0.7rem;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 650;
          line-height: 1.2;
        }
        .tile-k.heat {
          color: #ff9448;
        }
        .tile-k.cool {
          color: #5ec4ff;
        }
        .tile-v {
          display: block;
          margin-top: 6px;
          font-size: 1.9rem;
          font-weight: 750;
          letter-spacing: -0.02em;
          line-height: 1.05;
        }
        .nudge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 6px;
        }
        .nudge .tile-v,
        .nudge .set {
          flex: 0 0 auto;
          margin-top: 0;
          border: 0;
          background: none;
          color: inherit;
          padding: 0;
          text-align: center;
        }
        .adj {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 8px;
          background: var(--divider-color, rgba(255, 255, 255, 0.12));
          color: var(--primary-text-color);
          font-size: 1.2rem;
          font-weight: 700;
          line-height: 1;
          cursor: pointer;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
          align-items: start;
          flex: 0 0 auto;
        }
        .stats.n2,
        .stats:has(.stat:nth-child(2):last-child) {
          grid-template-columns: 1fr 1fr;
        }
        .stat {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
          min-width: 0;
          min-height: 0;
          border: 0;
          background: none;
          border-radius: 0;
          padding: 0;
          color: inherit;
          text-align: center;
          cursor: default;
          line-height: 1.15;
        }
        .stat.run .stat-k {
          white-space: nowrap;
        }
        .stat-k {
          font-size: 0.7rem;
          color: var(--secondary-text-color);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 650;
          line-height: 1.2;
        }
        .stat-v {
          margin-top: 3px;
          font-size: 1.05rem;
          font-weight: 650;
          line-height: 1.2;
        }
        .hist {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .hist-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .hist-title {
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--secondary-text-color);
        }
        .pills {
          display: flex;
          gap: 4px;
        }
        .pill {
          border: 0;
          background: var(--secondary-background-color, rgba(255, 255, 255, 0.06));
          color: var(--secondary-text-color);
          font-size: 0.72rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 3px 8px;
          cursor: pointer;
        }
        .pill.on {
          background: #0b6aa2;
          color: #fff;
        }
        .chart {
          display: flex;
          align-items: stretch;
          gap: 3px;
          flex: 1;
          min-height: 148px;
          padding: 6px 0 0;
        }
        .stem-col {
          flex: 1;
          min-width: 0;
          border: 0;
          background: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          height: 100%;
        }
        .stem-track {
          position: relative;
          flex: 1;
          width: 100%;
          min-height: 110px;
        }
        .stem {
          position: absolute;
          left: 50%;
          width: 46%;
          max-width: 10px;
          transform: translateX(-50%);
          border-radius: 99px;
          background: rgba(255, 255, 255, 0.14);
        }
        .stem-col.has .stem {
          background: linear-gradient(180deg, #ff9448 0%, #5ec4ff 100%);
        }
        .stem-col.sel .stem {
          outline: 2px solid #e8f7ff;
          outline-offset: 1px;
        }
        .bar-l {
          margin-top: 4px;
          font-size: 0.62rem;
          color: var(--secondary-text-color);
          line-height: 1;
          min-height: 0.7rem;
          white-space: nowrap;
        }
        .chart.dense {
          gap: 2px;
        }
        .hist-foot {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-top: 6px;
          font-size: 0.78rem;
          color: var(--secondary-text-color);
        }
        .hist-err {
          margin-top: 4px;
          font-size: 0.75rem;
          color: var(--error-color, #f87171);
        }
        @media (max-width: 520px) {
          .body {
            grid-template-columns: 1fr;
          }
          .thermo {
            max-width: 210px;
            margin: 0 auto;
          }
          .chart {
            min-height: 110px;
          }
        }
      `;
    }
  }

  class ThermoPlusCardEditor extends LitElement {
    static get properties() {
      return { hass: {}, config: {} };
    }

    setConfig(config) {
      this.config = mergeConfig(config || {});
    }

    _valueChanged(ev) {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: ev.detail.value },
        })
      );
    }

    render() {
      if (!this.hass) return html``;
      const merged = mergeConfig(this.config || {});
      return html`
        <ha-form
          .hass=${this.hass}
          .data=${merged}
          .schema=${[
            { name: "name", selector: { text: {} } },
            {
              name: "look",
              selector: {
                select: {
                  mode: "dropdown",
                  options: Object.keys(LOOKS).map((value) => ({
                    value,
                    label: LOOKS[value].label,
                  })),
                },
              },
            },
            {
              name: "size",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "100", label: "Full (100%)" },
                    { value: "75", label: "75%" },
                    { value: "50", label: "50%" },
                  ],
                },
              },
            },
            {
              name: "entity",
              selector: { entity: { domain: "climate" } },
            },
            {
              name: "outdoor_entity",
              selector: {
                entity: { domain: "sensor", device_class: "temperature" },
              },
            },
            {
              name: "humidity_entity",
              selector: {
                entity: { domain: "sensor", device_class: "humidity" },
              },
            },
            {
              name: "temp_entity",
              selector: {
                entity: { domain: "sensor", device_class: "temperature" },
              },
            },
            {
              name: "unit_system",
              selector: {
                select: {
                  options: [
                    { value: "auto", label: "Auto (from Home Assistant)" },
                    { value: "imperial", label: "°F" },
                    { value: "metric", label: "°C" },
                  ],
                },
              },
            },
            {
              name: "min_scale",
              selector: { number: { min: -40, max: 120, step: 1, mode: "box" } },
            },
            {
              name: "max_scale",
              selector: { number: { min: -20, max: 140, step: 1, mode: "box" } },
            },
            {
              name: "history_days",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "7", label: "7 days" },
                    { value: "14", label: "14 days" },
                    { value: "30", label: "30 days" },
                  ],
                },
              },
            },
            { name: "show_dial", selector: { boolean: {} } },
            { name: "show_history", selector: { boolean: {} } },
            { name: "show_outdoor", selector: { boolean: {} } },
            { name: "show_humidity", selector: { boolean: {} } },
          ]}
          .computeLabel=${(s) =>
            ({
              name: "Card title",
              look: "Thermostat look",
              size: "Card size",
              entity: "Climate / thermostat",
              outdoor_entity: "Outdoor temperature (optional)",
              humidity_entity: "Humidity sensor (optional)",
              temp_entity: "Indoor history sensor (optional)",
              unit_system: "Display units",
              min_scale: "Scale low (native units)",
              max_scale: "Scale high (native units)",
              history_days: "Default history range",
              show_dial: "Show dial graphic",
              show_history: "Show daily range history",
              show_outdoor: "Show outdoor temperature",
              show_humidity: "Show humidity",
            })[s.name] || s.name}
          @value-changed=${this._valueChanged}
        ></ha-form>
      `;
    }
  }

  customElements.define("thermo-plus-card", ThermoPlusCard);
  customElements.define("thermo-plus-card-editor", ThermoPlusCardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "thermo-plus-card",
    name: "Thermo Plus",
    description: "Round thermostat card with heat/cool runtime and daily range history",
    preview: true,
    documentationURL: "https://github.com/randrcomputers/ha-thermo-card#readme",
  });
})();
