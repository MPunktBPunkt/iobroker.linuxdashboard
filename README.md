# ioBroker Linux Dashboard Adapter

[![Version](https://img.shields.io/badge/version-0.7.0-blue.svg)](https://github.com/MPunktBPunkt/iobroker.linuxdashboard)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-brightgreen.svg)](https://nodejs.org)

Linux System-Dashboard direkt im Browser – ohne Konsolenzugriff.  
CPU, RAM, Festplatten, Prozesse, Dateimanager, Log-Viewer und Terminal, alles an einem Ort.

---

## Features

* 📊 **System-Dashboard** – CPU, RAM, Swap-Gauges, Festplatten, Netzwerk-Interfaces, Prozesse live
* 📁 **Dateimanager** – Verzeichnisse browsen, Dateien bearbeiten, Download, Upload per Drag & Drop
* 🔍 **Speicher-Analyse** – Größte Dateien & Ordner finden, Drill-Down, direkt im Dateimanager öffnen
* 🧹 **Speicher-Bereinigung** – APT-Cache, Journal, alte Logs, /tmp, npm Cache, benutzerdefinierte Regeln
* 🗂️ **Datei-Editor** – Konfigurationsdateien direkt im Browser bearbeiten und speichern
* 💀 **Prozess-Manager** – Kill (SIGTERM) und Force-Kill (SIGKILL) per Klick
* 📋 **Log-Viewer** – journalctl / syslog, Regex-Filter, Export
* ⚫ **Service Manager** – systemd Services starten, stoppen, neustarten per Klick
* 📦 **Package Manager** – apt search, install, remove, update im Browser
* ⏰ **Cron-Job Editor** – Crontab visuell bearbeiten mit Vorlagen
* 📦 **Backup-Manager** – tar.gz Backups erstellen, herunterladen, löschen
* ⚙️ **Terminal** – Linux-Befehle ohne SSH, Befehlshistorie, Schnellzugriff-Buttons
* 📈 **ioBroker States** – CPU, RAM, Uptime als automatische Datenpunkte
* 🔄 **Self-Update** – direkt über das Web-UI aus GitHub aktualisieren

---

## Installation

### Option A – direkt von GitHub (empfohlen)

```bash
iobroker url https://github.com/MPunktBPunkt/iobroker.linuxdashboard
iobroker add linuxdashboard
```

> **Hinweis:** `iobroker url` installiert aus einer GitHub-URL.  
> `iobroker add` legt anschließend die Adapter-Instanz an.

### Option B – manuell (ohne Internet / Offline)

```bash
# 1. Ordner anlegen
mkdir -p /opt/iobroker/node_modules/iobroker.linuxdashboard

# 2. Dateien kopieren (USB, SCP, WinSCP …)
#    Benötigte Dateien: main.js  io-package.json  package.json

# 3. Abhängigkeiten installieren
cd /opt/iobroker/node_modules/iobroker.linuxdashboard
npm install

# 4. Adapter registrieren
cd /opt/iobroker
iobroker add linuxdashboard
```

### Adapter starten

```bash
iobroker start linuxdashboard
```

Web-UI im Browser öffnen:

```
http://IP-DES-IOBROKER-SERVERS:8090/
```

---

## Konfiguration

Nach der Installation im ioBroker Admin unter **Adapter → Linux Dashboard** konfigurieren:

| Einstellung                | Standard | Beschreibung                                                        |
|----------------------------|----------|---------------------------------------------------------------------|
| HTTP Port                  | `8090`   | Port des Web-UI                                                     |
| Metriken-Intervall         | `5`      | Sekunden zwischen automatischen Aktualisierungen                    |
| Log-Puffer                 | `500`    | Max. gespeicherte interne Log-Einträge                              |
| Dateimanager Wurzel        | `/`      | Oberster erreichbarer Pfad im Dateimanager                          |
| Kommando-Ausführung        | ✅       | Terminal ein-/ausschalten                                           |
| Befehls-Whitelist          | leer     | Kommagetrennte erlaubte Befehle (leer = alle erlaubt)               |
| Ausführliches Logging      | ✅       | Debug-Einträge ins ioBroker-Log schreiben                           |
| HTTP Basic Auth            | ❌       | Web-UI mit Benutzername/Passwort schützen                           |
| Standard-Bereinigungsregeln| `[]`     | JSON-Regeln, die beim ersten Start übernommen werden               |

### HTTP Basic Auth (empfohlen)

Wenn das Dashboard im Netzwerk erreichbar ist, **HTTP Basic Auth aktivieren** und starke Zugangsdaten setzen. Ohne Auth kann jeder im Netzwerk Terminal, Dateimanager und Prozesse nutzen.

### Firewall (falls nötig)

```bash
sudo ufw allow 8090/tcp
```

---

## Web-UI

### Tab: Daten

Echtzeit-Übersicht des gesamten Systems:

| Bereich          | Inhalt                                                  |
|------------------|---------------------------------------------------------|
| CPU-Gauge        | Auslastung in % (blau/gelb/rot je nach Last)            |
| RAM-Gauge        | Auslastung in % inkl. Gesamt und Frei-Anzeige           |
| Swap-Gauge       | Swap-Auslastung                                         |
| System-Info      | Hostname, OS, Kernel, Uptime, Load Average, Node.js     |
| Festplatten      | Alle gemounteten Partitionen mit Fortschrittsbalken     |
| Netzwerk         | Alle Interfaces mit IP und RX/TX-Daten                 |
| Prozesse         | Top 20 Prozesse sortiert nach CPU-Auslastung            |

### Tab: Nodes (Dateimanager)

Dateisystem-Browser ohne Kommandozeile:

* **Linkes Panel**: Schnellnavigation der Root-Verzeichnisse
* **Breadcrumb**: Klickbarer Pfad-Navigator
* **Datei-Liste**: Icon, Name, Größe, Datum, Rechte
* **Text-Preview**: JSON, Bash-Skripte, Konfigurationsdateien direkt ansehen
* **Download**: Beliebige Dateien herunterladen
* **Neuer Ordner**: Verzeichnisse anlegen

> **Sicherheit**: Der Dateimanager ist auf den konfigurierten Wurzel-Pfad beschränkt.

### Tab: Logs

System-Log-Viewer:

| Option          | Beschreibung                                              |
|-----------------|-----------------------------------------------------------|
| Quelle          | syslog, ioBroker, kernel, auth, daemon                   |
| Zeilen          | 10 bis 5000 Zeilen                                        |
| Filter          | Regulärer Ausdruck                                        |
| Auto-Scroll     | Automatisch ans Ende scrollen                             |
| Live            | Neue Zeilen per WebSocket alle 3 Sekunden                 |
| Export          | Log als .txt Datei speichern                             |

Farbkodierung: 🔴 Fehler · 🟡 Warnung · ⚪ Info · ⬜ Debug · 🔵 System

### Tab: System

Der System-Tab ist in 5 Unterbereiche aufgeteilt:

| Bereich  | Inhalt                                                               |
|----------|----------------------------------------------------------------------|
| Services | systemd Services auflisten, filtern, starten / stoppen / neustarten |
| Pakete   | apt search, installierte Pakete, install / remove, apt update        |
| Cron     | Crontab visuell bearbeiten, Vorlagen, speichern                      |
| Terminal | Schnellbefehle + vollständiges Terminal mit Befehlshistorie          |
| Update   | Sysinfo-Grid, GitHub-Versionscheck, Ein-Klick-Update                 |

---

## Angelegte Datenpunkte

Nach dem Start erscheinen unter `linuxdashboard.0`:

```
linuxdashboard.0
  info.connection          – Adapter verbunden (boolean)
  system.hostname          – Hostname (string)
  system.uptime            – Systemlaufzeit in Sekunden (number)
  cpu.usage                – CPU-Auslastung in % (number)
  cpu.loadAvg1             – Load Average 1 min (number)
  cpu.loadAvg5             – Load Average 5 min (number)
  cpu.loadAvg15            – Load Average 15 min (number)
  memory.totalMB           – RAM gesamt in MB (number)
  memory.freeMB            – RAM frei in MB (number)
  memory.usedPercent       – RAM-Auslastung in % (number)
```

---

## Befehlsausführung – Sicherheit

Der ioBroker-Prozess läuft als `iobroker`-User **ohne root-Rechte**.  
Damit funktionieren:

| Befehlstyp                   | Möglich? |
|------------------------------|----------|
| Systeminfo (df, free, ps, ip)| ✅ Ja    |
| Logs lesen (journalctl)       | ✅ Ja    |
| Dateien lesen                 | ✅ Ja (je nach Rechten) |
| Dienste starten/stoppen       | ⚠️ Nur mit sudo-Rechten |
| Pakete installieren           | ⚠️ Nur mit sudo-Rechten |

Für privilegierte Befehle `/etc/sudoers` anpassen. Für die **Speicher-Bereinigung** (Logs, APT, Journal, /tmp) reicht eine eingeschränkte Regel:

```bash
# Als root – nur die für Bereinigung benötigten Befehle:
echo 'iobroker ALL=(ALL) NOPASSWD: /usr/bin/find, /bin/rm, /usr/bin/journalctl, /usr/bin/apt-get, /usr/bin/apt, /usr/bin/du, /bin/ls, /bin/systemctl, /usr/bin/systemctl' | sudo tee /etc/sudoers.d/iobroker-cleanup
sudo chmod 440 /etc/sudoers.d/iobroker-cleanup
```

Für Dienste und Pakete ist systemctl/apt in der Regel oben bereits enthalten.

> Im Web-UI zeigen Banner unter **Bereinigung**, **Services** und **Pakete**, ob passwordloses sudo aktiv ist.

---

## Update

### Option A – über die Web-UI (empfohlen)

Im Browser `http://IP:8090/` öffnen → Tab **⚙️ System** → **„Auf Updates prüfen"**.  
Bei verfügbarem Update erscheint der Button **„Update installieren"**.

### Option B – Kommandozeile

```bash
iobroker url https://github.com/MPunktBPunkt/iobroker.linuxdashboard
iobroker restart linuxdashboard
```

---

## Changelog

### 0.7.0 (2026-06-27)

* HTTP Basic Auth als Adapter-Einstellung
* ioBroker-Log-Bereinigung (`/opt/iobroker/log`) als eigene Regel
* Benutzerdefinierte Bereinigungsregeln serverseitig gespeichert (mit localStorage-Migration)
* sudo für systemctl und apt install/remove/update
* sudo-Status-Banner auch bei Services und Paketen
* Live-Log-Viewer per WebSocket
* Speicher-Analyse: Dateien direkt zur Bereinigung hinzufügen
* Responsive Layout für kleinere Bildschirme

### 0.6.1 (2026-06-27)

* Log-Bereinigung: erweiterte Muster (*.xz, *.zst, *.old, Rotation bis *.20)
* sudo-Status-Banner in der Bereinigungs-Ansicht mit sudoers-Anleitung
* Detaillierte Lösch-Berichte (Anzahl gelöscht / verbleibend / Fehlerdetails)
* Vorschau warnt bei fehlenden sudo-Rechten oder nicht löschbaren Dateien

### 0.1.0 (2026-03-14)

* Erstveröffentlichung
* System-Dashboard mit CPU/RAM/Swap-Gauges, Disk, Netzwerk, Top-Prozesse
* Dateimanager mit Tree, Preview, Download, Ordner-Erstellung
* Log-Viewer mit journalctl/syslog Unterstützung, Regex-Filter, Export
* Terminal mit Befehlshistorie und Schnellzugriff-Buttons
* Self-Update via GitHub Releases API
* ioBroker States für CPU, RAM, Uptime

---

## Lizenz

MIT © MPunktBPunkt
