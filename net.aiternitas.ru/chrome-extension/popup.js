(function () {
  const bluetoothStatus = document.getElementById('bluetooth-status');
  const networkStatus = document.getElementById('network-status');
  const btnScanBle = document.getElementById('btn-scan-ble');
  const deviceList = document.getElementById('device-list');
  const deviceEmpty = document.getElementById('device-empty');

  const BLE_SERVICE_UUID = 0xfeaa; // optional: Eddystone / custom, or leave empty to show all

  let discoveredDevices = [];

  function setBluetoothStatus(text, className) {
    bluetoothStatus.textContent = text;
    bluetoothStatus.className = 'value ' + (className || '');
  }

  function setNetworkStatus(text) {
    networkStatus.textContent = text || '—';
  }

  function updateDeviceList() {
    deviceList.innerHTML = '';
    if (discoveredDevices.length === 0) {
      deviceEmpty.hidden = false;
      return;
    }
    deviceEmpty.hidden = true;
    discoveredDevices.forEach((d) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="name">' + (d.name || 'Устройство') + '</span><span class="addr">' + (d.id || d.address || '') + '</span>';
      deviceList.appendChild(li);
    });
  }

  function loadStoredDevices() {
    try {
      const raw = localStorage.getItem('net.aiternitas.ble_devices');
      if (raw) discoveredDevices = JSON.parse(raw);
    } catch (_) {}
    updateDeviceList();
  }

  function saveDevices() {
    try {
      localStorage.setItem('net.aiternitas.ble_devices', JSON.stringify(discoveredDevices));
    } catch (_) {}
  }

  async function checkBluetooth() {
    if (!navigator.bluetooth) {
      setBluetoothStatus('не поддерживается', 'err');
      return;
    }
    try {
      const available = await navigator.bluetooth.getAvailability();
      setBluetoothStatus(available ? 'включен' : 'выключен', available ? 'on' : 'off');
    } catch (e) {
      setBluetoothStatus('ошибка', 'err');
    }
  }

  function checkNetwork() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) {
      setNetworkStatus('неизвестно');
      return;
    }
    const type = conn.effectiveType || conn.type || '';
    const types = { wifi: 'Wi‑Fi', '4g': '4G', '3g': '3G', '2g': '2G', ethernet: 'Ethernet' };
    setNetworkStatus(types[type] || type || 'онлайн');
  }

  async function scanBle() {
    if (!navigator.bluetooth) {
      alert('В этом браузере нет доступа к Bluetooth.');
      return;
    }
    btnScanBle.disabled = true;
    btnScanBle.textContent = 'Выберите устройство…';
    try {
      const options = {};
      options.optionalServices = options.optionalServices || [];
      const device = await navigator.bluetooth.requestDevice({
        filters: [],
        optionalServices: ['battery_service', 'device_information'].concat(options.optionalServices),
      });
      const name = device.name || 'Устройство';
      const id = device.id || device.address || '';
      if (!discoveredDevices.some((d) => (d.id || d.address) === id)) {
        discoveredDevices.push({ name, id, address: id });
        saveDevices();
        updateDeviceList();
      }
    } catch (e) {
      if (e.name !== 'NotFoundError') {
        console.error(e);
        alert('Ошибка: ' + (e.message || e.name));
      }
    } finally {
      btnScanBle.disabled = false;
      btnScanBle.textContent = 'Найти устройство по BLE';
    }
  }

  btnScanBle.addEventListener('click', scanBle);
  loadStoredDevices();
  checkBluetooth();
  checkNetwork();
})();
