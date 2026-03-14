'use strict';

const utils    = require('@iobroker/adapter-core');
const http     = require('http');
const https    = require('https');
const os       = require('os');
const fs       = require('fs');
const path     = require('path');
const { exec } = require('child_process');

let WebSocket, WebSocketServer;
try {
    const ws = require('ws');
    WebSocket       = ws.WebSocket || ws;
    WebSocketServer = ws.WebSocketServer || ws.Server;
} catch (_) { WebSocket = null; WebSocketServer = null; }

const ADAPTER_VERSION = '0.5.0';
const GITHUB_REPO     = 'MPunktBPunkt/iobroker.linuxdashboard';

// ── CPU diff ──────────────────────────────────────────────────────────────────
let _prevCpuInfo = null;
function getCpuUsage() {
    const cpus = os.cpus();
    let idle = 0, tick = 0;
    for (const c of cpus) { for (const t in c.times) tick += c.times[t]; idle += c.times.idle; }
    const prev = _prevCpuInfo; _prevCpuInfo = { idle, tick };
    if (!prev) return 0;
    const dIdle = idle - prev.idle, dTick = tick - prev.tick;
    return dTick === 0 ? 0 : Math.round((1 - dIdle / dTick) * 100);
}

const MIME = {
    '.html':'text/html','.css':'text/css','.js':'application/javascript',
    '.json':'application/json','.txt':'text/plain','.md':'text/markdown',
    '.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml',
    '.pdf':'application/pdf','.zip':'application/zip','.sh':'text/plain',
    '.conf':'text/plain','.log':'text/plain',
};
function getMime(f) { return MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'; }
function isText(f) {
    return ['.txt','.md','.json','.js','.ts','.html','.css','.sh','.conf','.cfg',
        '.ini','.log','.yaml','.yml','.xml','.env','.py','.rb','.php',
        '.java','.c','.cpp','.h','.go','.rs','.sql','.service','.timer',
        '.cron','.sudoers','.htaccess'].includes(path.extname(f).toLowerCase());
}

// ── buildHTML ─────────────────────────────────────────────────────────────────
function buildHTML(port, version) {
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg0:#0d1117;--bg1:#161b22;--bg2:#1c2128;--bg3:#262c36;--bg4:#2d333b;
  --border:#30363d;--border2:#3d444d;
  --text:#e6edf3;--muted:#8b949e;--dim:#656d76;
  --accent:#00b4d8;--accent2:#0096c7;
  --green:#3fb950;--yellow:#e3b341;--red:#f85149;--purple:#a371f7;--orange:#f0883e;
  --tab-daten:#00b4d8;--tab-nodes:#3fb950;--tab-logs:#e3b341;--tab-system:#a371f7;
  --r:8px;--rs:4px;
  --mono:'JetBrains Mono','Fira Code','Consolas',monospace;
  --ui:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
html,body{height:100%;background:var(--bg0);color:var(--text);font-family:var(--ui);font-size:14px}
a{color:var(--accent);text-decoration:none}
.header{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;
  background:var(--bg1);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100}
.header-brand{display:flex;align-items:center;gap:10px}
.header-title{font-size:16px;font-weight:700;letter-spacing:.5px}
.header-title span{color:var(--accent)}
.header-meta{display:flex;align-items:center;gap:16px;font-size:12px;color:var(--muted)}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;
  font-size:11px;font-weight:600;background:var(--bg3)}
.badge.online{color:var(--green);border:1px solid #3fb95040}
.badge.version{color:var(--accent);border:1px solid #00b4d840}
.tabs{display:flex;background:var(--bg1);border-bottom:1px solid var(--border);padding:0 24px;gap:2px}
.tab-btn{padding:12px 20px;border:none;background:transparent;color:var(--muted);font-size:13px;
  font-weight:500;cursor:pointer;font-family:var(--ui);border-bottom:2px solid transparent;
  transition:all .15s;white-space:nowrap;margin-bottom:-1px}
.tab-btn:hover{color:var(--text)}
.tab-btn.active-daten{color:var(--tab-daten)!important;border-bottom-color:var(--tab-daten)}
.tab-btn.active-nodes{color:var(--tab-nodes)!important;border-bottom-color:var(--tab-nodes)}
.tab-btn.active-logs{color:var(--tab-logs)!important;border-bottom-color:var(--tab-logs)}
.tab-btn.active-system{color:var(--tab-system)!important;border-bottom-color:var(--tab-system)}
.content{padding:24px;max-width:1400px;margin:0 auto}
.tab-panel{display:none}.tab-panel.active{display:block}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:16px}
.card-title{font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;
  letter-spacing:.8px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.card-title .dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.grid{display:grid;gap:16px}.grid-2{grid-template-columns:1fr 1fr}.grid-3{grid-template-columns:1fr 1fr 1fr}.grid-4{grid-template-columns:repeat(4,1fr)}
/* Gauge */
.gauge-wrap{display:flex;flex-direction:column;align-items:center;gap:8px}
.gauge-svg{transform:rotate(-90deg)}
.gauge-track{fill:none;stroke:var(--bg3)}
.gauge-fill{fill:none;stroke-linecap:round;transition:stroke-dasharray .5s ease}
.gauge-label{text-anchor:middle;dominant-baseline:middle;fill:var(--text);font-family:var(--mono);font-weight:700}
.gauge-sub{text-anchor:middle;fill:var(--muted);font-size:10px}
.gauge-title{font-size:13px;font-weight:600;color:var(--text)}
.gauge-desc{font-size:11px;color:var(--muted)}
/* Progress */
.progress-item{margin-bottom:12px}
.progress-header{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px;align-items:center}
.progress-label{color:var(--text);font-weight:500}
.progress-value{color:var(--muted)}
.progress-track{height:6px;background:var(--bg3);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;border-radius:3px;transition:width .5s ease}
/* Stats */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.stat-item{background:var(--bg3);border-radius:var(--rs);padding:12px}
.stat-key{font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
.stat-val{font-size:15px;font-weight:700;font-family:var(--mono);color:var(--text)}
/* Process / Service Tables */
.data-table{width:100%;border-collapse:collapse;font-size:12px;font-family:var(--mono)}
.data-table th{text-align:left;color:var(--muted);padding:6px 10px;border-bottom:1px solid var(--border);
  font-weight:600;font-size:11px;text-transform:uppercase}
.data-table td{padding:5px 10px;border-bottom:1px solid var(--border2)}
.data-table tr:hover td{background:var(--bg3)}
.data-table .pid{color:var(--accent)}.data-table .cpu{color:var(--yellow)}.data-table .mem{color:var(--green)}
/* Disk Analyzer */
.da-bar-row{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border2)}
.da-bar-name{font-family:var(--mono);font-size:12px;width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.da-bar-track{flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden}
.da-bar-fill{height:100%;border-radius:4px;background:var(--yellow)}
.da-bar-size{font-family:var(--mono);font-size:12px;color:var(--muted);min-width:70px;text-align:right}
/* File Manager */
.fm-layout{display:grid;grid-template-columns:260px 1fr;gap:0;min-height:560px}
.fm-tree{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r) 0 0 var(--r);
  overflow-y:auto;max-height:700px}
.fm-main{background:var(--bg2);border:1px solid var(--border);border-left:none;
  border-radius:0 var(--r) var(--r) 0;display:flex;flex-direction:column}
.fm-breadcrumb{padding:10px 16px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:12px;
  color:var(--muted);display:flex;align-items:center;gap:4px;flex-wrap:wrap;background:var(--bg1)}
.fm-breadcrumb .crumb{color:var(--accent);cursor:pointer}.fm-breadcrumb .crumb:hover{text-decoration:underline}
.fm-toolbar{padding:8px 16px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.fm-files{flex:1;overflow-y:auto;padding:4px 0}
.fm-row{display:grid;grid-template-columns:24px 1fr 90px 120px 90px;
  align-items:center;padding:5px 16px;gap:8px;cursor:pointer;font-size:13px}
.fm-row:hover{background:var(--bg3)}.fm-row.selected{background:var(--bg3);border-left:2px solid var(--accent)}
.fm-row .fm-icon{color:var(--yellow);font-size:16px}.fm-row .fm-dir{color:var(--accent)}
.fm-row .fm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-row .fm-size,.fm-row .fm-date,.fm-row .fm-perm{color:var(--muted);font-family:var(--mono);font-size:11px}
.fm-header{display:grid;grid-template-columns:24px 1fr 90px 120px 90px;padding:5px 16px;gap:8px;
  border-bottom:1px solid var(--border);font-size:11px;color:var(--dim);text-transform:uppercase;
  letter-spacing:.5px;font-weight:600;background:var(--bg1)}
.fm-empty{padding:40px;text-align:center;color:var(--dim)}
.tree-item{display:flex;align-items:center;gap:6px;padding:5px 12px;cursor:pointer;
  font-size:12px;font-family:var(--mono);color:var(--muted)}
.tree-item:hover{background:var(--bg3);color:var(--text)}.tree-item.active{color:var(--green);background:var(--bg3)}
/* Upload */
.fm-dropzone{border:2px dashed var(--border2);border-radius:var(--r);padding:16px;margin:8px 16px;
  text-align:center;cursor:pointer;background:var(--bg1);font-size:13px;color:var(--muted);transition:all .2s}
.fm-dropzone:hover,.fm-dropzone.drag-over{border-color:var(--accent);color:var(--accent);background:rgba(0,180,216,.06)}
.upload-queue{padding:0 16px 8px;display:flex;flex-direction:column;gap:6px}
.upload-item{background:var(--bg3);border-radius:var(--rs);padding:8px 12px;font-size:12px}
.upload-item-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
.upload-item-name{color:var(--text);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%}
.upload-item-status{font-size:11px;font-weight:600}
.upload-item-status.uploading{color:var(--accent)}.upload-item-status.done{color:var(--green)}.upload-item-status.error{color:var(--red)}
.upload-item-bar{height:4px;background:var(--bg0);border-radius:2px;overflow:hidden}
.upload-item-fill{height:100%;border-radius:2px;transition:width .1s;background:var(--accent)}
.upload-item-fill.done{background:var(--green)}.upload-item-fill.error{background:var(--red)}
/* Editor */
.fm-edit-area{border-top:1px solid var(--border);display:flex;flex-direction:column}
.fm-edit-toolbar{padding:8px 16px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;background:var(--bg1)}
.fm-edit-name{color:var(--text);font-weight:600;font-family:var(--mono);font-size:13px;flex:1}
.fm-textarea{flex:1;background:var(--bg0);color:var(--green);font-family:var(--mono);font-size:12px;
  border:none;outline:none;padding:12px 16px;resize:none;min-height:280px;line-height:1.7;width:100%}
.fm-preview-ro{border-top:1px solid var(--border);background:var(--bg0);padding:12px 16px;
  font-family:var(--mono);font-size:12px;max-height:280px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:var(--green)}
/* Log Viewer */
.log-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.log-box{background:var(--bg1);border:1px solid var(--border);border-radius:var(--r);font-family:var(--mono);
  font-size:12px;padding:12px;height:500px;overflow-y:auto;line-height:1.6}
.log-line{padding:1px 0}
.log-line.INFO{color:var(--text)}.log-line.WARN{color:var(--yellow)}
.log-line.ERR{color:var(--red)}.log-line.DEBUG{color:var(--muted)}.log-line.SYSTEM{color:var(--accent)}
/* System Sub-Nav */
.sys-subnav{display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap}
.sys-sub-btn{padding:6px 16px;border:1px solid var(--border);border-radius:999px;background:transparent;
  color:var(--muted);font-size:13px;font-weight:500;cursor:pointer;font-family:var(--ui);transition:all .15s}
.sys-sub-btn:hover{background:var(--bg3);color:var(--text)}
.sys-sub-btn.active{background:var(--purple);color:#fff;border-color:var(--purple)}
.sys-panel{display:none}.sys-panel.active{display:block}
/* Service Manager */
.svc-status-active{color:var(--green);font-weight:600}
.svc-status-inactive,.svc-status-dead{color:var(--muted)}
.svc-status-failed{color:var(--red);font-weight:600}
.svc-status-activating{color:var(--yellow)}
.svc-output{background:var(--bg0);border:1px solid var(--border);border-radius:var(--rs);
  padding:12px;font-family:var(--mono);font-size:12px;color:var(--green);min-height:80px;
  max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;margin-top:12px}
/* Package Manager */
.pkg-search-row{display:flex;gap:8px;margin-bottom:16px}
.pkg-result{padding:8px 12px;border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:12px}
.pkg-name{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--accent);min-width:200px}
.pkg-desc{font-size:12px;color:var(--muted);flex:1}
.pkg-installed-badge{padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;background:#3fb95025;color:var(--green)}
/* Cron Editor */
.cron-table{width:100%;border-collapse:collapse;font-size:13px}
.cron-table th{color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border);text-align:left;font-size:11px;text-transform:uppercase;font-weight:600}
.cron-table td{padding:5px 6px;border-bottom:1px solid var(--border2)}
.cron-input{background:var(--bg1);border:1px solid var(--border);border-radius:3px;color:var(--text);
  padding:4px 8px;font-family:var(--mono);font-size:12px;outline:none;width:100%}
.cron-input:focus{border-color:var(--accent)}
.cron-field-hint{font-size:10px;color:var(--dim);display:block;margin-top:2px;font-family:var(--mono)}
.cron-presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cron-preset{padding:3px 8px;border:1px solid var(--border);border-radius:3px;background:transparent;
  color:var(--muted);font-size:11px;cursor:pointer;font-family:var(--mono)}
.cron-preset:hover{background:var(--bg3);color:var(--text)}
/* Bereinigung */
.clean-rule{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:12px}
.clean-rule-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.clean-rule-icon{font-size:20px}
.clean-rule-title{font-weight:600;color:var(--text);font-size:14px}
.clean-rule-desc{font-size:12px;color:var(--muted);flex:1}
.clean-preview{background:var(--bg0);border:1px solid var(--border);border-radius:var(--rs);
  padding:10px 12px;font-family:var(--mono);font-size:12px;color:var(--muted);
  margin:8px 0;max-height:120px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
.clean-preview.has-data{color:var(--yellow)}
.clean-preview.error{color:var(--red)}
.clean-result{background:var(--bg0);border:1px solid var(--border);border-radius:var(--rs);
  padding:8px 12px;font-family:var(--mono);font-size:12px;color:var(--green);
  margin-top:8px;max-height:100px;overflow-y:auto;white-space:pre-wrap;display:none}
.clean-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.clean-size-badge{font-family:var(--mono);font-size:12px;color:var(--yellow);font-weight:600;padding:3px 8px;
  background:var(--bg3);border-radius:var(--rs);display:none}
.custom-rule-row{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border2)}
/* Storage Analyzer */
.sa-row{display:grid;grid-template-columns:minmax(0,1fr) 80px;align-items:center;gap:8px;
  padding:6px 10px;border-bottom:1px solid var(--border2);cursor:pointer;font-size:12px}
.sa-row:hover{background:var(--bg3)}
.sa-name{font-family:var(--mono);color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;max-width:100%}
.sa-name.sa-link{color:var(--accent)}
.sa-size-col{font-family:var(--mono);text-align:right;font-weight:600}
.sa-bar{height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:3px}
.sa-bar-fill{height:100%;border-radius:2px}
.sa-panel-hdr{padding:7px 10px;font-size:11px;color:var(--dim);text-transform:uppercase;
  letter-spacing:.6px;border-bottom:1px solid var(--border);background:var(--bg1);font-weight:600;
  display:flex;justify-content:space-between;overflow:hidden}
.sa-scroll{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);
  overflow:hidden;max-height:460px;overflow-y:auto}
.sa-placeholder{padding:32px;text-align:center;color:var(--dim);font-size:13px}
.sa-spin{padding:20px;text-align:center;color:var(--muted);font-size:13px}
.sa-path-chip{font-family:var(--mono);font-size:11px;color:var(--muted);
  background:var(--bg3);padding:3px 9px;border-radius:var(--rs);display:none}
/* Backup Manager */
.backup-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border2)}
.backup-name{font-family:var(--mono);font-size:13px;color:var(--text);flex:1}
.backup-size{font-family:var(--mono);font-size:12px;color:var(--muted);min-width:80px}
.backup-date{font-size:12px;color:var(--muted);min-width:130px}
/* Terminal */
.terminal-wrap{background:var(--bg0);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.terminal-bar{background:var(--bg1);padding:8px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border)}
.term-dot{width:10px;height:10px;border-radius:50%}
.terminal-input{display:flex;gap:8px;padding:10px 16px;background:var(--bg0);align-items:center}
.term-prompt{color:var(--green);font-family:var(--mono);font-size:13px;white-space:nowrap}
.terminal-output{background:var(--bg0);padding:0 16px 10px;font-family:var(--mono);font-size:12px;
  min-height:180px;max-height:380px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;line-height:1.7;color:var(--green)}
.quick-btns{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
/* Buttons + Inputs */
.btn{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:var(--rs);border:none;
  cursor:pointer;font-size:13px;font-weight:500;font-family:var(--ui);transition:all .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#000}.btn-primary:hover{background:var(--accent2)}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}.btn-ghost:hover{background:var(--bg3);color:var(--text)}
.btn-green{background:var(--green);color:#000}.btn-green:hover{background:#33a341}
.btn-red{background:var(--red);color:#fff}.btn-red:hover{background:#dc3545}
.btn-yellow{background:var(--yellow);color:#000}.btn-yellow:hover{background:#c99a30}
.btn-purple{background:var(--purple);color:#fff}.btn-purple:hover{background:#8a59d4}
.btn-orange{background:var(--orange);color:#000}.btn-orange:hover{background:#d4752a}
.btn-sm{padding:4px 10px;font-size:12px}
input[type=text],input[type=number],select{background:var(--bg1);border:1px solid var(--border);border-radius:var(--rs);
  color:var(--text);padding:6px 10px;font-size:13px;font-family:var(--ui);outline:none}
input[type=text]:focus,input[type=number]:focus,select:focus{border-color:var(--accent)}
.term-cmd{flex:1;background:transparent;border:none;color:var(--green);font-family:var(--mono);font-size:13px;outline:none}
.sysinfo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.sysinfo-item{background:var(--bg3);border-radius:var(--rs);padding:10px 14px}
.sysinfo-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.sysinfo-value{font-family:var(--mono);font-size:13px;color:var(--text);word-break:break-all}
.tag{display:inline-block;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600}
.tag-green{background:#3fb95025;color:var(--green)}.tag-yellow{background:#e3b34125;color:var(--yellow)}
.tag-red{background:#f8514925;color:var(--red)}.tag-blue{background:#00b4d825;color:var(--accent)}
.hidden{display:none}.mt8{margin-top:8px}.mt16{margin-top:16px}
.net-table{width:100%;border-collapse:collapse;font-size:12px;font-family:var(--mono)}
.net-table th{color:var(--muted);padding:5px 10px;border-bottom:1px solid var(--border);text-align:left;font-size:11px;text-transform:uppercase}
.net-table td{padding:5px 10px;border-bottom:1px solid var(--border2)}
.pkg-output,.apt-output{background:var(--bg0);border:1px solid var(--border);border-radius:var(--rs);padding:10px;
  font-family:var(--mono);font-size:12px;color:var(--green);max-height:250px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
@media(max-width:900px){.grid-4,.grid-3{grid-template-columns:1fr 1fr}.fm-layout{grid-template-columns:1fr}.fm-tree{max-height:200px}}
@media(max-width:600px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}.content{padding:12px}.fm-row{grid-template-columns:24px 1fr 80px}.fm-header{grid-template-columns:24px 1fr 80px}}
`;

const ICON_SVG = `<svg width="28" height="28" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<rect width="100" height="100" rx="16" fill="#0d1117"/>
<rect x="8" y="16" width="84" height="58" rx="6" fill="#1c2128" stroke="#30363d" stroke-width="1.5"/>
<rect x="8" y="16" width="84" height="14" rx="6" fill="#161b22"/><rect x="8" y="22" width="84" height="8" fill="#161b22"/>
<circle cx="20" cy="23" r="3.5" fill="#f85149"/><circle cx="31" cy="23" r="3.5" fill="#e3b341"/><circle cx="42" cy="23" r="3.5" fill="#3fb950"/>
<text x="14" y="42" font-family="monospace" font-size="7" fill="#00b4d8">CPU</text>
<rect x="30" y="36" width="52" height="4.5" rx="2.25" fill="#30363d"/><rect x="30" y="36" width="33" height="4.5" rx="2.25" fill="#00b4d8"/>
<text x="14" y="55" font-family="monospace" font-size="7" fill="#3fb950">RAM</text>
<rect x="30" y="49" width="52" height="4.5" rx="2.25" fill="#30363d"/><rect x="30" y="49" width="41" height="4.5" rx="2.25" fill="#3fb950"/>
<text x="14" y="68" font-family="monospace" font-size="7" fill="#e3b341">DSK</text>
<rect x="30" y="62" width="52" height="4.5" rx="2.25" fill="#30363d"/><rect x="30" y="62" width="24" height="4.5" rx="2.25" fill="#e3b341"/>
<text x="14" y="86" font-family="monospace" font-size="9" fill="#3fb950">$_</text></svg>`;

return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Linux Dashboard v${version}</title>
<style>${CSS}</style></head><body>

<header class="header">
  <div class="header-brand">${ICON_SVG}
    <div class="header-title">Linux <span>Dashboard</span></div>
  </div>
  <div class="header-meta">
    <span class="badge version">v${version}</span>
    <span class="badge online">&#x25CF; Online</span>
    <span class="badge" id="hostname-badge" style="color:var(--yellow)">...</span>
  </div>
</header>

<nav class="tabs">
  <button class="tab-btn" id="btn-daten"  onclick="showTab('daten')">&#x1F4CA; Daten</button>
  <button class="tab-btn" id="btn-nodes"  onclick="showTab('nodes')">&#x1F4C1; Nodes</button>
  <button class="tab-btn" id="btn-logs"   onclick="showTab('logs')">&#x1F4CB; Logs</button>
  <button class="tab-btn" id="btn-system" onclick="showTab('system')">&#x2699;&#xFE0F; System</button>
</nav>

<!-- ═══ TAB: DATEN ═══ -->
<div id="tab-daten" class="tab-panel"><div class="content">
  <div class="grid grid-3" style="margin-bottom:16px">
    <div class="card"><div class="card-title"><span class="dot" style="background:var(--accent)"></span>CPU</div>
      <div class="gauge-wrap">
        <svg class="gauge-svg" width="140" height="140" viewBox="0 0 140 140">
          <circle class="gauge-track" cx="70" cy="70" r="56" stroke-width="10"/>
          <circle class="gauge-fill" id="g-cpu" cx="70" cy="70" r="56" stroke="#00b4d8" stroke-width="10" stroke-dasharray="0 352"/>
          <text class="gauge-label" x="70" y="70" font-size="22" id="cpu-pct">0%</text>
          <text class="gauge-sub" x="70" y="88" font-size="10">Auslastung</text>
        </svg>
        <div class="gauge-title" id="cpu-model">CPU</div>
        <div class="gauge-desc" id="cpu-cores">? Kerne</div>
      </div>
    </div>
    <div class="card"><div class="card-title"><span class="dot" style="background:var(--green)"></span>Arbeitsspeicher</div>
      <div class="gauge-wrap">
        <svg class="gauge-svg" width="140" height="140" viewBox="0 0 140 140">
          <circle class="gauge-track" cx="70" cy="70" r="56" stroke-width="10"/>
          <circle class="gauge-fill" id="g-ram" cx="70" cy="70" r="56" stroke="#3fb950" stroke-width="10" stroke-dasharray="0 352"/>
          <text class="gauge-label" x="70" y="70" font-size="22" id="ram-pct">0%</text>
          <text class="gauge-sub" x="70" y="88" font-size="10">RAM</text>
        </svg>
        <div class="gauge-title" id="ram-info">-- / --</div><div class="gauge-desc">Gesamt / Frei</div>
      </div>
    </div>
    <div class="card"><div class="card-title"><span class="dot" style="background:var(--purple)"></span>Swap</div>
      <div class="gauge-wrap">
        <svg class="gauge-svg" width="140" height="140" viewBox="0 0 140 140">
          <circle class="gauge-track" cx="70" cy="70" r="56" stroke-width="10"/>
          <circle class="gauge-fill" id="g-swap" cx="70" cy="70" r="56" stroke="#a371f7" stroke-width="10" stroke-dasharray="0 352"/>
          <text class="gauge-label" x="70" y="70" font-size="22" id="swap-pct">0%</text>
          <text class="gauge-sub" x="70" y="88" font-size="10">Swap</text>
        </svg>
        <div class="gauge-title" id="swap-info">-- / --</div><div class="gauge-desc">Gesamt / Frei</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--yellow)"></span>System-Info</div>
    <div class="stat-grid">
      <div class="stat-item"><div class="stat-key">Hostname</div><div class="stat-val" id="st-hostname">-</div></div>
      <div class="stat-item"><div class="stat-key">Betriebssystem</div><div class="stat-val" id="st-os">-</div></div>
      <div class="stat-item"><div class="stat-key">Kernel</div><div class="stat-val" id="st-kernel">-</div></div>
      <div class="stat-item"><div class="stat-key">Uptime</div><div class="stat-val" id="st-uptime">-</div></div>
      <div class="stat-item"><div class="stat-key">Load 1/5/15m</div><div class="stat-val" id="st-load">-</div></div>
      <div class="stat-item"><div class="stat-key">Node.js</div><div class="stat-val" id="st-node">-</div></div>
    </div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--yellow)"></span>Festplatten
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" id="da-toggle-btn" onclick="toggleDiskAnalyzer()">&#x1F50D; Analysieren</button>
      </div>
      <div id="disk-bars"></div>
      <div id="disk-analyzer" class="hidden" style="margin-top:16px">
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <input type="text" id="da-path" value="/" style="flex:1" placeholder="/pfad/analysieren">
          <button class="btn btn-yellow btn-sm" onclick="loadDiskAnalyzer()">&#x25B6; Start</button>
        </div>
        <div id="da-results"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--purple)"></span>Netzwerk</div>
      <table class="net-table"><thead><tr><th>Interface</th><th>IPv4</th><th>RX</th><th>TX</th></tr></thead>
      <tbody id="net-tbody"></tbody></table>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--red)"></span>Prozess-Manager
      <span style="color:var(--dim);font-size:11px;font-weight:400;margin-left:4px">Kill = SIGTERM &bull; Force Kill = SIGKILL</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="loadMetrics()">&#x21BB;</button>
    </div>
    <div style="overflow-x:auto">
      <table class="data-table" id="proc-table">
        <thead><tr><th>PID</th><th>NAME</th><th>CPU%</th><th>MEM%</th><th>STATUS</th><th>LAUFZEIT</th><th>AKTION</th></tr></thead>
        <tbody id="proc-tbody"></tbody>
      </table>
    </div>
  </div>
</div></div>

<!-- ═══ TAB: NODES (File Manager + Editor + Backup) ═══ -->
<div id="tab-nodes" class="tab-panel"><div class="content">
  <div class="card" style="padding:0;overflow:hidden">
    <div class="fm-layout">
      <div class="fm-tree" id="fm-tree">
        <div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Verzeichnisse</div>
        <div id="tree-items"></div>
      </div>
      <div class="fm-main">
        <div class="fm-breadcrumb" id="fm-breadcrumb"><span>&#x1F3E0;</span></div>
        <div class="fm-toolbar">
          <button class="btn btn-ghost btn-sm" onclick="fmGoUp()">&#x2191; Hoch</button>
          <button class="btn btn-ghost btn-sm" onclick="fmRefresh()">&#x21BB;</button>
          <button class="btn btn-ghost btn-sm" onclick="fmNewFolder()">&#x1F4C1; Ordner</button>
          <button class="btn btn-green btn-sm" onclick="document.getElementById('fm-file-input').click()">&#x2191; Upload</button>
          <input type="file" id="fm-file-input" multiple class="hidden" onchange="fmUploadFiles(this.files)">
          <span style="flex:1"></span>
          <input type="text" id="fm-filter" placeholder="Filter..." style="width:140px" oninput="fmFilterFiles(this.value)">
        </div>
        <div class="fm-dropzone" id="fm-dropzone"
          ondrop="fmDrop(event)" ondragover="fmDragOver(event)" ondragleave="fmDragLeave(event)"
          onclick="document.getElementById('fm-file-input').click()">
          &#x1F4E4; Dateien ablegen oder klicken &mdash; Ziel: <span id="dz-target-path" style="font-family:var(--mono)">/</span>
        </div>
        <div class="upload-queue hidden" id="upload-queue"></div>
        <div class="fm-header">
          <div></div><div>Name</div>
          <div style="text-align:right">Gr&ouml;&szlig;e</div><div>Ge&auml;ndert</div><div>Rechte</div>
        </div>
        <div class="fm-files" id="fm-files"><div class="fm-empty">Lade...</div></div>
        <!-- Edit / Preview Area -->
        <div id="fm-edit-area" class="fm-edit-area hidden">
          <div class="fm-edit-toolbar">
            <span class="fm-edit-name" id="fm-edit-name">-</span>
            <button class="btn btn-ghost btn-sm" id="fm-edit-toggle" onclick="fmToggleEdit()">&#x270F; Bearbeiten</button>
            <button class="btn btn-green btn-sm hidden" id="fm-save-btn" onclick="fmSaveFile()">&#x1F4BE; Speichern</button>
            <button class="btn btn-ghost btn-sm" onclick="fmDownload()">&#x21D3; Download</button>
            <button class="btn btn-ghost btn-sm" onclick="fmCloseEdit()">&#x2715;</button>
          </div>
          <pre id="fm-preview-ro" class="fm-preview-ro"></pre>
          <textarea id="fm-textarea" class="fm-textarea hidden" spellcheck="false"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- Backup Manager -->
  <div class="card" style="margin-top:16px">
    <div class="card-title"><span class="dot" style="background:var(--orange)"></span>Backup-Manager</div>
    <div class="grid grid-2">
      <div>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <input type="text" id="bk-source" placeholder="Quellpfad (z.B. /opt/iobroker/data)" style="flex:1;min-width:200px">
          <input type="text" id="bk-name" placeholder="Name (ohne .tar.gz)" style="width:180px">
          <button class="btn btn-orange btn-sm" onclick="createBackup()">&#x1F4E6; Backup erstellen</button>
        </div>
        <div style="font-size:12px;color:var(--muted)">Backups werden gespeichert in: <span style="font-family:var(--mono)" id="bk-dir">/tmp/iobroker-backups</span></div>
        <div id="bk-create-output" class="apt-output hidden mt8"></div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="font-size:13px;color:var(--muted)">Vorhandene Backups</span>
          <button class="btn btn-ghost btn-sm" onclick="loadBackups()">&#x21BB;</button>
        </div>
        <div id="bk-list"><div style="color:var(--dim);font-size:13px">Lade...</div></div>
      </div>
    </div>
  </div>
</div></div>

<!-- ═══ TAB: LOGS ═══ -->
<div id="tab-logs" class="tab-panel"><div class="content">
  <div class="card">
    <div class="card-title"><span class="dot" style="background:var(--yellow)"></span>System-Log Viewer</div>
    <div class="log-toolbar">
      <select id="log-source" onchange="loadLogs()">
        <option value="syslog">syslog</option>
        <option value="iobroker">ioBroker</option>
        <option value="kern">kernel</option>
        <option value="auth">auth</option>
        <option value="daemon">daemon</option>
      </select>
      <input type="number" id="log-lines" value="200" min="10" max="5000" style="width:80px" title="Anzahl Zeilen">
      <input type="text" id="log-filter" placeholder="Filter (Regex)..." style="width:200px" oninput="applyLogFilter()">
      <button class="btn btn-ghost btn-sm" onclick="loadLogs()">&#x21BB; Laden</button>
      <label style="display:flex;align-items:center;gap:6px;color:var(--muted);font-size:13px;cursor:pointer">
        <input type="checkbox" id="log-autoscroll" checked> Auto-Scroll
      </label>
      <button class="btn btn-ghost btn-sm" onclick="exportLogs()" style="margin-left:auto">&#x1F4E5; Export</button>
    </div>
    <div class="log-box" id="log-box"></div>
    <div style="margin-top:8px;font-size:11px;color:var(--dim)" id="log-info"></div>
  </div>
</div></div>

<!-- ═══ TAB: SYSTEM ═══ -->
<div id="tab-system" class="tab-panel"><div class="content">
  <div class="sys-subnav">
    <button class="sys-sub-btn" id="ssb-speicher"   onclick="showSysSub('speicher')">&#x1F4BE; Speicher</button>
    <button class="sys-sub-btn" id="ssb-bereinigung" onclick="showSysSub('bereinigung')">&#x1F9F9; Bereinigung</button>
    <button class="sys-sub-btn" id="ssb-services" onclick="showSysSub('services')">&#x26AA; Services</button>
    <button class="sys-sub-btn" id="ssb-packages" onclick="showSysSub('packages')">&#x1F4E6; Pakete</button>
    <button class="sys-sub-btn" id="ssb-cron"     onclick="showSysSub('cron')">&#x23F0; Cron Jobs</button>
    <button class="sys-sub-btn" id="ssb-terminal" onclick="showSysSub('terminal')">&#x1F4BB; Terminal</button>
    <button class="sys-sub-btn" id="ssb-update"   onclick="showSysSub('update')">&#x1F504; Update</button>
  </div>

  <!-- Speicher-Analyse -->
  <div class="sys-panel" id="sys-speicher">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--red)"></span>Speicher-Analyse
        <span style="color:var(--dim);font-size:11px;font-weight:400;margin-left:8px">Gr&ouml;&szlig;te Dateien &amp; Ordner finden</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
        <input type="text" id="sa-path" value="/" style="flex:1;max-width:380px" placeholder="Startpfad...">
        <input type="number" id="sa-limit" value="25" min="5" max="200" style="width:70px" title="Max. Ergebnisse">
        <button class="btn btn-red" onclick="runStorageAnalysis()">&#x1F50D; Analyse starten</button>
        <span id="sa-status" style="font-size:12px;color:var(--muted)"></span>
      </div>
      <div class="grid grid-2" style="gap:16px;min-width:0">
        <div style="min-width:0;overflow:hidden">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:8px">
            <span style="color:var(--red)">&#x1F4C4;</span>Gr&ouml;&szlig;te Dateien
            <span id="sa-files-count" style="font-size:11px;color:var(--dim);font-weight:400"></span>
            <span style="font-size:11px;color:var(--dim);font-weight:400;margin-left:4px">Klick &rarr; im Dateimanager &ouml;ffnen</span>
          </div>
          <div class="sa-scroll" id="sa-files-panel">
            <div class="sa-placeholder">Analyse starten</div>
          </div>
        </div>
        <div style="min-width:0;overflow:hidden">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:8px">
            <span style="color:var(--yellow)">&#x1F4C1;</span>Gr&ouml;&szlig;te Ordner
            <span id="sa-dirs-count" style="font-size:11px;color:var(--dim);font-weight:400"></span>
            <button class="btn btn-ghost btn-sm" id="sa-up-btn" onclick="saDirUp()" style="margin-left:auto;display:none">&#x2191; Hoch</button>
          </div>
          <div id="sa-path-chip" class="sa-path-chip" style="margin-bottom:8px"></div>
          <div class="sa-scroll" id="sa-dirs-panel">
            <div class="sa-placeholder">Analyse starten</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bereinigung -->
  <div class="sys-panel" id="sys-bereinigung">
    <div class="content" style="padding:0">

      <!-- APT Cache -->
      <div class="clean-rule">
        <div class="clean-rule-header">
          <span class="clean-rule-icon">&#x1F4E6;</span>
          <div>
            <div class="clean-rule-title">APT-Cache leeren</div>
            <div class="clean-rule-desc">Heruntergeladene Paket-Dateien aus /var/cache/apt/archives</div>
          </div>
          <span class="clean-size-badge" id="apt-size"></span>
        </div>
        <div class="clean-preview" id="apt-preview">Vorschau laden...</div>
        <div class="clean-result" id="apt-result"></div>
        <div class="clean-actions">
          <button class="btn btn-ghost btn-sm" onclick="cleanPreview('apt')">&#x1F50D; Vorschau</button>
          <button class="btn btn-red btn-sm" onclick="cleanRun('apt')">&#x1F9F9; Bereinigen</button>
        </div>
      </div>

      <!-- Systemd Journal -->
      <div class="clean-rule">
        <div class="clean-rule-header">
          <span class="clean-rule-icon">&#x1F4CB;</span>
          <div>
            <div class="clean-rule-title">Systemd Journal verkleinern</div>
            <div class="clean-rule-desc">Journal auf maximale Gr&ouml;&szlig;e oder Alter begrenzen</div>
          </div>
          <span class="clean-size-badge" id="journal-size"></span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;flex-wrap:wrap">
          <label style="font-size:13px;color:var(--muted)">Max. Gr&ouml;&szlig;e:</label>
          <input type="number" id="journal-maxsize" value="500" min="50" max="10000" style="width:80px"> MB
          <label style="font-size:13px;color:var(--muted);margin-left:12px">oder max. Alter:</label>
          <input type="number" id="journal-maxdays" value="30" min="1" max="365" style="width:70px"> Tage
        </div>
        <div class="clean-preview" id="journal-preview">Vorschau laden...</div>
        <div class="clean-result" id="journal-result"></div>
        <div class="clean-actions">
          <button class="btn btn-ghost btn-sm" onclick="cleanPreview('journal')">&#x1F50D; Vorschau</button>
          <button class="btn btn-red btn-sm" onclick="cleanRun('journal')">&#x1F9F9; Bereinigen</button>
        </div>
      </div>

      <!-- Alte Log-Dateien -->
      <div class="clean-rule">
        <div class="clean-rule-header">
          <span class="clean-rule-icon">&#x1F5D1;</span>
          <div>
            <div class="clean-rule-title">Alte Log-Dateien l&ouml;schen</div>
            <div class="clean-rule-desc">Komprimierte &amp; rotierte Logs in /var/log (*.gz, *.1, *.2 ...)</div>
          </div>
          <span class="clean-size-badge" id="oldlogs-size"></span>
        </div>
        <div class="clean-preview" id="oldlogs-preview">Vorschau laden...</div>
        <div class="clean-result" id="oldlogs-result"></div>
        <div class="clean-actions">
          <button class="btn btn-ghost btn-sm" onclick="cleanPreview('oldlogs')">&#x1F50D; Vorschau</button>
          <button class="btn btn-red btn-sm" onclick="cleanRun('oldlogs')">&#x1F9F9; Bereinigen</button>
        </div>
      </div>

      <!-- /tmp leeren -->
      <div class="clean-rule">
        <div class="clean-rule-header">
          <span class="clean-rule-icon">&#x23F3;</span>
          <div>
            <div class="clean-rule-title">/tmp leeren</div>
            <div class="clean-rule-desc">Tempor&auml;re Dateien &auml;lter als N Tage aus /tmp und /var/tmp</div>
          </div>
          <span class="clean-size-badge" id="tmp-size"></span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <label style="font-size:13px;color:var(--muted)">Dateien &auml;lter als:</label>
          <input type="number" id="tmp-days" value="7" min="0" max="365" style="width:70px"> Tage
          <span style="font-size:12px;color:var(--dim)">(0 = alle)</span>
        </div>
        <div class="clean-preview" id="tmp-preview">Vorschau laden...</div>
        <div class="clean-result" id="tmp-result"></div>
        <div class="clean-actions">
          <button class="btn btn-ghost btn-sm" onclick="cleanPreview('tmp')">&#x1F50D; Vorschau</button>
          <button class="btn btn-red btn-sm" onclick="cleanRun('tmp')">&#x1F9F9; Bereinigen</button>
        </div>
      </div>

      <!-- npm Cache -->
      <div class="clean-rule">
        <div class="clean-rule-header">
          <span class="clean-rule-icon">&#x1F7E2;</span>
          <div>
            <div class="clean-rule-title">npm &amp; Node.js Cache leeren</div>
            <div class="clean-rule-desc">npm Cache des ioBroker-Users bereinigen</div>
          </div>
          <span class="clean-size-badge" id="npm-size"></span>
        </div>
        <div class="clean-preview" id="npm-preview">Vorschau laden...</div>
        <div class="clean-result" id="npm-result"></div>
        <div class="clean-actions">
          <button class="btn btn-ghost btn-sm" onclick="cleanPreview('npm')">&#x1F50D; Vorschau</button>
          <button class="btn btn-red btn-sm" onclick="cleanRun('npm')">&#x1F9F9; Bereinigen</button>
        </div>
      </div>

      <!-- Benutzerdefiniert -->
      <div class="clean-rule">
        <div class="clean-rule-header">
          <span class="clean-rule-icon">&#x2699;&#xFE0F;</span>
          <div>
            <div class="clean-rule-title">Benutzerdefinierte Bereinigung</div>
            <div class="clean-rule-desc">Eigene Pfade / Muster definieren und gespeichert ausf&uuml;hren</div>
          </div>
        </div>
        <div id="custom-rules-list" style="margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" id="custom-path" placeholder="Pfad oder Muster (z.B. /opt/iobroker/logs/*.log)" style="flex:1;min-width:200px">
          <input type="number" id="custom-days" value="0" min="0" max="365" style="width:70px" title="&Auml;lter als N Tage (0 = alle)">
          <span style="font-size:12px;color:var(--dim);align-self:center">Tage</span>
          <button class="btn btn-ghost btn-sm" onclick="customRuleAdd()">&#x2B; Hinzuf&uuml;gen</button>
        </div>
        <div class="clean-preview" id="custom-preview" style="margin-top:8px"></div>
        <div class="clean-result" id="custom-result"></div>
        <div class="clean-actions" style="margin-top:8px">
          <button class="btn btn-ghost btn-sm" onclick="cleanPreview('custom')">&#x1F50D; Vorschau</button>
          <button class="btn btn-red btn-sm" onclick="cleanRun('custom')">&#x1F9F9; Alle ausf&uuml;hren</button>
        </div>
      </div>

    </div>
  </div>

  <!-- Service Manager -->
  <div class="sys-panel" id="sys-services">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--green)"></span>Service Manager
        <div style="display:flex;gap:8px;margin-left:auto">
          <input type="text" id="svc-filter" placeholder="Filter..." style="width:160px" oninput="filterServices(this.value)">
          <select id="svc-state-filter" onchange="loadServices()">
            <option value="running">Laufend</option>
            <option value="all">Alle</option>
            <option value="failed">Fehler</option>
          </select>
          <button class="btn btn-ghost btn-sm" onclick="loadServices()">&#x21BB;</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table" id="svc-table">
          <thead><tr><th>Service</th><th>Status</th><th>Sub</th><th>Beschreibung</th><th>Aktionen</th></tr></thead>
          <tbody id="svc-tbody"><tr><td colspan="5" style="color:var(--dim);padding:20px">Lade...</td></tr></tbody>
        </table>
      </div>
      <div id="svc-output" class="svc-output hidden"></div>
    </div>
  </div>

  <!-- Package Manager -->
  <div class="sys-panel" id="sys-packages">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--accent)"></span>Package Manager (apt)
        <span style="color:var(--dim);font-size:11px;font-weight:400;margin-left:8px">&#x26A0;&#xFE0F; Erfordert sudo-Rechte</span>
      </div>
      <div class="pkg-search-row">
        <input type="text" id="pkg-search" placeholder="Paketname suchen..." style="flex:1" onkeydown="if(event.key==='Enter')searchPackages()">
        <button class="btn btn-primary btn-sm" onclick="searchPackages()">&#x1F50D; Suchen</button>
        <button class="btn btn-ghost btn-sm" onclick="loadInstalledPackages()">&#x1F4CB; Installierte anzeigen</button>
        <button class="btn btn-yellow btn-sm" onclick="aptUpdate()">&#x21BB; apt update</button>
      </div>
      <div id="pkg-results" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--rs)">
        <div style="padding:20px;color:var(--dim);font-size:13px;text-align:center">Suche nach Paketen oder installierte anzeigen</div>
      </div>
      <div id="apt-output" class="apt-output hidden mt8"></div>
    </div>
  </div>

  <!-- Cron Editor -->
  <div class="sys-panel" id="sys-cron">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--yellow)"></span>Cron-Job Editor
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="loadCrontab()">&#x21BB; Neu laden</button>
        <button class="btn btn-green btn-sm" onclick="saveCrontab()">&#x1F4BE; Speichern</button>
      </div>
      <div class="cron-presets">
        <span style="font-size:12px;color:var(--muted);margin-right:4px">Vorlagen:</span>
        <button class="cron-preset" onclick="addCronPreset('* * * * *')">Jede Minute</button>
        <button class="cron-preset" onclick="addCronPreset('0 * * * *')">St&uuml;ndlich</button>
        <button class="cron-preset" onclick="addCronPreset('0 0 * * *')">T&auml;glich (00:00)</button>
        <button class="cron-preset" onclick="addCronPreset('0 2 * * *')">T&auml;glich (02:00)</button>
        <button class="cron-preset" onclick="addCronPreset('0 0 * * 0')">W&ouml;chentlich (So)</button>
        <button class="cron-preset" onclick="addCronPreset('0 0 1 * *')">Monatlich</button>
        <button class="cron-preset" onclick="addCronPreset('@reboot')">@reboot</button>
      </div>
      <div style="overflow-x:auto">
        <table class="cron-table" id="cron-table">
          <thead><tr>
            <th style="width:80px">Minute<span class="cron-field-hint">0-59</span></th>
            <th style="width:80px">Stunde<span class="cron-field-hint">0-23</span></th>
            <th style="width:80px">Tag/Mo<span class="cron-field-hint">1-31</span></th>
            <th style="width:80px">Monat<span class="cron-field-hint">1-12</span></th>
            <th style="width:80px">Tag/Wo<span class="cron-field-hint">0-7</span></th>
            <th>Befehl</th>
            <th style="width:40px"></th>
          </tr></thead>
          <tbody id="cron-tbody"></tbody>
        </table>
      </div>
      <button class="btn btn-ghost btn-sm mt8" onclick="addCronRow('','','','','','')">&#x2B; Zeile hinzuf&uuml;gen</button>
      <div id="cron-output" class="apt-output hidden mt8"></div>
    </div>
  </div>

  <!-- Terminal -->
  <div class="sys-panel" id="sys-terminal">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--yellow)"></span>Schnellbefehle</div>
      <div class="quick-btns">
        <button class="btn btn-ghost btn-sm" onclick="runQuick('df -h')">&#x1F4BE; df -h</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('free -h')">&#x1F4CA; free -h</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('uptime')">&#x23F1; uptime</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('ps aux --sort=-%cpu | head -20')">Top Prozesse</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('ip a')">&#x1F310; ip a</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('ss -tlnp')">&#x1F50C; Ports</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('lsblk')">&#x1F4BD; lsblk</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('uname -a')">uname -a</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('journalctl -n 30 --no-pager')">Journal 30</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('cat /proc/temperature 2>/dev/null || vcgencmd measure_temp 2>/dev/null')">&#x1F321; Temperatur</button>
        <button class="btn btn-yellow btn-sm" onclick="runQuick('systemctl restart iobroker')">&#x21BB; ioBroker Restart</button>
        <button class="btn btn-ghost btn-sm" onclick="runQuick('systemctl status iobroker')">ioBroker Status</button>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="terminal-wrap" style="border:none;border-radius:0">
        <div class="terminal-bar">
          <div class="term-dot" style="background:#f85149"></div>
          <div class="term-dot" style="background:#e3b341"></div>
          <div class="term-dot" style="background:#3fb950"></div>
          <span style="font-size:12px;color:var(--muted);margin-left:8px;font-family:var(--mono)">bash &mdash; ioBroker Linux Dashboard</span>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:11px" onclick="termClear()">Clear</button>
        </div>
        <div class="terminal-output" id="term-output">Linux Dashboard Terminal bereit.&#10;</div>
        <div class="terminal-input">
          <span class="term-prompt" id="term-prompt">iobroker@linux:~$</span>
          <input type="text" class="term-cmd" id="term-cmd" placeholder="Befehl eingeben..." onkeydown="termKeydown(event)">
          <button class="btn btn-green btn-sm" onclick="termRun()">&#x23CE; Run</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Update -->
  <div class="sys-panel" id="sys-update">
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--accent)"></span>System-Informationen</div>
      <div class="sysinfo-grid" id="sysinfo-detail"></div>
    </div>
    <div class="card">
      <div class="card-title"><span class="dot" style="background:var(--accent)"></span>Adapter-Update</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="color:var(--muted);font-size:13px">Installiert: <span style="font-family:var(--mono);color:var(--text)">v${version}</span></span>
        <div id="update-info" style="color:var(--muted);font-size:13px"></div>
        <button class="btn btn-ghost btn-sm" onclick="checkUpdate()">&#x1F50D; Pr&uuml;fen</button>
        <button class="btn btn-green btn-sm hidden" id="btn-update" onclick="doUpdate()">&#x21D3; Update</button>
      </div>
      <div id="update-output" class="apt-output hidden mt8"></div>
    </div>
  </div>
</div></div>

<script>
// ── Gauge ──────────────────────────────────────────────────────────────────
function setGauge(id, pct, c1, c2, c3) {
  const circ = 2 * Math.PI * 56;
  const el = document.getElementById(id); if (!el) return;
  el.setAttribute('stroke', pct > 85 ? c3 : pct > 65 ? c2 : c1);
  el.setAttribute('stroke-dasharray', (pct/100*circ) + ' ' + (circ - pct/100*circ));
}

// ── Tab Navigation ─────────────────────────────────────────────────────────
let _activeTab = 'daten', _activeSysSub = 'services';
window.showTab = function(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.className = 'tab-btn');
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  const btn = document.getElementById('btn-' + name);
  if (btn) btn.classList.add('active-' + name);
  _activeTab = name;
  if (name === 'daten')  loadMetrics();
  if (name === 'nodes')  { fmLoad(currentPath); loadBackups(); }
  if (name === 'logs')   loadLogs();
  if (name === 'system') { showSysSub(_activeSysSub); loadSysInfo(); }
};
window.showSysSub = function(name) {
  document.querySelectorAll('.sys-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sys-sub-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('sys-' + name);
  if (panel) panel.classList.add('active');
  const btn = document.getElementById('ssb-' + name);
  if (btn) btn.classList.add('active');
  _activeSysSub = name;
  if (name === 'speicher') { /* on-demand */ }
  if (name === 'bereinigung') { loadAllCleanPreviews(); loadCustomRules(); }
  if (name === 'services') loadServices();
  if (name === 'packages') loadInstalledPackages();
  if (name === 'cron') loadCrontab();
  if (name === 'update') loadSysInfo();
};

// ── Metrics ────────────────────────────────────────────────────────────────
async function loadMetrics() {
  try {
    const d = await fetchJSON('/api/metrics');
    document.getElementById('hostname-badge').textContent = d.hostname || '';
    // CPU
    const cpuPct = d.cpu?.usagePercent || 0;
    setGauge('g-cpu', cpuPct, '#00b4d8', '#e3b341', '#f85149');
    document.getElementById('cpu-pct').textContent = cpuPct + '%';
    document.getElementById('cpu-model').textContent = (d.cpu?.model || 'CPU').substring(0,32);
    document.getElementById('cpu-cores').textContent = (d.cpu?.cores || '?') + ' Kerne';
    // RAM
    const ramPct = d.memory?.usedPercent || 0;
    setGauge('g-ram', ramPct, '#3fb950', '#e3b341', '#f85149');
    document.getElementById('ram-pct').textContent = ramPct + '%';
    document.getElementById('ram-info').textContent = fmtBytes(d.memory?.total||0) + ' / ' + fmtBytes(d.memory?.free||0) + ' frei';
    // Swap
    const swapPct = d.swap?.total > 0 ? Math.round(d.swap.used / d.swap.total * 100) : 0;
    setGauge('g-swap', swapPct, '#a371f7', '#e3b341', '#f85149');
    document.getElementById('swap-pct').textContent = swapPct + '%';
    document.getElementById('swap-info').textContent = fmtBytes(d.swap?.total||0) + ' / ' + fmtBytes(d.swap?.free||0) + ' frei';
    // Stats
    document.getElementById('st-hostname').textContent = d.hostname || '-';
    document.getElementById('st-os').textContent = (d.platform||'') + ' ' + (d.arch||'');
    document.getElementById('st-kernel').textContent = d.release || '-';
    document.getElementById('st-uptime').textContent = fmtUptime(d.uptime||0);
    document.getElementById('st-load').textContent = (d.loadAvg||[0,0,0]).map(x=>x.toFixed(2)).join(' / ');
    document.getElementById('st-node').textContent = d.nodeVersion || '-';
    // Disks
    const diskBars = document.getElementById('disk-bars'); diskBars.innerHTML = '';
    (d.disks||[]).forEach(disk => {
      const pct = disk.usedPercent || 0;
      const col = pct > 85 ? '#f85149' : pct > 65 ? '#e3b341' : '#e3b341';
      diskBars.innerHTML += \`<div class="progress-item">
        <div class="progress-header">
          <span class="progress-label" style="font-family:var(--mono)">\${disk.mount}</span>
          <span class="progress-value">\${pct}% &bull; \${fmtBytes(disk.used)} / \${fmtBytes(disk.size)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:\${pct}%;background:\${col}"></div></div>
      </div>\`;
    });
    // Network
    const netBody = document.getElementById('net-tbody'); netBody.innerHTML = '';
    (d.network||[]).forEach(iface => {
      netBody.innerHTML += \`<tr>
        <td style="color:var(--accent)">\${iface.name}</td>
        <td>\${iface.address||'-'}</td>
        <td style="color:var(--green)">\${fmtBytes(iface.rx||0)}</td>
        <td style="color:var(--purple)">\${fmtBytes(iface.tx||0)}</td>
      </tr>\`;
    });
    // Processes
    const procBody = document.getElementById('proc-tbody'); procBody.innerHTML = '';
    (d.processes||[]).slice(0,25).forEach(p => {
      procBody.innerHTML += \`<tr>
        <td class="pid">\${p.pid}</td>
        <td>\${esc(p.name)}</td>
        <td class="cpu">\${p.cpu}%</td>
        <td class="mem">\${p.mem}%</td>
        <td><span class="tag tag-green">\${p.status||'S'}</span></td>
        <td style="color:var(--muted)">\${p.time||'-'}</td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-yellow btn-sm" title="SIGTERM (sanft)" onclick="killProc(\${p.pid},15)">Kill</button>
          <button class="btn btn-red btn-sm" title="SIGKILL (sofort)" onclick="killProc(\${p.pid},9)">&#x26A1;</button>
        </td>
      </tr>\`;
    });
  } catch(e) { console.error(e); }
}

// ── Process Kill ───────────────────────────────────────────────────────────
async function killProc(pid, sig) {
  const sigName = sig === 9 ? 'SIGKILL (sofort)' : 'SIGTERM (sanft)';
  if (!confirm(\`Prozess \${pid} mit \${sigName} beenden?\`)) return;
  try {
    const d = await postJSON('/api/kill', { pid, signal: sig });
    if (d.ok) { loadMetrics(); }
    else alert('Fehler: ' + (d.error||'Unbekannt'));
  } catch(e) { alert('Fehler: ' + e.message); }
}

// ── Disk Analyzer ──────────────────────────────────────────────────────────
let _daVisible = false;
function toggleDiskAnalyzer() {
  _daVisible = !_daVisible;
  document.getElementById('disk-analyzer').classList.toggle('hidden', !_daVisible);
  document.getElementById('da-toggle-btn').textContent = _daVisible ? '\u2715 Schlie\u00dfen' : '\uD83D\uDD0D Analysieren';
  if (_daVisible) loadDiskAnalyzer();
}
async function loadDiskAnalyzer() {
  const p = document.getElementById('da-path').value || '/';
  const el = document.getElementById('da-results');
  el.innerHTML = '<div style="color:var(--muted);font-size:13px">Analysiere ' + esc(p) + ' ...</div>';
  try {
    const d = await fetchJSON('/api/diskanalyzer?path=' + encodeURIComponent(p));
    if (d.error) { el.innerHTML = '<div style="color:var(--red)">' + esc(d.error) + '</div>'; return; }
    const entries = d.entries || [];
    const maxBytes = Math.max(...entries.map(e => e.bytes), 1);
    el.innerHTML = entries.map(e => {
      const pct = Math.round(e.bytes / maxBytes * 100);
      return \`<div class="da-bar-row">
        <div class="da-bar-name" title="\${esc(e.path)}">\${esc(e.name)}</div>
        <div class="da-bar-track"><div class="da-bar-fill" style="width:\${pct}%"></div></div>
        <div class="da-bar-size">\${esc(e.size)}</div>
      </div>\`;
    }).join('') || '<div class="fm-empty">Keine Eintr\u00e4ge</div>';
  } catch(e) { el.innerHTML = '<div style="color:var(--red)">Fehler: ' + esc(e.message) + '</div>'; }
}

// ── File Manager ───────────────────────────────────────────────────────────
let currentPath = '/', allFiles = [], selectedFile = null, _editMode = false;

async function fmLoad(p) {
  currentPath = p || '/';
  document.getElementById('dz-target-path').textContent = currentPath;
  try {
    const d = await fetchJSON('/api/files?path=' + encodeURIComponent(currentPath));
    if (d.error) { document.getElementById('fm-files').innerHTML = \`<div class="fm-empty" style="color:var(--red)">\${esc(d.error)}</div>\`; return; }
    allFiles = d.entries || []; renderFiles(allFiles);
    renderBreadcrumb(currentPath); renderTree(currentPath); fmCloseEdit();
  } catch(e) { document.getElementById('fm-files').innerHTML = \`<div class="fm-empty" style="color:var(--red)">Fehler: \${esc(e.message)}</div>\`; }
}
function renderFiles(entries) {
  const el = document.getElementById('fm-files');
  if (!entries.length) { el.innerHTML = '<div class="fm-empty">Verzeichnis ist leer</div>'; return; }
  el.innerHTML = entries.map(e => {
    const icon = e.isDir ? '\uD83D\uDCC1' : getFileIcon(e.name);
    return \`<div class="fm-row" onclick="fmClick(this,'\${esc(e.name)}',\${e.isDir})">
      <div class="fm-icon">\${icon}</div>
      <div class="\${e.isDir ? 'fm-name fm-dir' : 'fm-name'}" title="\${esc(e.name)}">\${esc(e.name)}</div>
      <div class="fm-size" style="text-align:right">\${e.isDir ? '-' : fmtBytes(e.size)}</div>
      <div class="fm-date">\${fmtDate(e.mtime)}</div>
      <div class="fm-perm" style="font-family:var(--mono)">\${e.mode||'-'}</div>
    </div>\`;
  }).join('');
}
function fmFilterFiles(q) { renderFiles(q ? allFiles.filter(e => e.name.toLowerCase().includes(q.toLowerCase())) : allFiles); }
function fmClick(el, name, isDir) {
  document.querySelectorAll('.fm-row').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected'); selectedFile = name;
  if (isDir) fmLoad((currentPath.replace(/\\/$/,'') + '/' + name).replace('//','/')); else fmOpenFile(name);
}
async function fmOpenFile(name) {
  const fp = (currentPath.replace(/\\/$/,'') + '/' + name).replace('//','/');\
  document.getElementById('fm-edit-name').textContent = name;
  document.getElementById('fm-edit-area').classList.remove('hidden');
  document.getElementById('fm-preview-ro').textContent = 'Lade...';
  document.getElementById('fm-preview-ro').classList.remove('hidden');
  document.getElementById('fm-textarea').classList.add('hidden');
  document.getElementById('fm-save-btn').classList.add('hidden');
  document.getElementById('fm-edit-toggle').textContent = '\u270F Bearbeiten';
  _editMode = false;
  try {
    const r = await fetch('/api/file?path=' + encodeURIComponent(fp));
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('text')) { document.getElementById('fm-preview-ro').textContent = await r.text(); }
    else { document.getElementById('fm-preview-ro').textContent = '[Bin\u00e4rdatei \u2014 kein Vorschau verf\u00fcgbar]'; }
  } catch(e) { document.getElementById('fm-preview-ro').textContent = 'Fehler: ' + e.message; }
}
function fmToggleEdit() {
  _editMode = !_editMode;
  const ro = document.getElementById('fm-preview-ro');
  const ta = document.getElementById('fm-textarea');
  const saveBtn = document.getElementById('fm-save-btn');
  const toggleBtn = document.getElementById('fm-edit-toggle');
  if (_editMode) {
    ta.value = ro.textContent; ro.classList.add('hidden'); ta.classList.remove('hidden');
    saveBtn.classList.remove('hidden'); toggleBtn.textContent = '\uD83D\uDC41 Vorschau';
  } else {
    ro.textContent = ta.value; ta.classList.add('hidden'); ro.classList.remove('hidden');
    saveBtn.classList.add('hidden'); toggleBtn.textContent = '\u270F Bearbeiten';
  }
}
async function fmSaveFile() {
  if (!selectedFile) return;
  const fp = (currentPath.replace(/\\/$/,'') + '/' + selectedFile).replace('//','/');\
  const content = document.getElementById('fm-textarea').value;
  try {
    const d = await postJSON('/api/file-write', { path: fp, content });
    if (d.ok) {
      document.getElementById('fm-edit-name').textContent = selectedFile + ' \u2714 Gespeichert';
      setTimeout(() => { document.getElementById('fm-edit-name').textContent = selectedFile; }, 2000);
    } else { alert('Fehler: ' + (d.error||'Unbekannt')); }
  } catch(e) { alert('Fehler: ' + e.message); }
}
function fmCloseEdit() { document.getElementById('fm-edit-area').classList.add('hidden'); _editMode = false; }
function fmDownload() {
  if (!selectedFile) return;
  window.open('/api/download?path=' + encodeURIComponent((currentPath + '/' + selectedFile).replace(/\\/\\//g, '/')))\
;
}
function fmGoUp() {
  if (currentPath === '/') return;
  const parts = currentPath.replace(/\\/$/,'').split('/'); parts.pop();
  fmLoad(parts.join('/') || '/');
}
function fmRefresh() { fmLoad(currentPath); }
async function fmNewFolder() {
  const name = prompt('Ordnername:'); if (!name) return;
  const fp = (currentPath.replace(/\\/$/,'') + '/' + name).replace('//','/');\
  const d = await postJSON('/api/mkdir', { path: fp });
  if (d.ok) fmRefresh(); else alert('Fehler: ' + (d.error||'?'));
}
function renderBreadcrumb(p) {
  const el = document.getElementById('fm-breadcrumb');
  const parts = p.split('/').filter(Boolean);
  let html = '<span class="crumb" onclick="fmLoad(\\'/\\')">&#x1F3E0;</span>';
  let built = '';
  parts.forEach(part => { built += '/' + part; const c = built; html += ' <span style="color:var(--dim)">/</span> <span class="crumb" onclick="fmLoad(\\'' + c + '\\')">' + esc(part) + '</span>'; });
  el.innerHTML = html;
}
async function renderTree(cur) {
  const el = document.getElementById('tree-items');
  try {
    const d = await fetchJSON('/api/files?path=/');
    el.innerHTML = (d.entries||[]).filter(e=>e.isDir).map(e =>
      \`<div class="tree-item \${cur === '/'+e.name ? 'active' : ''}" onclick="fmLoad('/\${esc(e.name)}')">
        <span>\uD83D\uDCC2</span>\${esc(e.name)}
      </div>\`
    ).join('');
  } catch(_) {}
}
// Drag & Drop Upload
function fmDragOver(e) { e.preventDefault(); document.getElementById('fm-dropzone').classList.add('drag-over'); }
function fmDragLeave(e) { document.getElementById('fm-dropzone').classList.remove('drag-over'); }
function fmDrop(e) { e.preventDefault(); document.getElementById('fm-dropzone').classList.remove('drag-over'); if (e.dataTransfer.files.length) fmUploadFiles(e.dataTransfer.files); }
async function fmUploadFiles(files) {
  if (!files?.length) return;
  const queue = document.getElementById('upload-queue'); queue.classList.remove('hidden');
  for (const file of Array.from(files)) await fmUploadOne(file, queue);
  document.getElementById('fm-file-input').value = '';
  setTimeout(fmRefresh, 400);
}
function fmUploadOne(file, queue) {
  return new Promise(resolve => {
    const id = 'u' + Date.now() + Math.random().toString(36).slice(2);
    const item = document.createElement('div'); item.className = 'upload-item'; item.id = id;
    item.innerHTML = \`<div class="upload-item-header"><span class="upload-item-name">\${esc(file.name)}</span><span class="upload-item-status uploading" id="\${id}-s">0%</span></div><div class="upload-item-bar"><div class="upload-item-fill" id="\${id}-f" style="width:0%"></div></div>\`;
    queue.appendChild(item);
    const fp = (currentPath.replace(/\\/$/,'') + '/' + file.name).replace('//','/');\
    const fd = new FormData(); fd.append('path', fp); fd.append('file', file, file.name);
    const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round(e.loaded/e.total*100); document.getElementById(id+'-f').style.width=p+'%'; document.getElementById(id+'-s').textContent=p+'%'; }};
    xhr.onload = () => {
      let ok = false; try { ok = JSON.parse(xhr.responseText).ok; } catch(_) {}
      const f=document.getElementById(id+'-f'), s=document.getElementById(id+'-s');
      if (ok) { f.style.width='100%'; f.classList.add('done'); s.textContent='\u2714 Fertig'; s.className='upload-item-status done'; }
      else { f.classList.add('error'); s.textContent='\u2717 Fehler'; s.className='upload-item-status error'; }
      setTimeout(() => { item.remove(); if (!queue.children.length) queue.classList.add('hidden'); }, 3000);
      resolve();
    };
    xhr.onerror = () => resolve();
    xhr.send(fd);
  });
}

// ── Backup Manager ─────────────────────────────────────────────────────────
async function loadBackups() {
  try {
    const d = await fetchJSON('/api/backups');
    document.getElementById('bk-dir').textContent = d.backupDir || '/tmp/iobroker-backups';
    const el = document.getElementById('bk-list');
    if (!d.backups?.length) { el.innerHTML = '<div style="color:var(--dim);font-size:13px">Keine Backups vorhanden</div>'; return; }
    el.innerHTML = d.backups.map(b => \`<div class="backup-row">
      <div class="backup-name">\${esc(b.name)}</div>
      <div class="backup-size">\${esc(b.size)}</div>
      <div class="backup-date">\${fmtDate(b.mtime)}</div>
      <button class="btn btn-ghost btn-sm" onclick="downloadBackup('\${esc(b.name)}')">&#x21D3;</button>
      <button class="btn btn-red btn-sm" onclick="deleteBackup('\${esc(b.name)}')">&#x1F5D1;</button>
    </div>\`).join('');
  } catch(e) {}
}
async function createBackup() {
  const src = document.getElementById('bk-source').value.trim();
  const name = document.getElementById('bk-name').value.trim();
  if (!src) { alert('Quellpfad angeben!'); return; }
  const out = document.getElementById('bk-create-output');
  out.classList.remove('hidden'); out.textContent = 'Erstelle Backup...';
  try {
    const d = await postJSON('/api/backup', { source: src, name: name || undefined });
    out.textContent = d.ok ? '\u2714 Backup erstellt: ' + (d.filename||'') : '\u2717 Fehler: ' + (d.error||'?');
    if (d.ok) { loadBackups(); setTimeout(() => out.classList.add('hidden'), 5000); }
  } catch(e) { out.textContent = 'Fehler: ' + e.message; }
}
function downloadBackup(name) { window.open('/api/backup-download?name=' + encodeURIComponent(name)); }
async function deleteBackup(name) {
  if (!confirm('Backup ' + name + ' l\u00f6schen?')) return;
  try {
    const d = await postJSON('/api/backup-delete', { name });
    if (d.ok) loadBackups(); else alert('Fehler: ' + (d.error||'?'));
  } catch(e) { alert('Fehler: ' + e.message); }
}

// ── Bereinigung ────────────────────────────────────────────────────────────
let _customRules = JSON.parse(localStorage.getItem('ld_custom_rules') || '[]');

const CLEAN_DEFS = {
  apt:     { label: 'APT-Cache' },
  journal: { label: 'Journal' },
  oldlogs: { label: 'Alte Logs' },
  tmp:     { label: '/tmp' },
  npm:     { label: 'npm Cache' },
};

function cleanParams(type) {
  if (type === 'journal') return { maxSizeMB: document.getElementById('journal-maxsize').value, maxDays: document.getElementById('journal-maxdays').value };
  if (type === 'tmp')     return { days: document.getElementById('tmp-days').value };
  return {};
}

async function cleanPreview(type) {
  const previewEl = document.getElementById(type + '-preview');
  const sizeEl    = document.getElementById(type + '-size');
  previewEl.textContent = '\u23f3 Berechne...';
  previewEl.className = 'clean-preview';
  try {
    const d = await fetchJSON('/api/clean-preview?type=' + type + '&' + new URLSearchParams(cleanParams(type)));
    if (d.error) { previewEl.textContent = 'Fehler: ' + d.error; previewEl.className = 'clean-preview error'; return; }
    previewEl.textContent = d.preview || 'Nichts zu bereinigen';
    previewEl.className = 'clean-preview' + (d.bytes > 0 ? ' has-data' : '');
    if (sizeEl) { sizeEl.textContent = d.sizeHuman || ''; sizeEl.style.display = d.bytes > 0 ? '' : 'none'; }
  } catch(e) { previewEl.textContent = 'Fehler: ' + e.message; previewEl.className = 'clean-preview error'; }
}

async function cleanRun(type) {
  const previewEl = document.getElementById(type + '-preview');
  const resultEl  = document.getElementById(type + '-result');
  const label = type === 'custom' ? 'Benutzerdefinierte Regeln' : (CLEAN_DEFS[type]?.label || type);
  if (!confirm(label + ' jetzt bereinigen?')) return;
  resultEl.style.display = ''; resultEl.textContent = '\u23f3 L\u00e4uft...';
  previewEl.textContent = ''; previewEl.className = 'clean-preview';
  try {
    const params = cleanParams(type);
    if (type === 'custom') params.rules = JSON.stringify(_customRules);
    const d = await postJSON('/api/clean-run', { type, ...params });
    if (d.error) { resultEl.textContent = '\u2717 Fehler: ' + d.error; resultEl.style.color = 'var(--red)'; return; }
    resultEl.textContent = d.output || '\u2714 Fertig';
    resultEl.style.color = 'var(--green)';
    if (type !== 'custom') cleanPreview(type);
  } catch(e) { resultEl.textContent = 'Fehler: ' + e.message; resultEl.style.color = 'var(--red)'; }
}

function loadAllCleanPreviews() {
  Object.keys(CLEAN_DEFS).forEach(type => cleanPreview(type));
}

// Custom rules
function loadCustomRules() {
  _customRules = JSON.parse(localStorage.getItem('ld_custom_rules') || '[]');
  renderCustomRules();
}

function renderCustomRules() {
  const el = document.getElementById('custom-rules-list');
  if (!_customRules.length) { el.innerHTML = '<div style="color:var(--dim);font-size:12px;padding:4px 0">Noch keine Regeln definiert</div>'; return; }
  el.innerHTML = _customRules.map((r, i) =>
    '<div class="custom-rule-row">' +
    '<span style="font-family:var(--mono);font-size:12px;color:var(--text);flex:1">' + esc(r.path) + '</span>' +
    (r.days > 0 ? '<span style="font-size:11px;color:var(--muted);margin-right:8px">&auml;lter als ' + r.days + ' Tage</span>' : '') +
    '<button class="btn btn-ghost btn-sm" onclick="customRulePreview(' + i + ')">&#x1F50D;</button>' +
    '<button class="btn btn-red btn-sm" onclick="customRuleDelete(' + i + ')">&#x2715;</button>' +
    '</div>'
  ).join('');
}

function customRuleAdd() {
  const pathVal = document.getElementById('custom-path').value.trim();
  const days    = parseInt(document.getElementById('custom-days').value || '0', 10);
  if (!pathVal) { alert('Bitte einen Pfad eingeben'); return; }
  _customRules.push({ path: pathVal, days });
  localStorage.setItem('ld_custom_rules', JSON.stringify(_customRules));
  document.getElementById('custom-path').value = '';
  renderCustomRules();
}

function customRuleDelete(i) {
  _customRules.splice(i, 1);
  localStorage.setItem('ld_custom_rules', JSON.stringify(_customRules));
  renderCustomRules();
}

async function customRulePreview(i) {
  const rule = _customRules[i];
  const el   = document.getElementById('custom-preview');
  el.textContent = '\u23f3 Berechne ' + rule.path + '...';
  el.className = 'clean-preview';
  try {
    const d = await fetchJSON('/api/clean-preview?type=custom-single&path=' + encodeURIComponent(rule.path) + '&days=' + rule.days);
    el.textContent = d.preview || 'Nichts gefunden';
    el.className = 'clean-preview' + (d.bytes > 0 ? ' has-data' : '');
  } catch(e) { el.textContent = 'Fehler: ' + e.message; el.className = 'clean-preview error'; }
}


// ── Storage Analyzer ───────────────────────────────────────────────────────
let _saDirStack = [];

async function runStorageAnalysis() {
  const p      = (document.getElementById('sa-path').value || '/').trim();
  const limit  = parseInt(document.getElementById('sa-limit').value || '25', 10);
  const status = document.getElementById('sa-status');
  _saDirStack  = [p];
  document.getElementById('sa-up-btn').style.display = 'none';
  document.getElementById('sa-path-chip').style.display = 'none';
  status.textContent = 'L\u00e4uft \u2014 bitte warten...';
  status.style.color = 'var(--muted)';
  document.getElementById('sa-files-panel').innerHTML = '<div class="sa-spin">\u23f3 Suche gr\u00f6\u00dfte Dateien...</div>';
  document.getElementById('sa-dirs-panel').innerHTML  = '<div class="sa-spin">\u23f3 Berechne Ordnergr\u00f6\u00dfen...</div>';
  try {
    const d = await fetchJSON('/api/storage-analyze?path=' + encodeURIComponent(p) + '&limit=' + limit);
    if (d.error) {
      status.textContent = 'Fehler: ' + d.error; status.style.color = 'var(--red)';
      document.getElementById('sa-files-panel').innerHTML = '<div class="sa-placeholder" style="color:var(--red)">' + esc(d.error) + '</div>';
      document.getElementById('sa-dirs-panel').innerHTML  = '';
      return;
    }
    status.textContent = '\u2714 Fertig' + (d.duration ? ' \u2014 ' + d.duration + 's' : '');
    status.style.color = 'var(--green)';
    document.getElementById('sa-files-count').textContent = d.files.length ? '(' + d.files.length + ')' : '';
    renderSaFiles(d.files || []);
    renderSaDirs(d.dirs || [], p, false);
  } catch(e) {
    status.textContent = 'Fehler: ' + e.message; status.style.color = 'var(--red)';
    document.getElementById('sa-files-panel').innerHTML = '<div class="sa-placeholder" style="color:var(--red)">' + esc(e.message) + '</div>';
  }
}

function renderSaFiles(files) {
  const el = document.getElementById('sa-files-panel');
  if (!files.length) { el.innerHTML = '<div class="sa-placeholder">Keine Dateien gefunden</div>'; return; }
  const maxB = Math.max(...files.map(f => f.bytes), 1);
  let html = '<div class="sa-panel-hdr"><span>Datei</span><span>Gr\u00f6\u00dfe</span></div>';
  files.forEach(f => {
    const pct = Math.round(f.bytes / maxB * 100);
    const col = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--accent)';
    const dir = f.path.lastIndexOf('/') > 0 ? f.path.slice(0, f.path.lastIndexOf('/')) : '/';
    html += '<div class="sa-row sa-link" data-d="' + esc(dir) + '" onclick="saOpenDir(this.dataset.d)" title="\u00d6ffne Ordner: ' + esc(dir) + '">' +
      '<div><div class="sa-name sa-link" title="' + esc(f.path) + '">' + esc(f.path) + '</div>' +
      '<div class="sa-bar"><div class="sa-bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div></div>' +
      '<div class="sa-size-col" style="color:' + col + '">' + esc(f.size) + '</div></div>';
  });
  el.innerHTML = html;
}

function renderSaDirs(dirs, currentPath, isDrillDown) {
  const el    = document.getElementById('sa-dirs-panel');
  const chip  = document.getElementById('sa-path-chip');
  const upBtn = document.getElementById('sa-up-btn');
  document.getElementById('sa-dirs-count').textContent = dirs.length ? '(' + dirs.length + ')' : '';
  if (isDrillDown) {
    chip.textContent = currentPath; chip.style.display = 'inline-block';
    upBtn.style.display = '';
  }
  if (!dirs.length) { el.innerHTML = '<div class="sa-placeholder">Keine Unterordner gefunden</div>'; return; }
  const maxB = Math.max(...dirs.map(d => d.bytes), 1);
  let html = '<div class="sa-panel-hdr"><span>Ordner</span><span>Gr\u00f6\u00dfe</span></div>';
  dirs.forEach(d => {
    const pct = Math.round(d.bytes / maxB * 100);
    const col = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)';
    html += '<div class="sa-row" data-d="' + esc(d.path) + '" onclick="saDrillDown(this.dataset.d)" title="Reinbohren: ' + esc(d.path) + '">' +
      '<div><div class="sa-name sa-link">\uD83D\uDCC1 ' + esc(d.name) + '</div>' +
      '<div class="sa-bar"><div class="sa-bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div></div>' +
      '<div class="sa-size-col" style="color:' + col + '">' + esc(d.size) + '</div></div>';
  });
  el.innerHTML = html;
}

async function saDrillDown(dirPath) {
  _saDirStack.push(dirPath);
  const limit = parseInt(document.getElementById('sa-limit').value || '25', 10);
  document.getElementById('sa-dirs-panel').innerHTML = '<div class="sa-spin">\u23f3 Berechne...</div>';
  try {
    const d = await fetchJSON('/api/storage-analyze?path=' + encodeURIComponent(dirPath) + '&limit=' + limit + '&dirsonly=1');
    renderSaDirs(d.dirs || [], dirPath, true);
  } catch(e) {
    document.getElementById('sa-dirs-panel').innerHTML = '<div class="sa-placeholder" style="color:var(--red)">' + esc(e.message) + '</div>';
  }
}

async function saDirUp() {
  if (_saDirStack.length <= 1) return;
  _saDirStack.pop();
  const parent = _saDirStack[_saDirStack.length - 1];
  const isRoot = _saDirStack.length <= 1;
  const limit  = parseInt(document.getElementById('sa-limit').value || '25', 10);
  document.getElementById('sa-dirs-panel').innerHTML = '<div class="sa-spin">\u23f3 Berechne...</div>';
  try {
    const d = await fetchJSON('/api/storage-analyze?path=' + encodeURIComponent(parent) + '&limit=' + limit + '&dirsonly=1');
    renderSaDirs(d.dirs || [], parent, !isRoot);
    if (isRoot) {
      document.getElementById('sa-up-btn').style.display = 'none';
      document.getElementById('sa-path-chip').style.display = 'none';
    }
  } catch(e) {
    document.getElementById('sa-dirs-panel').innerHTML = '<div class="sa-placeholder" style="color:var(--red)">' + esc(e.message) + '</div>';
  }
}

function saOpenDir(dirPath) {
  showTab('nodes');
  setTimeout(() => fmLoad(dirPath || '/'), 150);
}


// ── Service Manager ────────────────────────────────────────────────────────
let _allServices = [];
async function loadServices() {
  const stateFilter = document.getElementById('svc-state-filter')?.value || 'running';
  const tbody = document.getElementById('svc-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:16px">Lade...</td></tr>';
  try {
    const d = await fetchJSON('/api/services?state=' + stateFilter);
    _allServices = d.services || [];
    renderServices(_allServices);
  } catch(e) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--red);padding:16px">Fehler: ' + esc(e.message) + '</td></tr>'; }
}
function filterServices(q) { renderServices(q ? _allServices.filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || (s.desc||'').toLowerCase().includes(q.toLowerCase())) : _allServices); }
function renderServices(svcs) {
  const tbody = document.getElementById('svc-tbody');
  if (!svcs.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--dim);padding:16px">Keine Services gefunden</td></tr>'; return; }
  tbody.innerHTML = svcs.map(s => {
    const cls = 'svc-status-' + (s.active||'').toLowerCase()  .replace(/\\s.*/,'');
    return \`<tr>
      <td style="font-family:var(--mono);color:var(--accent)">\${esc(s.name)}</td>
      <td><span class="\${cls}">\${esc(s.active||'-')}</span></td>
      <td style="color:var(--muted)">\${esc(s.sub||'-')}</td>
      <td style="color:var(--muted);font-size:12px">\${esc(s.desc||'')}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap">
        <button class="btn btn-green btn-sm" onclick="serviceAction('\${esc(s.name)}','start')">&#x25B6;</button>
        <button class="btn btn-yellow btn-sm" onclick="serviceAction('\${esc(s.name)}','restart')">&#x21BB;</button>
        <button class="btn btn-red btn-sm" onclick="serviceAction('\${esc(s.name)}','stop')">&#x25A0;</button>
        <button class="btn btn-ghost btn-sm" onclick="serviceAction('\${esc(s.name)}','status')">Info</button>
      </td>
    </tr>\`;
  }).join('');
}
async function serviceAction(name, action) {
  const out = document.getElementById('svc-output'); out.classList.remove('hidden');
  out.textContent = action + ' ' + name + ' ...';
  try {
    const d = await postJSON('/api/service', { name, action });
    out.textContent = (d.stdout||'') + (d.stderr ? '\\n[stderr]: ' + d.stderr : '') || '\u2714 Fertig';
    if (action !== 'status') setTimeout(loadServices, 1500);
  } catch(e) { out.textContent = 'Fehler: ' + e.message; }
}

// ── Package Manager ────────────────────────────────────────────────────────
async function searchPackages() {
  const q = document.getElementById('pkg-search').value.trim(); if (!q) return;
  const el = document.getElementById('pkg-results');
  el.innerHTML = '<div style="padding:16px;color:var(--muted)">Suche...</div>';
  try {
    const d = await fetchJSON('/api/packages?q=' + encodeURIComponent(q));
    if (!d.packages?.length) { el.innerHTML = '<div style="padding:16px;color:var(--dim)">Keine Ergebnisse</div>'; return; }
    el.innerHTML = d.packages.map(p => \`<div class="pkg-result">
      <span class="pkg-name">\${esc(p.name)}</span>
      \${p.installed ? '<span class="pkg-installed-badge">Installiert</span>' : ''}
      <span class="pkg-desc">\${esc(p.desc||'')}</span>
      <button class="btn \${p.installed ? 'btn-red' : 'btn-green'} btn-sm" onclick="aptAction('\${esc(p.name)}','\${p.installed ? 'remove' : 'install'}')">\${p.installed ? 'Entfernen' : 'Installieren'}</button>
    </div>\`).join('');
  } catch(e) { el.innerHTML = '<div style="padding:16px;color:var(--red)">Fehler: ' + esc(e.message) + '</div>'; }
}
async function loadInstalledPackages() {
  const el = document.getElementById('pkg-results');
  el.innerHTML = '<div style="padding:16px;color:var(--muted)">Lade installierte Pakete...</div>';
  try {
    const d = await fetchJSON('/api/packages?installed=1');
    el.innerHTML = (d.packages||[]).map(p => \`<div class="pkg-result">
      <span class="pkg-name">\${esc(p.name)}</span>
      <span class="pkg-installed-badge">Installiert</span>
      <span class="pkg-desc">\${esc(p.version||'')}</span>
      <button class="btn btn-red btn-sm" onclick="aptAction('\${esc(p.name)}','remove')">Entfernen</button>
    </div>\`).join('') || '<div style="padding:16px;color:var(--dim)">Keine Pakete gefunden</div>';
  } catch(e) { el.innerHTML = '<div style="padding:16px;color:var(--red)">Fehler: ' + esc(e.message) + '</div>'; }
}
async function aptAction(pkgName, action) {
  if (!confirm(action === 'install' ? pkgName + ' installieren?' : pkgName + ' entfernen?')) return;
  const out = document.getElementById('apt-output'); out.classList.remove('hidden');
  out.textContent = 'Starte apt ' + action + ' ' + pkgName + ' ...';
  try {
    const d = await postJSON('/api/apt', { package: pkgName, action });
    out.textContent = (d.stdout||'') + (d.stderr ? '\\n[stderr]: ' + d.stderr : '') || d.error || 'Fertig';
  } catch(e) { out.textContent = 'Fehler: ' + e.message; }
}
async function aptUpdate() {
  const out = document.getElementById('apt-output'); out.classList.remove('hidden');
  out.textContent = 'Starte apt update...';
  try {
    const d = await postJSON('/api/apt', { action: 'update' });
    out.textContent = (d.stdout||'') + (d.stderr ? '\\n[stderr]: ' + d.stderr : '') || d.error || 'Fertig';
  } catch(e) { out.textContent = 'Fehler: ' + e.message; }
}

// ── Cron Editor ────────────────────────────────────────────────────────────
let _cronRows = [];
async function loadCrontab() {
  try {
    const d = await fetchJSON('/api/crontab');
    _cronRows = d.jobs || [];
    renderCronTable();
  } catch(e) { document.getElementById('cron-output').textContent = 'Fehler: ' + e.message; document.getElementById('cron-output').classList.remove('hidden'); }
}
function renderCronTable() {
  const tbody = document.getElementById('cron-tbody'); tbody.innerHTML = '';
  _cronRows.forEach((row, i) => {
    if (row.comment) { tbody.innerHTML += \`<tr><td colspan="7" style="color:var(--dim);font-family:var(--mono);font-size:12px;padding:4px 8px">&#x23;\${esc(row.comment)}</td></tr>\`; return; }
    tbody.innerHTML += \`<tr id="cron-row-\${i}">
      <td><input class="cron-input" data-row="\${i}" data-col="m" value="\${esc(row.m||'*')}" style="width:60px"></td>
      <td><input class="cron-input" data-row="\${i}" data-col="h" value="\${esc(row.h||'*')}" style="width:60px"></td>
      <td><input class="cron-input" data-row="\${i}" data-col="dom" value="\${esc(row.dom||'*')}" style="width:60px"></td>
      <td><input class="cron-input" data-row="\${i}" data-col="mon" value="\${esc(row.mon||'*')}" style="width:60px"></td>
      <td><input class="cron-input" data-row="\${i}" data-col="dow" value="\${esc(row.dow||'*')}" style="width:60px"></td>
      <td><input class="cron-input" data-row="\${i}" data-col="cmd" value="\${esc(row.cmd||'')}" style="width:100%"></td>
      <td><button class="btn btn-red btn-sm" onclick="removeCronRow(\${i})">&#x2715;</button></td>
    </tr>\`;
  });
}
function addCronRow(m,h,dom,mon,dow,cmd) {
  _cronRows.push({ m:m||'*', h:h||'*', dom:dom||'*', mon:mon||'*', dow:dow||'*', cmd:cmd||'' });
  renderCronTable();
  // Scroll to bottom of table
  const tbody = document.getElementById('cron-tbody');
  const lastRow = tbody.lastElementChild;
  if (lastRow) lastRow.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function addCronPreset(schedule) {
  const parts = schedule.startsWith('@') ? [schedule,'','','',''] : schedule.split(' ');
  if (schedule.startsWith('@')) addCronRow(schedule,'','','','','echo "cron job"');
  else addCronRow(parts[0]||'*', parts[1]||'*', parts[2]||'*', parts[3]||'*', parts[4]||'*', 'echo "cron job"');
}
function removeCronRow(i) { _cronRows.splice(i,1); renderCronTable(); }
function collectCronFromDOM() {
  _cronRows = _cronRows.map((row, i) => {
    if (row.comment) return row;
    const get = (col) => { const el = document.querySelector(\`.cron-input[data-row="\${i}"][data-col="\${col}"]\`); return el ? el.value : row[col]; };
    return { m: get('m'), h: get('h'), dom: get('dom'), mon: get('mon'), dow: get('dow'), cmd: get('cmd') };
  });
}
async function saveCrontab() {
  collectCronFromDOM();
  const out = document.getElementById('cron-output'); out.classList.remove('hidden');
  out.textContent = 'Speichere crontab...';
  try {
    const d = await postJSON('/api/crontab', { jobs: _cronRows });
    out.textContent = d.ok ? '\u2714 crontab gespeichert' : '\u2717 Fehler: ' + (d.error||'?');
    setTimeout(() => out.classList.add('hidden'), 3000);
  } catch(e) { out.textContent = 'Fehler: ' + e.message; }
}

// ── Log Viewer ─────────────────────────────────────────────────────────────
let _rawLogs = [];
async function loadLogs() {
  const source = document.getElementById('log-source').value;
  const lines  = document.getElementById('log-lines').value || 200;
  const box = document.getElementById('log-box');
  box.innerHTML = '<span style="color:var(--muted)">Lade...</span>';
  try {
    const d = await fetchJSON(\`/api/logs?source=\${source}&lines=\${lines}\`);
    _rawLogs = d.lines || []; applyLogFilter();
    document.getElementById('log-info').textContent = \`\${_rawLogs.length} Zeilen (\${source})\`;
  } catch(e) { box.innerHTML = '<span style="color:var(--red)">Fehler: ' + esc(e.message) + '</span>'; }
}
function applyLogFilter() {
  const filterVal = document.getElementById('log-filter').value;
  const box = document.getElementById('log-box');
  let lines = _rawLogs;
  if (filterVal) { try { const rx = new RegExp(filterVal,'i'); lines = lines.filter(l => rx.test(l)); } catch(_) { lines = lines.filter(l => l.includes(filterVal)); } }
  box.innerHTML = lines.map(l => {
    let cls = 'INFO';
    if (/\bERR(OR)?\b|\bCRIT\b|\bFAIL/i.test(l)) cls = 'ERR';
    else if (/\bWARN(ING)?\b/i.test(l)) cls = 'WARN';
    else if (/\bDEBUG\b/i.test(l)) cls = 'DEBUG';
    else if (/\[SYSTEM\]/i.test(l)) cls = 'SYSTEM';
    return \`<div class="log-line \${cls}">\${esc(l)}</div>\`;
  }).join('');
  if (document.getElementById('log-autoscroll').checked) box.scrollTop = box.scrollHeight;
}
function exportLogs() {
  const blob = new Blob([_rawLogs.join('\\n')], {type:'text/plain'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'linuxdashboard-log-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.txt'; a.click();
}

// ── Terminal ───────────────────────────────────────────────────────────────
let _cmdHistory = [], _histIdx = -1;
function termKeydown(e) {
  if (e.key === 'Enter') termRun();
  if (e.key === 'ArrowUp') { if (_cmdHistory.length) { _histIdx = Math.min(_histIdx+1, _cmdHistory.length-1); document.getElementById('term-cmd').value = _cmdHistory[_histIdx]; } }
  if (e.key === 'ArrowDown') { _histIdx = Math.max(_histIdx-1,-1); document.getElementById('term-cmd').value = _histIdx < 0 ? '' : _cmdHistory[_histIdx]; }
}
async function termRun() {
  const input = document.getElementById('term-cmd'); const cmd = input.value.trim(); if (!cmd) return;
  _cmdHistory.unshift(cmd); _histIdx = -1; input.value = '';
  const out = document.getElementById('term-output');
  out.textContent += '\\n' + document.getElementById('term-prompt').textContent + ' ' + cmd + '\\n';
  out.scrollTop = out.scrollHeight;
  try {
    const d = await postJSON('/api/exec', { cmd });
    out.textContent += (d.stdout||'') + (d.stderr ? '[stderr]: ' + d.stderr : '') + '\\n';
  } catch(e) { out.textContent += 'Fehler: ' + e.message + '\\n'; }
  out.scrollTop = out.scrollHeight;
}
function runQuick(cmd) { showTab('system'); showSysSub('terminal'); document.getElementById('term-cmd').value = cmd; setTimeout(termRun, 150); }
function termClear() { document.getElementById('term-output').textContent = 'Linux Dashboard Terminal bereit.\\n'; }

// ── System Info ────────────────────────────────────────────────────────────
async function loadSysInfo() {
  try {
    const d = await fetchJSON('/api/metrics');
    const el = document.getElementById('sysinfo-detail');
    const items = [
      ['Hostname', d.hostname], ['Platform', d.platform + ' ' + d.arch],
      ['Kernel', d.release], ['Uptime', fmtUptime(d.uptime||0)],
      ['CPU Model', d.cpu?.model], ['CPU Kerne', d.cpu?.cores],
      ['RAM Gesamt', fmtBytes(d.memory?.total||0)], ['RAM Frei', fmtBytes(d.memory?.free||0)],
      ['Node.js', d.nodeVersion], ['PID', d.pid],
    ];
    el.innerHTML = items.map(([k,v]) => \`<div class="sysinfo-item"><div class="sysinfo-label">\${k}</div><div class="sysinfo-value">\${esc(String(v||'-'))}</div></div>\`).join('');
    document.getElementById('term-prompt').textContent = (d.hostname||'iobroker') + ':~$';
  } catch(_) {}
}

// ── Update ─────────────────────────────────────────────────────────────────
async function checkUpdate() {
  document.getElementById('update-info').textContent = 'Suche...';
  try {
    const d = await fetchJSON('/api/version');
    if (d.updateAvailable) {
      document.getElementById('update-info').innerHTML = '<span style="color:var(--green)">\u2714 Neue Version: v' + esc(d.latestVersion) + '</span>';
      document.getElementById('btn-update').classList.remove('hidden');
    } else {
      document.getElementById('update-info').innerHTML = '<span style="color:var(--muted)">Aktuell (' + esc(d.installedVersion) + ')</span>';
    }
  } catch(e) { document.getElementById('update-info').textContent = 'Fehler: ' + e.message; }
}
async function doUpdate() {
  if (!confirm('Update installieren und Adapter neu starten?')) return;
  const out = document.getElementById('update-output'); out.classList.remove('hidden'); out.textContent = 'Update l\u00e4uft...';
  try { const d = await postJSON('/api/update'); out.textContent = d.output || d.error || 'Fertig'; }
  catch(e) { out.textContent = 'Fehler: ' + e.message; }
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function fetchJSON(url) { const r = await fetch(url); return r.json(); }
async function postJSON(url, data) { const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data||{}) }); return r.json(); }
function fmtBytes(b) { if (!b) return '0 B'; const k=1024, s=['B','KB','MB','GB','TB'], i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(1)+' '+s[i]; }
function fmtUptime(s) { const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60); return [d&&d+'d',h&&h+'h',m+'m'].filter(Boolean).join(' ')||'<1m'; }
function fmtDate(ms) { if (!ms) return '-'; const d=new Date(ms); return d.toLocaleDateString('de-DE')+' '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function getFileIcon(name) {
  const ext = (name.split('.').pop()||'').toLowerCase();
  const m = {js:'\uD83D\uDFE1',ts:'\uD83D\uDD35',json:'\uD83D\uDCD8',md:'\uD83D\uDCDD',txt:'\uD83D\uDCC4',
    sh:'\uD83D\uDFE2',html:'\uD83C\uDF4A',css:'\uD83C\uDFA8',py:'\uD83D\uDC0D',log:'\uD83D\uDCCB',
    conf:'\u2699',cfg:'\u2699',zip:'\uD83D\uDCE6',tar:'\uD83D\uDCE6',gz:'\uD83D\uDCE6',
    png:'\uD83D\uDDBB',jpg:'\uD83D\uDDBB',svg:'\uD83D\uDDBB',pdf:'\uD83D\uDCD5',sql:'\uD83D\uDCBE'};
  return m[ext] || '\uD83D\uDCC4';
}

window.addEventListener('DOMContentLoaded', () => {
  showTab('daten');
  setInterval(() => { if (_activeTab === 'daten') loadMetrics(); }, 5000);
});
</script></body></html>`;
}

// ── Adapter Class ─────────────────────────────────────────────────────────────
class LinuxDashboard extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: 'linuxdashboard' });
        this._server   = null;
        this._wsServer = null;
        this._metrics  = {};
        this._logs     = [];
        this._timer    = null;
        this.on('ready',  this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        const port = parseInt(this.config.port || 8090, 10);
        this._addLog('SYSTEM', `Linux Dashboard v${ADAPTER_VERSION} gestartet | Port: ${port}`);
        await this.setStateAsync('info.connection', { val: true, ack: true });
        getCpuUsage(); // initial snapshot for CPU diff
        await this._collectMetrics();
        this._startServer(port);
        const iv = parseInt(this.config.metricsInterval || 5, 10) * 1000;
        this._timer = setInterval(async () => { await this._collectMetrics(); await this._publishStates(); }, iv);
    }

    onUnload(callback) {
        try { if (this._timer) clearInterval(this._timer); if (this._server) this._server.close(); callback(); }
        catch (e) { callback(); }
    }

    // ── HTTP Server ────────────────────────────────────────────────────────────
    _startServer(port) {
        this._server = http.createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
            this._route(req, res, url).catch(err => {
                this.log.error('HTTP: ' + err.message);
                res.writeHead(500).end(JSON.stringify({ error: err.message }));
            });
        });
        this._server.listen(port, () => { this.log.info(`[SYSTEM] Web-UI: http://IP:${port}/`); });
    }

    async _route(req, res, url) {
        const p   = url.pathname;
        const m   = req.method;
        const root = this.config.filemanagerRoot || '/';
        const backupDir = this.config.backupDir || '/tmp/iobroker-backups';

        if (p === '/' || p === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(buildHTML(this.config.port || 8090, ADAPTER_VERSION));
        }
        if (p === '/api/ping')    return this._json(res, { ok: true, adapter: 'linuxdashboard', version: ADAPTER_VERSION });
        if (p === '/api/metrics') { await this._collectMetrics(); return this._json(res, this._metrics); }

        // ── Files
        if (p === '/api/files' && m === 'GET') {
            const sp = this._safePath(url.searchParams.get('path') || '/', root);
            if (!sp) return this._json(res, { error: 'Zugriff verweigert' }, 403);
            return this._json(res, await this._listDir(sp));
        }
        if (p === '/api/file' && m === 'GET') {
            const sp = this._safePath(url.searchParams.get('path') || '', root);
            if (!sp) return this._json(res, { error: 'Zugriff verweigert' }, 403);
            return this._serveFile(res, sp, false);
        }
        if (p === '/api/download' && m === 'GET') {
            const sp = this._safePath(url.searchParams.get('path') || '', root);
            if (!sp) return this._json(res, { error: 'Zugriff verweigert' }, 403);
            return this._serveFile(res, sp, true);
        }
        if (p === '/api/mkdir' && m === 'POST') {
            const { path: rp } = JSON.parse(await this._readBody(req));
            const sp = this._safePath(rp, root);
            if (!sp) return this._json(res, { ok: false, error: 'Zugriff verweigert' }, 403);
            try { fs.mkdirSync(sp, { recursive: true }); this._addLog('INFO', `mkdir: ${sp}`); return this._json(res, { ok: true }); }
            catch (e) { return this._json(res, { ok: false, error: e.message }, 500); }
        }
        if (p === '/api/upload' && m === 'POST') return this._handleUpload(req, res);
        if (p === '/api/file-write' && m === 'POST') {
            const { path: rp, content } = JSON.parse(await this._readBody(req));
            const sp = this._safePath(rp, root);
            if (!sp) return this._json(res, { ok: false, error: 'Zugriff verweigert' }, 403);
            try {
                fs.mkdirSync(path.dirname(sp), { recursive: true });
                fs.writeFileSync(sp, content || '', 'utf8');
                this._addLog('INFO', `Datei gespeichert: ${sp}`);
                return this._json(res, { ok: true });
            } catch (e) { return this._json(res, { ok: false, error: e.message }, 500); }
        }

        // ── Disk Analyzer
        if (p === '/api/diskanalyzer' && m === 'GET') {
            const sp = this._safePath(url.searchParams.get('path') || '/', root);
            if (!sp) return this._json(res, { error: 'Zugriff verweigert' }, 403);
            return this._json(res, await this._getDiskAnalysis(sp));
        }

        // ── Logs
        if (p === '/api/logs' && m === 'GET') {
            const source = url.searchParams.get('source') || 'syslog';
            const lines  = parseInt(url.searchParams.get('lines') || '200', 10);
            return this._json(res, await this._getLogs(source, lines));
        }

        // ── Exec
        if (p === '/api/exec' && m === 'POST') {
            if (!this.config.allowCommandExecution) return this._json(res, { error: 'Deaktiviert' }, 403);
            const { cmd } = JSON.parse(await this._readBody(req));
            if (!cmd) return this._json(res, { error: 'Kein Befehl' }, 400);
            const wl = (this.config.commandWhitelist || '').split(',').map(s => s.trim()).filter(Boolean);
            if (wl.length > 0 && !wl.includes(cmd.trim().split(/\s+/)[0]))
                return this._json(res, { error: `Befehl nicht in Whitelist` }, 403);
            this._addLog('INFO', `exec: ${cmd}`);
            return new Promise(resolve => exec(cmd, { timeout: 30000, maxBuffer: 1024*1024 },
                (err, stdout, stderr) => resolve(this._json(res, { stdout: stdout||'', stderr: stderr||'', exitCode: err ? err.code : 0 }))));
        }

        // ── Kill Process
        if (p === '/api/kill' && m === 'POST') {
            const { pid, signal } = JSON.parse(await this._readBody(req));
            if (!pid) return this._json(res, { ok: false, error: 'Keine PID' }, 400);
            const sig = parseInt(signal || 15, 10);
            this._addLog('INFO', `kill -${sig} ${pid}`);
            return new Promise(resolve => exec(`kill -${sig} ${parseInt(pid, 10)}`, { timeout: 5000 },
                (err, stdout, stderr) => resolve(this._json(res, { ok: !err, stdout: stdout||'', stderr: stderr||'', error: err ? err.message : null }))));
        }

        // ── Service Manager
        if (p === '/api/services' && m === 'GET') return this._json(res, await this._getServices(url.searchParams.get('state') || 'running'));
        if (p === '/api/service'  && m === 'POST') {
            const { name, action } = JSON.parse(await this._readBody(req));
            return this._json(res, await this._serviceAction(name, action));
        }

        // ── Package Manager
        if (p === '/api/packages' && m === 'GET') {
            if (url.searchParams.get('installed')) return this._json(res, await this._listInstalledPackages());
            return this._json(res, await this._searchPackages(url.searchParams.get('q') || ''));
        }
        if (p === '/api/apt' && m === 'POST') {
            const { package: pkg, action } = JSON.parse(await this._readBody(req));
            return this._json(res, await this._aptAction(pkg, action));
        }

        // ── Cron Editor
        if (p === '/api/crontab' && m === 'GET') return this._json(res, await this._getCrontab());
        if (p === '/api/crontab' && m === 'POST') {
            const { jobs } = JSON.parse(await this._readBody(req));
            return this._json(res, await this._setCrontab(jobs || []));
        }

        // ── Backup Manager
        if (p === '/api/backups' && m === 'GET') return this._json(res, await this._listBackups(backupDir));
        if (p === '/api/backup'  && m === 'POST') {
            const { source, name } = JSON.parse(await this._readBody(req));
            return this._json(res, await this._createBackup(source, name, backupDir));
        }
        if (p === '/api/backup-download' && m === 'GET') {
            const name = url.searchParams.get('name') || '';
            if (!name || name.includes('/') || name.includes('..')) return this._json(res, { error: 'Ungültig' }, 400);
            const fp = path.join(backupDir, name);
            return this._serveFile(res, fp, true);
        }
        if (p === '/api/backup-delete' && m === 'POST') {
            const { name } = JSON.parse(await this._readBody(req));
            if (!name || name.includes('/') || name.includes('..')) return this._json(res, { ok: false, error: 'Ungültig' }, 400);
            const fp = path.join(backupDir, name);
            try { fs.unlinkSync(fp); this._addLog('INFO', `Backup gelöscht: ${fp}`); return this._json(res, { ok: true }); }
            catch (e) { return this._json(res, { ok: false, error: e.message }); }
        }

        // ── Bereinigung
        if (p === '/api/clean-preview' && m === 'GET') return this._json(res, await this._cleanPreview(url.searchParams));
        if (p === '/api/clean-run'     && m === 'POST') {
            const body = JSON.parse(await this._readBody(req));
            return this._json(res, await this._cleanRun(body));
        }

        // ── Storage Analyzer
        if (p === '/api/storage-analyze' && m === 'GET') {
            const sp      = this._safePath(url.searchParams.get('path') || '/', root);
            if (!sp) return this._json(res, { error: 'Zugriff verweigert' }, 403);
            const limit   = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 200);
            const dirOnly = url.searchParams.get('dirsonly') === '1';
            return this._json(res, await this._storageAnalyze(sp, limit, dirOnly));
        }

        // ── Version / Update
        if (p === '/api/version') return this._checkVersion(res);
        if (p === '/api/update' && m === 'POST') return this._doUpdate(res);

        res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
    }

    // ── Disk Analysis ──────────────────────────────────────────────────────────
    _getDiskAnalysis(dirPath) {
        return new Promise(resolve => {
            exec(`du -sh --max-depth=1 "${dirPath}" 2>/dev/null | sort -rh`, { timeout: 30000, maxBuffer: 1024*512 }, (err, stdout) => {
                if (err || !stdout) { resolve({ path: dirPath, entries: [], error: err ? err.message : 'Keine Daten' }); return; }
                const entries = [];
                stdout.trim().split('\n').forEach(line => {
                    const parts = line.split('\t');
                    if (parts.length < 2) return;
                    const size = parts[0].trim();
                    const entryPath = parts[1].trim();
                    if (entryPath === dirPath) return; // skip total line
                    // Convert size string to approximate bytes for bar width
                    const bytes = this._parseHumanSize(size);
                    entries.push({ size, path: entryPath, name: path.basename(entryPath) || entryPath, bytes });
                });
                resolve({ path: dirPath, entries });
            });
        });
    }

    _parseHumanSize(s) {
        const m = s.match(/([\d.]+)([KMGTP]?)/i);
        if (!m) return 0;
        const n = parseFloat(m[1]);
        const u = m[2].toUpperCase();
        const mult = { K: 1024, M: 1024**2, G: 1024**3, T: 1024**4, P: 1024**5 };
        return n * (mult[u] || 1);
    }

    // ── Service Manager ────────────────────────────────────────────────────────
    _getServices(stateFilter) {
        return new Promise(resolve => {
            let filter = '';
            if (stateFilter === 'running') filter = '--state=running';
            else if (stateFilter === 'failed') filter = '--state=failed';
            const cmd = `systemctl list-units --type=service ${filter} --no-pager --no-legend --plain 2>/dev/null`;
            exec(cmd, { timeout: 10000, maxBuffer: 512*1024 }, (err, stdout) => {
                if (err || !stdout) { resolve({ services: [] }); return; }
                const services = [];
                stdout.trim().split('\n').forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length < 4) return;
                    services.push({
                        name:   parts[0].replace('.service', ''),
                        load:   parts[1] || '-',
                        active: parts[2] || '-',
                        sub:    parts[3] || '-',
                        desc:   parts.slice(4).join(' '),
                    });
                });
                resolve({ services });
            });
        });
    }

    _serviceAction(name, action) {
        return new Promise(resolve => {
            if (!['start','stop','restart','status','enable','disable'].includes(action))
                return resolve({ ok: false, error: 'Ungültige Aktion' });
            // Sanitize service name
            const safe = name.replace(/[^a-zA-Z0-9.\-_@]/g, '');
            const cmd = `systemctl ${action} ${safe}.service 2>&1 || true`;
            this._addLog('INFO', `service ${action} ${safe}`);
            exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
                resolve({ ok: true, stdout: stdout||'', stderr: stderr||'' });
            });
        });
    }

    // ── Package Manager ────────────────────────────────────────────────────────
    _searchPackages(query) {
        return new Promise(resolve => {
            if (!query) { resolve({ packages: [] }); return; }
            const safe = query.replace(/[^a-zA-Z0-9.\-_+]/g, '');
            const cmd = `apt-cache search "${safe}" 2>/dev/null | head -30`;
            exec(cmd, { timeout: 10000 }, (err, stdout) => {
                if (err || !stdout) { resolve({ packages: [] }); return; }
                // Get installed packages to mark them
                exec('apt list --installed 2>/dev/null', { timeout: 10000, maxBuffer: 512*1024 }, (err2, installed) => {
                    const installedSet = new Set((installed||'').split('\n').map(l => l.split('/')[0]));
                    const packages = stdout.trim().split('\n').map(line => {
                        const idx = line.indexOf(' - ');
                        const name = line.substring(0, idx > 0 ? idx : 50).trim();
                        const desc = idx > 0 ? line.substring(idx + 3).trim() : '';
                        return { name, desc, installed: installedSet.has(name) };
                    }).filter(p => p.name);
                    resolve({ packages });
                });
            });
        });
    }

    _listInstalledPackages() {
        return new Promise(resolve => {
            exec('apt list --installed 2>/dev/null | head -100', { timeout: 10000, maxBuffer: 512*1024 }, (err, stdout) => {
                if (err || !stdout) { resolve({ packages: [] }); return; }
                const packages = stdout.trim().split('\n').slice(1).map(line => {
                    const parts = line.split(/[\s/]/);
                    return { name: parts[0], version: parts[2] || '-', installed: true };
                }).filter(p => p.name && p.name !== 'Listing...');
                resolve({ packages });
            });
        });
    }

    _aptAction(pkg, action) {
        return new Promise(resolve => {
            let cmd = '';
            if (action === 'update') {
                cmd = 'apt-get update 2>&1';
            } else if (action === 'install' && pkg) {
                const safe = pkg.replace(/[^a-zA-Z0-9.\-_+]/g, '');
                cmd = `DEBIAN_FRONTEND=noninteractive apt-get install -y "${safe}" 2>&1`;
            } else if (action === 'remove' && pkg) {
                const safe = pkg.replace(/[^a-zA-Z0-9.\-_+]/g, '');
                cmd = `DEBIAN_FRONTEND=noninteractive apt-get remove -y "${safe}" 2>&1`;
            } else {
                return resolve({ ok: false, error: 'Ungültige Aktion' });
            }
            this._addLog('INFO', `apt ${action} ${pkg || ''}`);
            exec(cmd, { timeout: 120000, maxBuffer: 2*1024*1024 }, (err, stdout, stderr) => {
                resolve({ ok: !err, stdout: stdout||'', stderr: stderr||'', error: err ? err.message : null });
            });
        });
    }

    // ── Cron Editor ────────────────────────────────────────────────────────────
    _getCrontab() {
        return new Promise(resolve => {
            exec('crontab -l 2>/dev/null', { timeout: 5000 }, (err, stdout) => {
                const jobs = [];
                (stdout || '').split('\n').forEach(line => {
                    const t = line.trim();
                    if (!t) return;
                    if (t.startsWith('#')) { jobs.push({ comment: t.slice(1).trim() }); return; }
                    if (t.startsWith('@')) {
                        jobs.push({ m: t.split(' ')[0], h: '', dom: '', mon: '', dow: '', cmd: t.split(' ').slice(1).join(' ') });
                        return;
                    }
                    const parts = t.split(/\s+/);
                    if (parts.length >= 6) {
                        jobs.push({ m: parts[0], h: parts[1], dom: parts[2], mon: parts[3], dow: parts[4], cmd: parts.slice(5).join(' ') });
                    }
                });
                resolve({ jobs });
            });
        });
    }

    _setCrontab(jobs) {
        return new Promise(resolve => {
            const lines = jobs.map(j => {
                if (j.comment !== undefined) return `# ${j.comment}`;
                if ((j.m || '').startsWith('@')) return `${j.m} ${j.cmd}`;
                if (!j.cmd) return null;
                return `${j.m||'*'} ${j.h||'*'} ${j.dom||'*'} ${j.mon||'*'} ${j.dow||'*'} ${j.cmd}`;
            }).filter(Boolean).join('\n') + '\n';
            const tmpFile = `/tmp/crontab-linuxdashboard-${Date.now()}.tmp`;
            try {
                fs.writeFileSync(tmpFile, lines, 'utf8');
                exec(`crontab ${tmpFile}`, { timeout: 10000 }, (err) => {
                    try { fs.unlinkSync(tmpFile); } catch (_) {}
                    if (err) { resolve({ ok: false, error: err.message }); }
                    else { this._addLog('INFO', 'crontab aktualisiert'); resolve({ ok: true }); }
                });
            } catch (e) {
                resolve({ ok: false, error: e.message });
            }
        });
    }

    // ── Backup Manager ─────────────────────────────────────────────────────────
    _listBackups(backupDir) {
        return new Promise(resolve => {
            try {
                fs.mkdirSync(backupDir, { recursive: true });
                const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.tar.gz'));
                const backups = files.map(name => {
                    try {
                        const stat = fs.statSync(path.join(backupDir, name));
                        return { name, size: this._fmtBytes(stat.size), mtime: stat.mtimeMs };
                    } catch (_) { return { name, size: '?', mtime: 0 }; }
                }).sort((a, b) => b.mtime - a.mtime);
                resolve({ backups, backupDir });
            } catch (e) {
                resolve({ backups: [], backupDir, error: e.message });
            }
        });
    }

    _createBackup(source, name, backupDir) {
        return new Promise(resolve => {
            if (!source) { resolve({ ok: false, error: 'Kein Quellpfad' }); return; }
            try { fs.mkdirSync(backupDir, { recursive: true }); } catch (_) {}
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const safeName = (name || path.basename(source) || 'backup').replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `${safeName}_${ts}.tar.gz`;
            const dest     = path.join(backupDir, filename);
            const cmd = `tar -czf "${dest}" "${source}" 2>&1`;
            this._addLog('INFO', `Backup erstellt: ${dest} von ${source}`);
            exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
                if (err) { resolve({ ok: false, error: err.message, stderr }); }
                else {
                    let size = '?';
                    try { size = this._fmtBytes(fs.statSync(dest).size); } catch (_) {}
                    resolve({ ok: true, filename, dest, size, stdout: stdout||'' });
                }
            });
        });
    }

    // ── Metrics ────────────────────────────────────────────────────────────────
    async _collectMetrics() {
        const cpus = os.cpus();
        const totalMem = os.totalmem(), freeMem = os.freemem();
        const diskData = await this._getDiskUsage();
        const netIfs   = os.networkInterfaces();
        const network  = Object.entries(netIfs)
            .filter(([n]) => !n.startsWith('lo'))
            .map(([name, addrs]) => {
                const v4 = (addrs||[]).find(a => a.family === 'IPv4');
                return { name, address: v4 ? v4.address : '-', rx: 0, tx: 0 };
            });
        const netStats = this._readNetStats();
        network.forEach(iface => { const s = netStats[iface.name]; if (s) { iface.rx = s.rx; iface.tx = s.tx; } });
        const processes = await this._getProcesses();
        const swapInfo  = this._readSwap();
        this._metrics = {
            hostname: os.hostname(), platform: os.platform(), arch: os.arch(),
            release: os.release(), uptime: Math.round(os.uptime()),
            nodeVersion: process.version, pid: process.pid,
            adapterName: `linuxdashboard.${this.instance}`,
            cpu: { usagePercent: getCpuUsage(), model: cpus.length ? cpus[0].model : 'unknown', cores: cpus.length, loadAvg: os.loadavg() },
            loadAvg: os.loadavg(),
            memory: { total: totalMem, free: freeMem, used: totalMem - freeMem, usedPercent: Math.round((totalMem - freeMem) / totalMem * 100) },
            swap: swapInfo, disks: diskData, network, processes,
        };
    }

    _readSwap() {
        try {
            const c = fs.readFileSync('/proc/meminfo', 'utf8');
            const total = parseInt((c.match(/SwapTotal:\s+(\d+)/) || [0,0])[1]) * 1024;
            const free  = parseInt((c.match(/SwapFree:\s+(\d+)/)  || [0,0])[1]) * 1024;
            return { total, free, used: total - free };
        } catch (_) { return { total: 0, free: 0, used: 0 }; }
    }

    _readNetStats() {
        try {
            const c = fs.readFileSync('/proc/net/dev', 'utf8');
            const r = {};
            c.split('\n').slice(2).forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 10) return;
                r[parts[0].replace(':', '')] = { rx: parseInt(parts[1])||0, tx: parseInt(parts[9])||0 };
            });
            return r;
        } catch (_) { return {}; }
    }

    _getDiskUsage() {
        return new Promise(resolve => {
            exec("df -B1 --output=source,target,size,used,avail,pcent 2>/dev/null | grep -v tmpfs | grep -v devtmpfs | tail -n +2",
                { timeout: 5000 }, (err, stdout) => {
                    if (!stdout) { resolve([]); return; }
                    const disks = [];
                    stdout.trim().split('\n').forEach(line => {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 6)
                            disks.push({ source: parts[0], mount: parts[1], size: parseInt(parts[2])||0, used: parseInt(parts[3])||0, avail: parseInt(parts[4])||0, usedPercent: parseInt(parts[5])||0 });
                    });
                    resolve(disks);
                });
        });
    }

    _getProcesses() {
        return new Promise(resolve => {
            exec("ps aux --no-headers --sort=-%cpu 2>/dev/null | head -25", { timeout: 5000 }, (err, stdout) => {
                if (!stdout) { resolve([]); return; }
                const procs = [];
                stdout.trim().split('\n').forEach(line => {
                    const p = line.trim().split(/\s+/);
                    if (p.length < 11) return;
                    procs.push({ user: p[0], pid: p[1], cpu: parseFloat(p[2]).toFixed(1), mem: parseFloat(p[3]).toFixed(1), status: p[7]||'S', time: p[9]||'-', name: p.slice(10).join(' ').substring(0,50) });
                });
                resolve(procs);
            });
        });
    }

    // ── Logs ──────────────────────────────────────────────────────────────────
    async _getLogs(source, maxLines) {
        return new Promise(resolve => {
            let cmd = '';
            if (source === 'iobroker') cmd = `journalctl -u iobroker -n ${maxLines} --no-pager --output=short-iso 2>/dev/null || grep -i iobroker /var/log/syslog 2>/dev/null | tail -${maxLines}`;
            else if (source === 'kern') cmd = `journalctl -k -n ${maxLines} --no-pager 2>/dev/null || dmesg | tail -${maxLines}`;
            else if (source === 'auth') cmd = `journalctl -t sudo -t sshd -n ${maxLines} --no-pager 2>/dev/null || tail -${maxLines} /var/log/auth.log 2>/dev/null`;
            else if (source === 'daemon') cmd = `journalctl -t systemd -n ${maxLines} --no-pager 2>/dev/null`;
            else cmd = `journalctl -n ${maxLines} --no-pager --output=short-iso 2>/dev/null || tail -${maxLines} /var/log/syslog 2>/dev/null`;
            exec(cmd, { timeout: 10000, maxBuffer: 2*1024*1024 }, (err, stdout) => {
                const lines = (stdout || '').trim().split('\n').filter(Boolean);
                const adapterLogs = this._logs.slice(-50).map(l => `[${l.ts}] [${l.level}] ${l.msg}`);
                resolve({ lines: [...lines, ...adapterLogs], source });
            });
        });
    }

    // ── Upload (multipart) ─────────────────────────────────────────────────────
    _handleUpload(req, res) {
        return new Promise(resolve => {
            const ct = req.headers['content-type'] || '';
            const bm = ct.match(/boundary=([^\s;]+)/);
            if (!bm) { resolve(this._json(res, { ok: false, error: 'Kein boundary' }, 400)); return; }
            const boundary = Buffer.from('--' + bm[1]);
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                try {
                    const body   = Buffer.concat(chunks);
                    const parsed = this._parseMultipart(body, boundary);
                    const pathField = parsed.find(p => p.name === 'path');
                    const fileField = parsed.find(p => p.filename);
                    if (!pathField || !fileField) { resolve(this._json(res, { ok: false, error: 'Fehlende Felder' }, 400)); return; }
                    const destPath = pathField.data.toString('utf8').trim();
                    const root     = this.config.filemanagerRoot || '/';
                    const safeDest = this._safePath(destPath, root);
                    if (!safeDest) { resolve(this._json(res, { ok: false, error: 'Zugriff verweigert' }, 403)); return; }
                    fs.mkdirSync(path.dirname(safeDest), { recursive: true });
                    fs.writeFileSync(safeDest, fileField.data);
                    this._addLog('INFO', `Upload: ${safeDest} (${this._fmtBytes(fileField.data.length)})`);
                    resolve(this._json(res, { ok: true, path: safeDest, size: fileField.data.length }));
                } catch (e) { resolve(this._json(res, { ok: false, error: e.message }, 500)); }
            });
            req.on('error', e => resolve(this._json(res, { ok: false, error: e.message }, 500)));
        });
    }

    _parseMultipart(body, boundary) {
        const results = [];
        let pos = this._bufIdxOf(body, boundary, 0);
        if (pos === -1) return results;
        pos += boundary.length;
        while (pos < body.length) {
            if (body[pos] === 0x0D && body[pos+1] === 0x0A) pos += 2;
            else if (body[pos] === 0x0A) pos += 1;
            if (body.slice(pos, pos+2).toString() === '--') break;
            const headerEnd = this._bufIdxOf(body, Buffer.from('\r\n\r\n'), pos);
            if (headerEnd === -1) break;
            const headerStr = body.slice(pos, headerEnd).toString('utf8');
            const dataStart = headerEnd + 4;
            const nextBound = this._bufIdxOf(body, boundary, dataStart);
            if (nextBound === -1) break;
            let dataEnd = nextBound;
            if (dataEnd >= 2 && body[dataEnd-2] === 0x0D && body[dataEnd-1] === 0x0A) dataEnd -= 2;
            else if (dataEnd >= 1 && body[dataEnd-1] === 0x0A) dataEnd -= 1;
            const dispMatch = headerStr.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
            const fnMatch   = headerStr.match(/filename="([^"]*)"/i);
            results.push({ name: dispMatch ? dispMatch[1] : '', filename: fnMatch ? fnMatch[1] : undefined, data: body.slice(dataStart, dataEnd) });
            pos = nextBound + boundary.length;
        }
        return results;
    }

    _bufIdxOf(buf, search, start = 0) {
        for (let i = start; i <= buf.length - search.length; i++) {
            let found = true;
            for (let j = 0; j < search.length; j++) { if (buf[i+j] !== search[j]) { found = false; break; } }
            if (found) return i;
        }
        return -1;
    }

    // ── Bereinigung ──────────────────────────────────────────────────────────
    async _cleanPreview(params) {
        const type = params.get('type') || '';
        try {
            if (type === 'apt') {
                const size = await this._cmdOut("du -sh /var/cache/apt/archives/ 2>/dev/null | cut -f1");
                const bytes = await this._cmdOut("du -sb /var/cache/apt/archives/ 2>/dev/null | cut -f1");
                const list  = await this._cmdOut("ls /var/cache/apt/archives/*.deb 2>/dev/null | head -20 || echo '(keine .deb Dateien)'");
                return { preview: `Gr\u00f6\u00dfe: ${size.trim()}\n\n${list.trim()}`, bytes: parseInt(bytes) || 0, sizeHuman: size.trim() };
            }
            if (type === 'journal') {
                const cur  = await this._cmdOut("journalctl --disk-usage 2>/dev/null || echo 'N/A'");
                const files = await this._cmdOut("find /var/log/journal -type f 2>/dev/null | wc -l");
                const bytes = await this._cmdOut("du -sb /var/log/journal 2>/dev/null | cut -f1 || echo 0");
                return { preview: cur.trim() + `\n${files.trim()} Journal-Dateien`, bytes: parseInt(bytes) || 0, sizeHuman: (await this._cmdOut("du -sh /var/log/journal 2>/dev/null | cut -f1")).trim() };
            }
            if (type === 'oldlogs') {
                const list  = await this._cmdOut("find /var/log -type f \\( -name '*.gz' -o -name '*.1' -o -name '*.2' -o -name '*.3' -o -name '*.4' \\) 2>/dev/null | head -30");
                const bytes = await this._cmdOut("find /var/log -type f \\( -name '*.gz' -o -name '*.1' -o -name '*.2' -o -name '*.3' -o -name '*.4' \\) -printf '%s\\n' 2>/dev/null | awk '{s+=$1}END{print s+0}'");
                const count = await this._cmdOut("find /var/log -type f \\( -name '*.gz' -o -name '*.1' -o -name '*.2' -o -name '*.3' -o -name '*.4' \\) 2>/dev/null | wc -l");
                return { preview: `${count.trim()} Dateien:\n${list.trim() || '(keine gefunden)'}`, bytes: parseInt(bytes) || 0, sizeHuman: this._fmtBytes(parseInt(bytes) || 0) };
            }
            if (type === 'tmp') {
                const days  = parseInt(params.get('days') || '7', 10);
                const mtime = days > 0 ? `-mtime +${days}` : '';
                const list  = await this._cmdOut(`find /tmp /var/tmp -type f ${mtime} 2>/dev/null | head -30`);
                const bytes = await this._cmdOut(`find /tmp /var/tmp -type f ${mtime} -printf '%s\\n' 2>/dev/null | awk '{s+=$1}END{print s+0}'`);
                const count = await this._cmdOut(`find /tmp /var/tmp -type f ${mtime} 2>/dev/null | wc -l`);
                return { preview: `${count.trim()} Dateien${days > 0 ? ' \u00e4lter als ' + days + ' Tage' : ''}:\n${list.trim() || '(keine)'}`, bytes: parseInt(bytes) || 0, sizeHuman: this._fmtBytes(parseInt(bytes) || 0) };
            }
            if (type === 'npm') {
                const dir   = await this._cmdOut("npm config get cache 2>/dev/null || echo ~/.npm");
                const bytes = await this._cmdOut(`du -sb ${dir.trim()} 2>/dev/null | cut -f1 || echo 0`);
                return { preview: `npm Cache: ${dir.trim()}\nGr\u00f6\u00dfe: ${this._fmtBytes(parseInt(bytes) || 0)}`, bytes: parseInt(bytes) || 0, sizeHuman: this._fmtBytes(parseInt(bytes) || 0) };
            }
            if (type === 'custom-single') {
                const p    = params.get('path') || '';
                const days = parseInt(params.get('days') || '0', 10);
                if (!p) return { preview: 'Kein Pfad angegeben', bytes: 0 };
                const mtime = days > 0 ? `-mtime +${days}` : '';
                const list  = await this._cmdOut(`find ${p} -type f ${mtime} 2>/dev/null | head -20 || ls -lh ${p} 2>/dev/null | head -20`);
                const bytes = await this._cmdOut(`find ${p} -type f ${mtime} -printf '%s\\n' 2>/dev/null | awk '{s+=$1}END{print s+0}'`);
                return { preview: list.trim() || '(nichts gefunden)', bytes: parseInt(bytes) || 0, sizeHuman: this._fmtBytes(parseInt(bytes) || 0) };
            }
            return { error: 'Unbekannter Typ: ' + type };
        } catch (e) { return { error: e.message }; }
    }

    async _cleanRun(params) {
        const { type } = params;
        try {
            let cmd = '';
            if (type === 'apt') {
                cmd = 'apt-get clean 2>&1 && apt-get autoremove -y 2>&1 && echo "\u2714 APT-Cache geleert"';
            } else if (type === 'journal') {
                const mb   = parseInt(params.maxSizeMB || '500', 10);
                const days = parseInt(params.maxDays   || '30',  10);
                cmd = `journalctl --vacuum-size=${mb}M 2>&1 && journalctl --vacuum-time=${days}d 2>&1`;
            } else if (type === 'oldlogs') {
                cmd = "find /var/log -type f \\( -name '*.gz' -o -name '*.1' -o -name '*.2' -o -name '*.3' -o -name '*.4' \\) -delete 2>&1 && echo '\u2714 Alte Log-Dateien gel\u00f6scht'";
            } else if (type === 'tmp') {
                const days  = parseInt(params.days || '7', 10);
                const mtime = days > 0 ? `-mtime +${days}` : '';
                cmd = `find /tmp /var/tmp -type f ${mtime} -delete 2>&1 && echo '\u2714 /tmp bereinigt'`;
            } else if (type === 'npm') {
                cmd = 'npm cache clean --force 2>&1 && echo "\u2714 npm Cache geleert"';
            } else if (type === 'custom') {
                const rules = JSON.parse(params.rules || '[]');
                if (!rules.length) return { output: 'Keine Regeln definiert' };
                const cmds = rules.map(r => {
                    const mtime = r.days > 0 ? `-mtime +${r.days}` : '';
                    return `echo "--- ${r.path} ---" && find ${r.path} -type f ${mtime} -delete 2>&1 || rm -f ${r.path} 2>&1`;
                });
                cmd = cmds.join(' && ');
            } else {
                return { error: 'Unbekannter Typ' };
            }
            this._addLog('INFO', `Bereinigung: ${type}`);
            const result = await this._cmdOut(cmd, 60000);
            return { ok: true, output: result.trim() || '\u2714 Fertig (keine Ausgabe)' };
        } catch (e) { return { error: e.message }; }
    }

    _cmdOut(cmd, timeout = 15000) {
        return new Promise((resolve, reject) => {
            exec(cmd, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                resolve((stdout || '') + (stderr || ''));
            });
        });
    }

    // ── Storage Analyzer ──────────────────────────────────────────────────────
    _storageAnalyze(dirPath, limit, dirsOnly) {
        const t0      = Date.now();
        const safePath = dirPath.replace(/"/g, '');   // strip any quotes for safety

        const findFiles = dirsOnly ? Promise.resolve([]) : new Promise(resolve => {
            // find largest files, staying on same filesystem (-xdev)
            const cmd = `find "${safePath}" -xdev -type f -printf '%s\t%p\n' 2>/dev/null | sort -rn | head -${limit}`;
            exec(cmd, { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
                if (!stdout) { resolve([]); return; }
                const files = [];
                stdout.trim().split('\n').forEach(line => {
                    const tab = line.indexOf('\t');
                    if (tab < 0) return;
                    const bytes = parseInt(line.slice(0, tab)) || 0;
                    const fp    = line.slice(tab + 1).trim();
                    if (!fp) return;
                    files.push({ path: fp, name: path.basename(fp), bytes, size: this._fmtBytes(bytes) });
                });
                resolve(files);
            });
        });

        const findDirs = new Promise(resolve => {
            // du: disk usage of direct subdirs, same filesystem
            const cmd = `du -x --max-depth=1 "${safePath}" 2>/dev/null | sort -rn | head -${limit + 1}`;
            exec(cmd, { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
                if (!stdout) { resolve([]); return; }
                const dirs = [];
                stdout.trim().split('\n').forEach(line => {
                    const tab = line.indexOf('\t');
                    if (tab < 0) return;
                    const kb  = parseInt(line.slice(0, tab)) || 0;
                    const dp  = line.slice(tab + 1).trim();
                    // skip the total line (the dirPath itself)
                    if (!dp || dp === safePath || dp === '.' || path.resolve(dp) === path.resolve(safePath)) return;
                    const bytes = kb * 1024;
                    dirs.push({ path: dp, name: path.basename(dp) || dp, bytes, size: this._fmtBytes(bytes) });
                });
                resolve(dirs.slice(0, limit));
            });
        });

        return Promise.all([findFiles, findDirs]).then(([files, dirs]) => ({
            path:     dirPath,
            files,
            dirs,
            duration: ((Date.now() - t0) / 1000).toFixed(1),
        }));
    }

    // ── Version / Update ──────────────────────────────────────────────────────
    _checkVersion(res) {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
        https.get(url, { headers: { 'User-Agent': 'iobroker-linuxdashboard' } }, r => {
            let data = ''; r.on('data', c => data += c);
            r.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const latest = (json.tag_name || '').replace(/^v/, '');
                    this._json(res, { installedVersion: ADAPTER_VERSION, latestVersion: latest, updateAvailable: latest > ADAPTER_VERSION });
                } catch (e) { this._json(res, { error: e.message }, 500); }
            });
        }).on('error', e => this._json(res, { error: e.message }, 500));
    }

    _doUpdate(res) {
        const cmd = `cd /opt/iobroker && iobroker url https://github.com/${GITHUB_REPO} && iobroker restart linuxdashboard`;
        this._addLog('SYSTEM', 'Self-Update gestartet...');
        exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
            this._json(res, { ok: !err, output: stdout || stderr || '', error: err ? err.message : null });
        });
    }

    // ── States ─────────────────────────────────────────────────────────────────
    async _publishStates() {
        const m = this._metrics; if (!m) return;
        const set = async (id, val) => { try { await this.setStateAsync(id, { val, ack: true }); } catch (_) {} };
        await set('system.hostname', m.hostname);
        await set('system.uptime', m.uptime);
        await set('cpu.usage', m.cpu ? m.cpu.usagePercent : 0);
        await set('cpu.loadAvg1', m.loadAvg ? m.loadAvg[0] : 0);
        await set('cpu.loadAvg5', m.loadAvg ? m.loadAvg[1] : 0);
        await set('cpu.loadAvg15', m.loadAvg ? m.loadAvg[2] : 0);
        await set('memory.totalMB', m.memory ? Math.round(m.memory.total / 1024 / 1024) : 0);
        await set('memory.freeMB', m.memory ? Math.round(m.memory.free / 1024 / 1024) : 0);
        await set('memory.usedPercent', m.memory ? m.memory.usedPercent : 0);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    _json(res, data, code = 200) {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify(data));
    }

    _readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
            req.on('error', reject);
        });
    }

    _safePath(requestedPath, root) {
        try {
            const resolved = path.resolve(root, String(requestedPath).replace(/^\//, ''));
            if (!resolved.startsWith(path.resolve(root))) return null;
            return resolved;
        } catch (_) { return null; }
    }

    _serveFile(res, filePath, download) {
        try {
            const stat = fs.statSync(filePath);
            const headers = { 'Content-Type': isText(filePath) ? 'text/plain; charset=utf-8' : getMime(filePath), 'Content-Length': stat.size };
            if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
            res.writeHead(200, headers);
            fs.createReadStream(filePath).pipe(res);
        } catch (e) { this._json(res, { error: e.message }, 404); }
    }

    async _listDir(dirPath) {
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const result  = [];
            for (const e of entries) {
                try {
                    const fp = path.join(dirPath, e.name);
                    const st = fs.statSync(fp);
                    result.push({ name: e.name, isDir: e.isDirectory(), size: st.size, mtime: st.mtimeMs, mode: (st.mode & 0o777).toString(8) });
                } catch (_) {}
            }
            result.sort((a, b) => { if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; return a.name.localeCompare(b.name); });
            return { path: dirPath, entries: result };
        } catch (e) { return { path: dirPath, entries: [], error: e.message }; }
    }

    _fmtBytes(b) {
        if (!b) return '0 B';
        const k = 1024, s = ['B','KB','MB','GB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
    }

    _addLog(level, msg) {
        const ts = new Date().toISOString().replace('T',' ').slice(0,19);
        this._logs.push({ ts, level, msg });
        const max = parseInt(this.config.logBuffer || 500, 10);
        if (this._logs.length > max) this._logs.splice(0, this._logs.length - max);
        if (level === 'ERR')         this.log.error(`[${level}] ${msg}`);
        else if (level === 'WARN')   this.log.warn(`[${level}] ${msg}`);
        else if (this.config.verboseLogging) this.log.info(`[${level}] ${msg}`);
    }
}

if (require.main !== module) {
    module.exports = (options) => new LinuxDashboard(options);
} else {
    new LinuxDashboard();
}
