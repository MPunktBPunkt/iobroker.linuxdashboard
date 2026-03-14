# Schnittstellen – iobroker.linuxdashboard

> Vollständige API-Referenz für den Linux Dashboard Adapter.  
> Basis-URL: `http://<IP>:<PORT>` (Standard: Port 8090)

---

## Allgemeines

- **Authentifizierung**: Keine (Web-UI nur im lokalen Netz nutzen)
- **Format**: JSON (sofern nicht anders angegeben)
- **Encoding**: UTF-8
- **Timeouts**: Befehls-Ausführung max. 30 Sekunden, Update max. 120 Sekunden

---

## Health-Check

### `GET /api/ping`

Verbindungstest – keine Authentifizierung nötig.

**Response:**
```json
{
  "ok": true,
  "adapter": "linuxdashboard",
  "version": "0.1.0"
}
```

---

## System-Metriken

### `GET /api/metrics`

Gibt alle aktuellen System-Metriken zurück. Wird bei jedem Aufruf neu berechnet.

**Response-Struktur:**
```json
{
  "hostname": "raspberrypi",
  "platform": "linux",
  "arch": "arm64",
  "release": "6.6.31+rpt-rpi-2712",
  "uptime": 86423,
  "nodeVersion": "v20.11.0",
  "pid": 1234,
  "adapterName": "linuxdashboard.0",

  "cpu": {
    "usagePercent": 12,
    "model": "ARMv7 Processor rev 4 (v7l)",
    "cores": 4,
    "loadAvg": [0.45, 0.38, 0.31]
  },
  "loadAvg": [0.45, 0.38, 0.31],

  "memory": {
    "total": 8589934592,
    "free":  5368709120,
    "used":  3221225472,
    "usedPercent": 37
  },

  "swap": {
    "total": 2147483648,
    "free":  2013265920,
    "used":   134217728
  },

  "disks": [
    {
      "source": "/dev/sda1",
      "mount": "/",
      "size": 31067799552,
      "used": 8589934592,
      "avail": 22477864960,
      "usedPercent": 28
    }
  ],

  "network": [
    {
      "name": "eth0",
      "address": "192.168.1.100",
      "rx": 1234567890,
      "tx": 987654321
    },
    {
      "name": "wlan0",
      "address": "192.168.1.101",
      "rx": 111222333,
      "tx": 44455566
    }
  ],

  "processes": [
    {
      "user": "iobroker",
      "pid": "1234",
      "cpu": "2.5",
      "mem": "1.2",
      "vsz": 987654,
      "rss": 45678,
      "status": "S",
      "time": "00:05:23",
      "name": "node /opt/iobroker/node_modules/..."
    }
  ]
}
```

**Datenquellen:**
| Feld         | Quelle                  |
|--------------|-------------------------|
| hostname     | `os.hostname()`         |
| cpu.usage    | `os.cpus()` Diff        |
| memory       | `os.totalmem()` / `os.freemem()` |
| swap         | `/proc/meminfo`         |
| disks        | `df -B1`                |
| network.rx/tx| `/proc/net/dev`         |
| processes    | `ps aux --sort=-%cpu`   |

---

## Dateimanager

### `GET /api/files?path=<pfad>`

Listet den Inhalt eines Verzeichnisses auf.

**Parameter:**
| Name   | Typ    | Pflicht | Beschreibung            |
|--------|--------|---------|-------------------------|
| `path` | string | Ja      | Absoluter Pfad          |

**Response (Erfolg):**
```json
{
  "path": "/home/iobroker",
  "entries": [
    {
      "name": "config",
      "isDir": true,
      "size": 4096,
      "mtime": 1709812345678,
      "mode": "755"
    },
    {
      "name": "readme.txt",
      "isDir": false,
      "size": 1234,
      "mtime": 1709812300000,
      "mode": "644"
    }
  ]
}
```

**Response (Fehler):**
```json
{ "path": "/root", "entries": [], "error": "EACCES: permission denied" }
```

**Sortierung:** Ordner zuerst, dann Dateien, alphabetisch.  
**Sicherheit:** Pfade außerhalb `filemanagerRoot` geben HTTP 403 zurück.

---

### `GET /api/file?path=<pfad>`

Gibt den Datei-Inhalt zurück. Für Text-Dateien als `text/plain; charset=utf-8`, für Binärdateien als passender MIME-Type.

**Erkannte Text-Dateitypen:** `.txt .md .json .js .ts .html .css .sh .conf .cfg .ini .log .yaml .yml .xml .env .py .rb .php .java .c .cpp .h .go .rs .sql`

**HTTP 404** wenn Datei nicht existiert oder außerhalb root.

---

### `GET /api/download?path=<pfad>`

Wie `/api/file`, aber mit `Content-Disposition: attachment` – löst Browser-Download aus.

---

### `POST /api/mkdir`

Erstellt ein neues Verzeichnis (inkl. fehlende Elternverzeichnisse).

**Request Body:**
```json
{ "path": "/home/iobroker/neuer-ordner" }
```

**Response (Erfolg):**
```json
{ "ok": true }
```

**Response (Fehler):**
```json
{ "ok": false, "error": "EACCES: permission denied" }
```

---

## System-Logs

### `GET /api/logs?source=<quelle>&lines=<anzahl>`

Liest System-Logs.

**Parameter:**
| Name     | Typ    | Default | Optionen                                    |
|----------|--------|---------|---------------------------------------------|
| `source` | string | syslog  | `syslog`, `iobroker`, `kern`, `auth`, `daemon` |
| `lines`  | number | 200     | 10 – 5000                                   |

**Befehle je Quelle:**
| Quelle    | Befehl                                                |
|-----------|-------------------------------------------------------|
| syslog    | `journalctl -n N --no-pager` oder `/var/log/syslog`  |
| iobroker  | `journalctl -u iobroker -n N` oder grep syslog       |
| kern      | `journalctl -k -n N` oder `dmesg`                    |
| auth      | `journalctl -t sudo -t sshd -n N`                    |
| daemon    | `journalctl -t systemd -n N`                          |

**Response:**
```json
{
  "lines": [
    "2026-03-14T10:23:45+0100 raspberrypi systemd[1]: Started ioBroker.service.",
    "2026-03-14T10:23:46+0100 raspberrypi node[1234]: [INFO] Adapter gestartet"
  ],
  "source": "syslog"
}
```

Adapter-interne Logs (letzte 50 Einträge) werden immer an die Zeilen angehängt.

---

## Befehlsausführung

### `POST /api/exec`

Führt einen Linux-Befehl aus. Nur verfügbar wenn `allowCommandExecution: true`.

**Request Body:**
```json
{ "cmd": "df -h" }
```

**Response:**
```json
{
  "stdout": "Dateisystem       Größe Benutzt Verf. Use% Eingehängt auf\n/dev/sda1          30G    8.5G   20G  30% /",
  "stderr": "",
  "exitCode": 0
}
```

**HTTP 403** wenn:
- `allowCommandExecution` deaktiviert ist
- Befehl nicht in der `commandWhitelist` (wenn Whitelist nicht leer)

**Timeout:** 30 Sekunden  
**maxBuffer:** 1 MB

**Whitelist-Prüfung:**  
Nur der erste Token des Befehls (vor dem ersten Leerzeichen) wird geprüft.  
Beispiel: `whitelist = ["df","free","ps"]` → `df -h` erlaubt, `apt install ...` blockiert.

---

## Versionsverwaltung

### `GET /api/version`

Vergleicht installierte Version mit aktuellstem GitHub-Release.

**Response:**
```json
{
  "installedVersion": "0.1.0",
  "latestVersion": "0.2.0",
  "updateAvailable": true
}
```

Nutzt `https://api.github.com/repos/MPunktBPunkt/iobroker.linuxdashboard/releases/latest`.

---

### `POST /api/update`

Führt Self-Update aus und startet den Adapter neu.

**Ausgeführter Befehl:**
```bash
cd /opt/iobroker && iobroker upgrade linuxdashboard https://github.com/MPunktBPunkt/iobroker.linuxdashboard && iobroker restart linuxdashboard
```

**Response:**
```json
{
  "ok": true,
  "output": "Adapter linuxdashboard upgraded to version 0.2.0\nAdapter linuxdashboard restarted",
  "error": null
}
```

---

## ioBroker State-Schnittstelle

States werden unter `linuxdashboard.<instanz>.*` veröffentlicht.

| State-ID                  | Typ     | Rolle              | Einheit | Beschreibung              |
|---------------------------|---------|--------------------|---------|-----------------------------|
| `info.connection`         | boolean | indicator.connected| -       | Adapter aktiv               |
| `system.hostname`         | string  | info.name          | -       | Hostname des Servers        |
| `system.uptime`           | number  | value              | s       | Systemlaufzeit in Sekunden  |
| `cpu.usage`               | number  | value.usage        | %       | CPU-Auslastung 0-100        |
| `cpu.loadAvg1`            | number  | value              | -       | Load Average 1 Minute       |
| `cpu.loadAvg5`            | number  | value              | -       | Load Average 5 Minuten      |
| `cpu.loadAvg15`           | number  | value              | -       | Load Average 15 Minuten     |
| `memory.totalMB`          | number  | value              | MB      | RAM gesamt                  |
| `memory.freeMB`           | number  | value              | MB      | RAM frei                    |
| `memory.usedPercent`      | number  | value.usage        | %       | RAM-Auslastung 0-100        |

Update-Intervall: Konfigurierbar (Standard 5 Sekunden).

---

## WebSocket (optional)

Falls das `ws`-Paket installiert ist, startet der Adapter einen WebSocket-Server auf demselben Port.

**Verbindung:**
```javascript
const ws = new WebSocket('ws://<IP>:<PORT>');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'metrics') {
    // data.data enthält dasselbe wie GET /api/metrics
  }
};
```

Bei neuer Verbindung werden sofort die aktuellen Metriken gesendet.  
Geplant: Push-Updates alle N Sekunden (noch nicht implementiert).

---

## Fehler-Codes

| HTTP Code | Bedeutung                                         |
|-----------|---------------------------------------------------|
| 200       | Erfolg                                            |
| 400       | Ungültige Anfrage (fehlende Parameter)            |
| 403       | Zugriff verweigert (Path-Traversal / Whitelist)   |
| 404       | Datei / Route nicht gefunden                      |
| 500       | Interner Serverfehler                             |

---

## Sicherheits-Architektur

### Path-Traversal-Schutz

```javascript
function _safePath(requestedPath, root) {
  const resolved = path.resolve(root, requestedPath.replace(/^\//, ''));
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved)) return null; // → HTTP 403
  return resolved;
}
```

Verhindert Pfade wie `/api/files?path=../../etc/shadow`.

### Command-Whitelist

Wenn `commandWhitelist` nicht leer, wird nur der Basis-Befehl (erster Token) geprüft:
```
Konfiguration: "df,free,ps,ip"
"df -h"               → ✅ erlaubt
"ps aux"              → ✅ erlaubt
"rm -rf /"            → ❌ blockiert (rm nicht in Liste)
"df && rm -rf /"      → ⚠️  df erlaubt, aber Shell-Pipe führt rm trotzdem aus
```

> **Hinweis:** Die Whitelist prüft NUR den ersten Token. Shell-Operatoren (`&&`, `;`, `|`) können zur Umgehung genutzt werden. Für sicherheitskritische Umgebungen `allowCommandExecution: false` setzen.
