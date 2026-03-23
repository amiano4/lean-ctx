export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lean-ctx — Token Savings Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0f;--surface:#12121a;--border:#1e1e2e;
  --text:#e2e2ef;--muted:#6b6b8a;--accent:#6ee7b7;
  --accent2:#818cf8;--danger:#f87171;
  --font:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--font);min-height:100vh}
.app{max-width:1100px;margin:0 auto;padding:32px 24px}
header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:40px}
h1{font-size:24px;font-weight:700;letter-spacing:-0.5px}
h1 span{color:var(--accent);font-weight:300}
.refresh{color:var(--muted);font-size:13px;cursor:pointer;border:1px solid var(--border);
  background:transparent;padding:6px 14px;border-radius:6px;transition:all .2s}
.refresh:hover{border-color:var(--accent);color:var(--accent)}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px}
.kpi-val{font-size:28px;font-weight:700;margin-bottom:4px}
.kpi-label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px}
.kpi--accent .kpi-val{color:var(--accent)}
.kpi--purple .kpi-val{color:var(--accent2)}
.charts{display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:32px}
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px}
.chart-card h3{font-size:14px;color:var(--muted);margin-bottom:16px;font-weight:500}
.sessions-table{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px}
.sessions-table h3{font-size:14px;color:var(--muted);margin-bottom:16px;font-weight:500}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase;
  letter-spacing:0.5px;padding:8px 12px;border-bottom:1px solid var(--border)}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.tag--green{background:rgba(110,231,183,.12);color:var(--accent)}
.tag--purple{background:rgba(129,140,248,.12);color:var(--accent2)}
.empty{text-align:center;padding:60px 20px;color:var(--muted)}
.empty h2{font-size:18px;margin-bottom:8px;color:var(--text)}
.empty p{font-size:14px;max-width:400px;margin:0 auto}
.footer{text-align:center;padding:32px;color:var(--muted);font-size:12px}
@media(max-width:768px){
  .kpi-grid{grid-template-columns:repeat(2,1fr)}
  .charts{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="app">
  <header>
    <h1>lean<span>-ctx</span></h1>
    <button class="refresh" onclick="load()">Refresh</button>
  </header>
  <div id="content"><div class="empty"><h2>Loading...</h2></div></div>
  <div class="footer">lean-ctx v0.3.0 — Token optimization for AI coding tools</div>
</div>
<script>
const $=id=>document.getElementById(id);
const fmt=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toString();
const pct=(a,b)=>b>0?Math.round(a/b*100):0;

let savingsChart=null,toolChart=null;

async function load(){
  try{
    const res=await fetch('/api/stats');
    const data=await res.json();
    render(data);
  }catch(e){
    $('content').innerHTML='<div class="empty"><h2>Cannot connect</h2><p>Make sure lean-ctx dashboard is running.</p></div>';
  }
}

function render(data){
  if(!data.sessions||data.sessions.length===0){
    $('content').innerHTML=\`<div class="empty">
      <h2>No sessions yet</h2>
      <p>Start using lean-ctx MCP tools in Cursor, Copilot, or Claude Code. Token savings will appear here automatically.</p>
    </div>\`;
    return;
  }

  const totalSaved=data.totalTokensSaved||0;
  const totalOrig=data.totalTokensOriginal||0;
  const sessions=data.sessions||[];
  const savedPct=pct(totalSaved,totalOrig);
  const totalCalls=sessions.reduce((s,x)=>s+x.toolCalls.length,0);

  $('content').innerHTML=\`
    <div class="kpi-grid">
      <div class="kpi kpi--accent"><div class="kpi-val">\${fmt(totalSaved)}</div><div class="kpi-label">Tokens Saved</div></div>
      <div class="kpi kpi--purple"><div class="kpi-val">\${savedPct}%</div><div class="kpi-label">Avg Reduction</div></div>
      <div class="kpi"><div class="kpi-val">\${sessions.length}</div><div class="kpi-label">Sessions</div></div>
      <div class="kpi"><div class="kpi-val">\${fmt(totalCalls)}</div><div class="kpi-label">Tool Calls</div></div>
    </div>
    <div class="charts">
      <div class="chart-card"><h3>Token Savings Over Time</h3><canvas id="savingsChart"></canvas></div>
      <div class="chart-card"><h3>By Tool</h3><canvas id="toolChart"></canvas></div>
    </div>
    <div class="sessions-table">
      <h3>Recent Sessions</h3>
      <table>
        <thead><tr><th>Date</th><th>Project</th><th>Calls</th><th>Saved</th><th>Rate</th></tr></thead>
        <tbody>\${sessions.slice(-20).reverse().map(s=>{
          const d=new Date(s.startedAt);
          const date=d.toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit'});
          const time=d.toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit'});
          const rate=pct(s.tokensSaved,s.tokensOriginal);
          return \`<tr>
            <td>\${date} \${time}</td>
            <td>\${s.project}</td>
            <td>\${s.toolCalls.length}</td>
            <td><span class="tag tag--green">\${fmt(s.tokensSaved)} tok</span></td>
            <td><span class="tag tag--purple">\${rate}%</span></td>
          </tr>\`;
        }).join('')}</tbody>
      </table>
    </div>
  \`;

  renderCharts(sessions);
}

function renderCharts(sessions){
  const last30=sessions.slice(-30);
  const labels=last30.map(s=>{
    const d=new Date(s.startedAt);
    return d.toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit'});
  });
  const saved=last30.map(s=>s.tokensSaved);
  const orig=last30.map(s=>s.tokensOriginal);

  if(savingsChart)savingsChart.destroy();
  savingsChart=new Chart($('savingsChart'),{
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'Saved',data:saved,backgroundColor:'rgba(110,231,183,.6)',borderRadius:4},
        {label:'Original',data:orig,backgroundColor:'rgba(129,140,248,.2)',borderRadius:4},
      ]
    },
    options:{
      responsive:true,
      plugins:{legend:{position:'bottom',labels:{color:'#6b6b8a',font:{size:11}}}},
      scales:{
        x:{ticks:{color:'#6b6b8a',font:{size:10}},grid:{color:'#1e1e2e'}},
        y:{ticks:{color:'#6b6b8a',font:{size:10},callback:v=>fmt(v)},grid:{color:'#1e1e2e'}}
      }
    }
  });

  const toolMap={};
  for(const s of sessions){
    for(const c of s.toolCalls){
      toolMap[c.tool]=(toolMap[c.tool]||0)+c.tokensSaved;
    }
  }
  const tNames=Object.keys(toolMap);
  const tVals=tNames.map(k=>toolMap[k]);
  const colors=['#6ee7b7','#818cf8','#f472b6','#fbbf24','#38bdf8'];

  if(toolChart)toolChart.destroy();
  toolChart=new Chart($('toolChart'),{
    type:'doughnut',
    data:{
      labels:tNames,
      datasets:[{data:tVals,backgroundColor:colors.slice(0,tNames.length),borderWidth:0}]
    },
    options:{
      responsive:true,
      plugins:{legend:{position:'bottom',labels:{color:'#6b6b8a',font:{size:11},padding:12}}}
    }
  });
}

load();
setInterval(load,15000);
</script>
</body>
</html>`;
}
