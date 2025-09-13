class FireAlarmDashboard {
  constructor() {
    this.sensors = new Map();  // id -> state
    this.grid = document.getElementById('sensorsGrid');
    this.cardTpl = document.getElementById('sensorCardTemplate');
    this._setHeaderTime(new Date());
    this._startTimestampTicker();
    this._startSSE();
  }

  // --- SSE ---
  _startSSE() {
    if (!window.EventSource) return;
    const source = new EventSource('/events');

    source.addEventListener('open', () => console.log('SSE connected'));
    source.addEventListener('error', (e) => {
      if (e.target.readyState !== EventSource.OPEN) console.log('SSE disconnected');
    });

    // NEW: one generic event for any unit
    source.addEventListener('unit_readings', (e) => {
      try {
        const obj = JSON.parse(e.data);
        const id = String(obj.id ?? 'unknown');
        this.upsertSensor(id, {
          gasPPM: obj.mq ?? 0,
          mq_det:   !!obj.mq_det ,
          gasDetected: !!obj.gasDetected,
          temperature: obj.temperatureC ?? 0,
          humidity: obj.hum ?? 0,
          batteryVoltage: obj.batteryV ?? 0,
          zone: obj.zone || `Zone ${id}`,
          name: obj.name || `Sensor Unit ${id}`,
          lastTs: Date.now(),
        });
      } catch (err) {
        console.warn('Bad JSON for unit_readings', err, e.data);
      }
    });

    // Keep your hub battery + heartbeat handlers
    source.addEventListener('hub_readings', (e) => {
      const obj = JSON.parse(e.data);
      const voltage = obj.hub_battery_voltage;
      const percent = Math.min(100, Math.max(0, ((Number(voltage).toFixed(1) - 3) / (4.2 - 3)) * 100));
      const el = document.getElementById('hubBattery');
      if (el) el.textContent = `${percent.toFixed(1)}% (${Number(voltage).toFixed(1)}V)`;
    });

    source.addEventListener('heartbeat', () => this._setHeaderTime(new Date()));
  }

  // --- Create or update a sensor card ---
  upsertSensor(id, partial) {
    let s = this.sensors.get(id);
    if (!s) {
      s = { gasPPM: 0, gasDetected: false, temperature: 0, batteryVoltage: 0, lastTs: Date.now(), _prevGasPPM: 0 };
      this.sensors.set(id, s);
      this._mountCard(id, partial?.name, partial?.zone);
      this._updateActiveCount();
    }
    Object.assign(s, partial);
    this._renderCard(id, s);
  }

  _mountCard(id, name = `Sensor Unit ${id}`, zone = `Zone ${id}`) {
    const frag = this.cardTpl.content.cloneNode(true);
    const card = frag.querySelector('.sensor-card');
    card.dataset.id = id;

    card.querySelector('.sensor-name').textContent = name;
    card.querySelector('.sensor-zone').textContent = zone;

    this.grid.appendChild(frag);
  }

  _renderCard(id, s) {
    const card = this.grid.querySelector(`.sensor-card[data-id="${id}"]`);
    if (!card) return;

    // elements
    const gasState = card.querySelector('.gas-state');
    const gasPPM = card.querySelector('.gas-ppm');
    const temp = card.querySelector('.temp');
    const hum = card.querySelector('.hum');
    const batt = card.querySelector('.batt');
    const status = card.querySelector('.sensor-status');
    const last = card.querySelector('.last-update');

    // gas
    gasState.textContent = s.gasDetected ? 'GAS DETECTED!' : 'CLEAR';
    gasState.classList.toggle('danger', s.gasDetected);
    gasPPM.textContent = `PPM: ${Number(s.gasPPM).toFixed(2)}`;

    // blink logic on sharp rise
    if (Math.abs((s.gasPPM ?? 0) - (s._prevGasPPM ?? 0)) > 3) {
      gasState.classList.add('blink-red');
      gasState.textContent = 'SMOKE INCREASING!';
    } else {
      gasState.classList.remove('blink-red');
    }
    s._prevGasPPM = s.gasPPM ?? 0;

    // card alert style + status pill
    card.classList.toggle('alert', s.gasDetected);
    status.textContent = s.gasDetected ? 'ALERT' : 'NORMAL';
    if (s.gasDetected) {
      status.style.background = '#fff'; status.style.color = '#ff4757';
    } else {
      status.style.background = '#10b981'; status.style.color = '#fff';
    }

    // temp + battery
    temp.textContent = `${Number(s.temperature ?? 0).toFixed(1)}°C`;
    hum.textContent = `${Number(s.humidity ?? 0).toFixed(1)}%`;
    const v = s.batteryVoltage ?? 0;
    batt.textContent = `${Number(v).toFixed(2)}V`;
    batt.classList.toggle('danger', v < 11.0);

    // timestamp
    last.textContent = `${Math.max(0, Math.round((Date.now() - (s.lastTs ?? Date.now())) / 1000))} seconds ago`;
  }

  // --- Misc UI helpers (kept from your file) ---
  _updateActiveCount() {
    const el = document.querySelector('.stats-grid .stat-card:nth-child(2) .stat-value');
    if (el) el.textContent = `${this.sensors.size}/${this.sensors.size}`;
  }


  resetAlerts() {
    this.sensors.forEach((s, id) => { s.gasDetected = false; s.lastTs = Date.now(); this._renderCard(id, s); });
  }

  _startTimestampTicker() {
    setInterval(() => {
      this.sensors.forEach((s, id) => this._renderCard(id, s));
      this._setHeaderTime(new Date());
    }, 1000);
  }

  _setHeaderTime(d) {
    const el = document.getElementById('headerTime');
    if (el) el.textContent = d.toLocaleTimeString();
  }
}

document.addEventListener('DOMContentLoaded', () => { window.dashboard = new FireAlarmDashboard(); });
