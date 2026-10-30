'use strict';
const {meta}=window.FIN_DATA;
let companies=window.FIN_DATA.companies;
let reportDate="2026-09-30";
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={period:'3',tab:'performance',page:1,size:50,sort:'date',desc:true,watchOnly:false,rules:[{metric:'profitYoY',direction:'up',threshold:0}]};
let favorites;try{favorites=new Set(JSON.parse(localStorage.getItem('q3-watch')||'[]'))}catch{favorites=new Set()}
let filtered=[];
const periodNames={'0':'前三季度累计','1':'Q1 单季度','2':'Q2 单季度','3':'Q3 单季度','4':'Q4 单季度'};
const metricNames={profitYoY:'归母净利润同比',profitQoQ:'归母净利润环比',deductYoY:'扣非净利润同比',deductQoQ:'扣非净利润环比',revenueYoY:'营业收入同比',revenueQoQ:'营业收入环比',marginYoYpp:'归母净利率同比（pp）',marginQoQpp:'归母净利率环比（pp）',grossMarginYoYpp:'毛利率同比（pp）',grossMarginQoQpp:'毛利率环比（pp）',marginYoY:'归母净利率同比（相对 %）',marginQoQ:'归母净利率环比（相对 %）',grossMarginYoY:'毛利率同比（相对 %）',grossMarginQoQ:'毛利率环比（相对 %）'};
const fmt=(x,d=2)=>x==null?'—':Number(x).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
const amount=x=>fmt(x==null?null:x/1e8);
const pct=(x,suffix='%')=>x==null?'<span class="muted">—</span>':`<span class="${x>0?'positive':x<0?'negative':''}">${x>0?'+':''}${fmt(x)}${suffix}</span>`;
const v=(r,key)=>{if(key==='cashProfit'){const a=r.periods[state.period];return a.profit>0&&a.cash!=null?a.cash/a.profit:null}if(key==='roe'||key==='debt')return r.periods['0'][key];return key in r?r[key]:r.periods[state.period][key]};
const columns={performance:[['name','公司 / 代码','company'],['industry','申万一级','text'],['industry2','申万二级','text'],['industry3','申万三级','text'],['date','公告日期','text'],['revenue','营收（亿）','amount'],['revenueYoY','营收同比','pct'],['profit','归母（亿）','amount'],['profitYoY','归母同比','pct'],['profitQoQ','归母环比','pct'],['deduct','扣非（亿）','amount'],['deductYoY','扣非同比','pct'],['state','同比利润状态','state']],margins:[['name','公司 / 代码','company'],['industry','申万一级','text'],['industry2','申万二级','text'],['industry3','申万三级','text'],['date','公告日期','text'],['margin','归母净利率','pct'],['marginYoYpp','净利率同比 pp','pp'],['marginQoQpp','净利率环比 pp','pp'],['grossMargin','毛利率','pct'],['grossMarginYoYpp','毛利率同比 pp','pp'],['grossMarginQoQpp','毛利率环比 pp','pp'],['marginYoY','净利率相对同比','pct']],quality:[['name','公司 / 代码','company'],['industry','申万一级','text'],['industry2','申万二级','text'],['industry3','申万三级','text'],['date','公告日期','text'],['profit','归母（亿）','amount'],['deduct','扣非（亿）','amount'],['cash','经营现金流（亿）','amount'],['cashProfit','经营现金 / 归母','ratio'],['roe','累计加权 ROE','pct'],['debt','期末负债率','pct'],['flags','核查提示','flags']]};
function stat(label,value,note,tag){return `<div class="stat"><label>${label}</label><strong>${value}</strong><small>${note}</small><em>${tag}</em></div>`}
function init(){
 $('asOf').textContent=new Date(meta.asOf).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})+'（北京时间）';
 $('scope').innerHTML=`覆盖：${meta.audit.companies.toLocaleString()} 家已披露公司 · 申万一级、三级已匹配 ${meta.audit.industry3Matched.toLocaleString()} 家 · 单季度利润明细完整 ${meta.audit.quarterComplete.toLocaleString()} 家。${meta.refreshSummary?`较上一版新增 ${meta.refreshSummary.addedCount.toLocaleString()} 家。`:""}${meta.audit.nextDayNoticeReports?`含 ${meta.audit.nextDayNoticeReports.toLocaleString()} 家已入库、公告日期标为次日的财报。`:""}<b>非交易所逐家完整性核验；数据不会自动刷新。</b>`;
 $('reportDate').innerHTML=Object.keys(HISTORY_DATA.counts).filter(d=>d>='2024-03-31').sort().reverse().map(d=>`<option value="${d}">${d} · ${({'03':'一季报','06':'半年报','09':'三季报','12':'年报'})[d.slice(5,7)]}</option>`).join('');
 $('reportDate').value=reportDate; $('reportDate').onchange=()=>switchReport($('reportDate').value);
 $('industry').innerHTML+=[...new Set(companies.map(r=>r.industry))].sort((a,b)=>a.localeCompare(b,'zh')).map(i=>`<option>${esc(i)}</option>`).join('');
 $('dateFrom').removeAttribute('min');$('dateFrom').removeAttribute('max');$('dateTo').removeAttribute('min');$('dateTo').removeAttribute('max');
 for(const id of ['search','industry','industry2','industry3','market','dateFrom','dateTo','state','deductBasis','deductGrowth'])$(id).addEventListener(id==='search'?'input':'change',()=>{if(id==='industry'||id==='industry2')renderIndustry3();state.page=1;render()});
 $('periods').onclick=e=>{const b=e.target.closest('[data-period]');if(!b)return;state.period=b.dataset.period;state.page=1;if(state.period==='0')state.rules=state.rules.map(r=>({...r,metric:r.metric.replace('QoQ','YoY')}));renderRules();render()};
 $('tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(!b)return;state.tab=b.dataset.tab;render()};
 $('addRule').onclick=()=>{if(state.rules.length>=4)return toast('最多支持 4 个同时满足的条件');state.rules.push({metric:'revenueYoY',direction:'up',threshold:0});renderRules()};
 $('reset').onclick=()=>{for(const id of ['search','industry','industry2','industry3','market','dateFrom','dateTo','state','deductGrowth'])$(id).value='';$('deductBasis').value='YoY';state.rules=[{metric:'profitYoY',direction:'up',threshold:0}];state.watchOnly=false;state.page=1;renderIndustry3();renderRules();render()};
 $('watchOnly').onclick=()=>{state.watchOnly=!state.watchOnly;state.page=1;render()};
 $('pageSize').onchange=()=>{state.size=+$('pageSize').value;state.page=1;render()};$('prev').onclick=()=>{state.page--;render()};$('next').onclick=()=>{state.page++;render()};
 $('export').onclick=exportRows;$('methodBtn').onclick=()=>{$('method').showModal()};
 document.addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close)$(close.dataset.close).close();const company=e.target.closest('[data-company]');if(company)showDetail(company.dataset.company);const fav=e.target.closest('[data-fav]');if(fav){const c=fav.dataset.fav;favorites.has(c)?favorites.delete(c):favorites.add(c);try{localStorage.setItem('q3-watch',JSON.stringify([...favorites]))}catch{}render()}});
 for(const id of ['detail','method'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)$(id).close()}});
 renderIndustry3();renderMethod();renderRules();render();
}
function renderIndustry3(){
 const ind=$('industry').value, selected2=$('industry2').value;
 const options2=[...new Set(companies.filter(r=>!ind||r.industry===ind).map(r=>r.industry2))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh'));
 $('industry2').innerHTML='<option value="">全部二级行业</option>'+options2.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join(''); $('industry2').value=options2.includes(selected2)?selected2:'';
 const selected=$('industry3').value, ind2=$('industry2').value;
 const options=[...new Set(companies.filter(r=>(!ind||r.industry===ind)&&(!ind2||r.industry2===ind2)).map(r=>r.industry3))].sort((a,b)=>a.localeCompare(b,'zh'));
 $('industry3').innerHTML='<option value="">全部三级行业</option>'+options.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
 $('industry3').value=options.includes(selected)?selected:'';
}
function renderRules(){
 $('rules').innerHTML=state.rules.map((r,i)=>`<div class="rule" data-rule="${i}"><select aria-label="筛选指标">${Object.entries(metricNames).filter(([k])=>state.period!=='0'||!k.includes('QoQ')).map(([key,name])=>`<option value="${key}" ${key===r.metric?'selected':''}>${name}</option>`).join('')}</select><select class="direction" aria-label="增长或下降方向"><option value="up" ${r.direction==='up'?'selected':''}>增长 ≥ 正阈值</option><option value="down" ${r.direction==='down'?'selected':''}>下降 ≤ 负阈值</option></select>${[0,10,30,50,100].map(t=>`<button data-threshold="${t}" class="${r.threshold===t?'active':''}">${t===0?'不限':(r.direction==='down'?'≤ −':'≥ +')+t+(r.metric.endsWith('pp')?' pp':'%')}</button>`).join('')}${state.rules.length>1?'<button class="delete" aria-label="删除条件">×</button>':''}</div>`).join('');
 $('rules').querySelectorAll('.rule').forEach(el=>{const i=+el.dataset.rule;el.querySelector('select').onchange=e=>{state.rules[i].metric=e.target.value;state.page=1;renderRules();render()};el.querySelector('.direction').onchange=e=>{state.rules[i].direction=e.target.value;state.page=1;renderRules();render()};el.querySelectorAll('[data-threshold]').forEach(b=>b.onclick=()=>{state.rules[i].threshold=+b.dataset.threshold;state.page=1;renderRules();render()});if(el.querySelector('.delete'))el.querySelector('.delete').onclick=()=>{state.rules.splice(i,1);state.page=1;renderRules();render()}});
}
function render(){
 if(state.period==='0')$('deductBasis').value='YoY';
 $('deductBasis').querySelector('[value="QoQ"]').disabled=state.period==='0';
 const deductThreshold=Number($('deductGrowth').value),deductMetric='deduct'+$('deductBasis').value;
 const q=$('search').value.trim().toLowerCase(),ind=$('industry').value,ind2=$('industry2').value,ind3=$('industry3').value,market=$('market').value,from=$('dateFrom').value,to=$('dateTo').value,st=$('state').value;
 filtered=companies.filter(r=>{
  const a=r.periods[state.period];
  return(!q||r.name.toLowerCase().includes(q)||r.code.includes(q))&&(!ind||r.industry===ind)&&(!ind2||r.industry2===ind2)&&(!ind3||r.industry3===ind3)&&(!market||r.exchange===market)&&(!from||r.date>=from)&&(!to||r.date<=to)&&(!state.watchOnly||favorites.has(r.code))&&(!st||(st==='loss'?a.profit!=null&&a.profit<0:st==='missing'?r.flags.length>0||a.profit==null:a.state===st))&&(!deductThreshold||(a[deductMetric]!=null&&(deductThreshold>0?a[deductMetric]>=deductThreshold:a[deductMetric]<=deductThreshold)))&&state.rules.every(rule=>!rule.threshold||(a[rule.metric]!=null&&(rule.direction==='up'?a[rule.metric]>=rule.threshold:a[rule.metric]<=-rule.threshold)));
 });
 filtered.sort((a,b)=>{let x=v(a,state.sort),y=v(b,state.sort);if(x==null)return y==null?a.code.localeCompare(b.code):1;if(y==null)return -1;const d=typeof x==='number'?x-y:String(x).localeCompare(String(y),'zh');return (state.desc?-d:d)||a.code.localeCompare(b.code)});
 const total=filtered.length,pages=Math.max(1,Math.ceil(total/state.size));state.page=Math.max(1,Math.min(state.page,pages));
 const valid=filtered.filter(r=>r.periods[state.period].profit!=null),grow=valid.filter(r=>r.periods[state.period].profitYoY>0).length,loss=valid.filter(r=>r.periods[state.period].profit<0).length,turn=valid.filter(r=>r.periods[state.period].state==='扭亏为盈').length;
 $('stats').innerHTML=stat('当前筛选公司',total.toLocaleString(),`全部源站记录 ${companies.length.toLocaleString()} 家`,'COVERAGE')+stat('归母同比改善',grow.toLocaleString(),`含亏损收窄 · 占利润有效样本 ${valid.length?fmt(grow/valid.length*100,1):'—'}%`,'GROWTH')+stat('扭亏为盈',turn.toLocaleString(),periodNames[state.period]+' · 同比对照','TURNAROUND')+stat('仍在亏损',loss.toLocaleString(),'包含亏损收窄与亏损扩大','LOSS');
 $('periodHint').textContent=state.period==='0'?'累计值不计算环比':'环比以相邻单季度比较，Q1 对比上年 Q4';
 document.querySelectorAll('[data-period]').forEach(b=>{b.classList.toggle('active',b.dataset.period===state.period);b.disabled=Number(b.dataset.period)>Number(reportDate.slice(5,7))/3; if(b.dataset.period==='0')b.textContent=periodNames[0]});document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
 $('watchOnly').classList.toggle('active',state.watchOnly);$('watchOnly').setAttribute('aria-pressed',state.watchOnly);$('watchOnly').textContent=`☆ 只看关注 (${favorites.size})`;
 $('resultCount').textContent=`${total.toLocaleString()} 家 · ${periodNames[state.period]}`;
 $('activeFilter').textContent=[deductThreshold?`扣非净利润${$('deductBasis').value==='YoY'?'同比':'环比'} ${deductThreshold>0?'≥ +':'≤ −'}${Math.abs(deductThreshold)}%`:'',...state.rules.filter(r=>r.threshold).map(r=>`${metricNames[r.metric]} ${r.direction==='up'?'≥ +':'≤ −'}${r.threshold}${r.metric.endsWith('pp')?' pp':'%'}`),from&&to&&from>to?'日期范围无效：开始日晚于结束日':''].filter(Boolean).join('　且　')||'当前未设置增长率阈值；点击列名排序，☆ 可保存在本浏览器。';
 const cols=columns[state.tab];$('mainTable').querySelector('thead').innerHTML='<tr>'+cols.map(([key,name])=>`<th scope="col" aria-sort="${state.sort===key?(state.desc?'descending':'ascending'):'none'}"><button data-sort="${key}">${name} ${state.sort===key?(state.desc?'↓':'↑'):'↕'}</button></th>`).join('')+'</tr>';
 $('mainTable').querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{state.desc=state.sort===b.dataset.sort?!state.desc:true;state.sort=b.dataset.sort;render()});
 $('mainTable').querySelector('tbody').innerHTML=filtered.slice((state.page-1)*state.size,state.page*state.size).map(r=>'<tr>'+cols.map(([key,,type])=>{
  const a=r.periods[state.period],x=v(r,key);let value;
  if(type==='company')value=`<button class="fav ${favorites.has(r.code)?'on':''}" data-fav="${r.code}" aria-label="${favorites.has(r.code)?'取消':'添加'}关注 ${esc(r.name)}">${favorites.has(r.code)?'★':'☆'}</button><button class="name" data-company="${r.code}">${esc(r.name)}${r.flags.length?'<span class="warningdot">·</span>':''}</button><span class="code">${r.symbol} ${r.exchange==='BJ'?'北交所':''}</span>`;
  else if(type==='amount')value=`<span class="${x<0?'negative':''}">${amount(x)}</span>`;
  else if(type==='pct')value=pct(x);else if(type==='pp')value=pct(x,'');else if(type==='state')value=`<span class="badge ${a.profit<0?'warn':''}">${esc(x)}</span>`;
  else if(type==='ratio')value=a.profit>0&&a.cash!=null?fmt(a.cash/a.profit)+'×':'<span class="muted">—</span>';
  else if(type==='flags')value=`<button data-company="${r.code}" title="${esc(r.flags.join('；'))}" style="border:0;padding:0;font-size:11px">${r.flags.length?`${r.flags.length} 项提示 ↗`:'查看口径 ↗'}</button>`;
  else value=esc(x);return `<td>${value}</td>`;
 }).join('')+'</tr>').join('')||`<tr><td class="empty" colspan="${cols.length}">没有符合条件的公司。可放宽阈值、日期或行业，或重置筛选。</td></tr>`;
 $('pageInfo').textContent=`第 ${state.page} / ${pages} 页 · ${total?((state.page-1)*state.size+1):0}–${Math.min(state.page*state.size,total)} / ${total}`;$('prev').disabled=state.page===1;$('next').disabled=state.page>=pages;$('export').disabled=total===0;
 const groups={};filtered.forEach(r=>groups[r.industry]=(groups[r.industry]||0)+1);const sorted=Object.entries(groups).sort((a,b)=>b[1]-a[1]);const max=sorted[0]?.[1]||1;
 $('industryBars').innerHTML=sorted.map(([name,n])=>`<button class="industryRow" data-industry="${esc(name)}"><span>${esc(name)}</span><span class="bar"><i style="width:${n/max*100}%"></i></span><span>${n}</span></button>`).join('')||'<span class="muted">暂无结果</span>';$('industryBars').querySelectorAll('[data-industry]').forEach(b=>b.onclick=()=>{$('industry').value=b.dataset.industry;renderIndustry3();state.page=1;render();$('industry').focus()});
}
function showDetail(code){
 const r=companies.find(x=>x.code===code),p=r.periods;
 const detailRows=[['revenue','营业收入（亿元）','a'],['revenueYoY','营业收入同比','p'],['revenueQoQ','营业收入环比','p'],['profit','归母净利润（亿元）','a'],['priorProfit','去年同期归母（亿元）','a'],['previousProfit','上一季度归母（亿元）','a'],['profitYoY','归母净利润同比','p'],['profitQoQ','归母净利润环比','p'],['state','同比利润状态','s'],['deduct','扣非归母净利润（亿元）','a'],['deductYoY','扣非净利润同比','p'],['deductQoQ','扣非净利润环比','p'],['margin','归母净利率','p'],['marginYoYpp','归母净利率同比（pp）','pp'],['marginQoQpp','归母净利率环比（pp）','pp'],['marginYoY','净利率相对同比','p'],['marginQoQ','净利率相对环比','p'],['grossMargin','毛利率','p'],['grossMarginYoYpp','毛利率同比（pp）','pp'],['grossMarginQoQpp','毛利率环比（pp）','pp'],['grossMarginYoY','毛利率相对同比','p'],['grossMarginQoQ','毛利率相对环比','p'],['cash','经营现金流净额（亿元）','a']];
 const quarters=[1,2,3,4].filter(q=>q<=Number(reportDate.slice(5,7))/3);
 const max=Math.max(1,...quarters.map(q=>Math.abs(p[q].profit||0)));
 $('detailContent').innerHTML=`<button class="close" data-close="detail" aria-label="关闭详情">×</button><div class="detailhead"><div class="eyebrow">COMPANY FINANCIALS</div><h2>${esc(r.name)} <small class="code">${r.symbol}</small></h2><p>${esc(r.industry)} / ${esc(r.industry2)} / ${esc(r.industry3)} · ${esc(r.market)} · 公告日期 ${r.date} · 数据更新 ${r.updated}<br>源站入库时间：${esc(r.providerIngested)}（非官方发布时间）</p></div><div class="sourcebox">${r.flags.length?r.flags.map(f=>'⚑ '+esc(f)).join('<br>'):'本页未触发所列自动提示；不代表财报已经逐项审计。'}${r.industryCode?`<br>申万行业分类代码 ${r.industryCode} · 分类计入日 ${r.industryDate}`:''}</div><div class="trendbox"><small>归母净利润 · 单季度（亿元）</small><div class="trend">${quarters.map(q=>`<div class="trendcol"><span>${amount(p[q].profit)}</span><i class="${p[q].profit<0?'loss':''}" style="height:${Math.max(1,Math.abs(p[q].profit||0)/max*40)}px"></i><span>Q${q}</span></div>`).join('')}</div><span class="detailLegend">柱高为绝对金额，负值用棕色并保留负号。</span></div><div class="detailtable"><table><thead><tr><th>财务指标</th>${[...quarters,0].map(q=>`<th>${periodNames[q]}</th>`).join('')}</tr></thead><tbody>${detailRows.map(([key,label,t])=>`<tr><td>${label}</td>${[...quarters,0].map(q=>`<td>${t==='a'?amount(p[q][key]):t==='s'?esc(p[q][key]):pct(p[q][key],t==='pp'?'':'%')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="sourcebox"><b>报告期累计补充：</b>加权 ROE ${fmt(p[0].roe)}%；资产负债率 ${fmt(p[0].debt)}%；基本 EPS ${fmt(p[0].eps,4)} 元；数据源销售净利率 ${fmt(p[0].sourceNetMargin)}%（含少数股东损益口径，区别于本页归母净利率）。<br><b>回查：</b>${r.pdf?`<a href="${r.pdf}" target="_blank" rel="noopener">已抽查原始财报 PDF ↗</a>`:''}<a href="https://data.eastmoney.com/stockdata/${r.code}.html" target="_blank" rel="noopener">公司数据入口 ↗</a><a href="https://data.eastmoney.com/notices/stock/${r.code}.html" target="_blank" rel="noopener">公告列表（查报告全文）↗</a><a href="https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=ALL&pageSize=20&filter=${encodeURIComponent(`(SECUCODE="${r.symbol}")(REPORT_DATE='${reportDate}')`)}" target="_blank" rel="noopener">财务指标接口 ↗</a><br>表内 Q2 = 中报累计 − Q1；Q3 = 三季报累计 − 中报累计。历史比较使用本次采集到的各期数据，未逐家排除追溯重述差异。</div>`;
 $('detailContent').insertAdjacentHTML('beforeend',historyDetail(code));
 $('detail').showModal();
}
function renderMethodOld(){
 const a=meta.audit;
 $('methodContent').innerHTML=`<div class="auditlist"><p class="methodstats">原始业绩报表 ${a.cpdRaw} 条 → A股类型 ${a.cpdA} 家 → 网页 ${a.companies} 家。<br>上海 ${a.markets.SH} · 深圳 ${a.markets.SZ} · 北京 ${a.markets.BJ}；包含 ST，排除 B股、新三板及存托凭证。</p><p><b>覆盖边界</b><br>以本次采集时东方财富 2026-09-30 业绩报表中已存在的 A 股实际财务记录为基础（不含业绩预告或预约披露记录）。截至 ${meta.dateCutoff} 已入库而 NOTICE_DATE 标记为次日的 ${a.nextDayNoticeReports||0} 家报告一并纳入，单独添加提示；源站入库时间不等同交易所官方首次发布时间，未逐家核验发布时间。新浪当前行情池 ${a.quotePool} 只代码作为交叉校验；本次全部记录均匹配当前行情池；保留历史新上市公司核查线索。尚未与交易所官方全量名录、每家公司公告逐一对账，不能据此断言没有遗漏。暂未披露与源站尚未收录，在本页不能区分。</p><p><b>日期</b><br>筛选使用业绩报表 NOTICE_DATE（源站公告日期标签），不使用预约日期；公告日期可能晚于实际晚间上网时间，不应将两者混为一谈。日期筛选已开放到本次最大公告日期 ${meta.latestNoticeDate||meta.dateCutoff}。数据更新日晚于首次日期时另作提示；“更新”不等于已确认财务数字更正。沃华医药保留 10 月 10 日首次日期，并标注 10 月 13 日更新。</p><p><b>期间与增长</b><br>Q1 使用一季报累计；Q2 = 中报 − Q1；Q3 = 三季报 − 中报；前三季度累计直接取三季报。同比比较上年相同期间；环比比较相邻单季度，Q1 对比上年 Q4（年报 − 三季报）。累计不计算环比。增长率 =（本期 − 基期）÷ |基期| × 100%，基期为零或缺失时显示 —。负基数下该值反映改善幅度，须连同扭亏、亏损标签阅读；不强行把亏损改成负增长。</p><p><b>利润率</b><br>归母净利率 = 归母净利润 ÷ 营业收入；毛利率 = 毛利润 ÷ 营业收入。单季度先对金额作差，再计算比率，不对累计利润率直接作差。变化 pp = 本期利润率 − 基期利润率，例如 10% → 15% 为 +5 pp；相对增长为 +50%。银行等毛利无适用数值时留空。跨行业的营业总收入、营业收入及利润率可能不可直接比较。</p><p><b>核查与缺失</b><br>申万一级已匹配 ${a.industryMatched} 家，三级已匹配 ${a.industry3Matched} 家（${a.industry3Categories} 个有公司覆盖的三级行业），缺失：${a.missingIndustry3.join('、')}。三级名称使用 Tushare 公开的申万2021代码对照表，按已有申万官方历史分类代码匹配；没有用名称相似度猜测分类。一级、三级筛选同时满足，一级切换会更新三级选项并清除不适用选择。使用官方当前一级行业成分及官方分类历史最新有效记录；分类历史的行业编码前两位与 31 个一级行业的名称映射已交叉验证。Q1–Q3 归母明细完整 ${a.quarterComplete} 家；缺失不填零。两个东方财富接口的累计营收、归母金额交叉校验差异 ${a.crossSourceDiscrepancies.length} 条（容差 1 元或 0.01%），属于同一提供方接口核对，不能替代独立审计。已对平安银行、沃华医药原始报告作定点抽查，并在详情提供 PDF。</p><p><b>使用</b><br>阈值为包含边界的嵌套筛选，例如 ≥ 50% 同时包含 ≥ 100%；负阈值按 ≤ −50% 等处理。多个条件同时满足。关注列表仅保存在本浏览器。导出包含全部筛选结果的四个期间明细，金额单位亿元，空白为缺失。静态快照不会自动更新。</p><p><b>数据来源</b><br>${meta.sources.map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${s.name} ↗</a>`).join('<br>')}<br><a href="https://cfi.net.cn/p20261027004818.html" target="_blank" rel="noopener">天元重工上市公告书（转载全文）↗</a><br><a href="audit.json" download>覆盖审计与采集时间 JSON ↓</a><br><a href="update-audit.json" download>本次新增与变更公司清单 JSON ↓</a><br><a href="data.json" download>网页完整数据 JSON ↓</a></p></div>`;
}
function renderMethod(){
 $('methodContent').innerHTML=`<div class="auditlist"><p><b>数据范围</b><br>提供 2024 年至今的一季报、半年报、三季报和年报主要财务指标；2023 年数据用于同比。覆盖本次新浪 A 股行情池 ${HISTORY_DATA.roster} 只股票，不含已退市公司。<a href="history-audit.json" download>各期覆盖审计</a>。未与交易所和原始公告逐家核对，不能保证无遗漏；部分记录可能为上市前财务数据，请核验实际披露情况。</p><p><b>阅读线索</b><br>比较营收、归母、扣非和毛利率是否共同改善；关注经营现金流、应收账款和存货，结合季节性、财报附注、审计意见、估值及竞争格局判断。页面提示是核查线索，不能推断未来业绩。经营现金流为合并口径，归母利润为归属于母公司股东的口径，两者比例并非严格回款率。</p><p><b>计算口径</b><br>Q1 为一季报累计；Q2 = 半年报 − 一季报；Q3 = 三季报 − 半年报；Q4 = 年报 − 三季报。同比比较上年同期，环比比较相邻单季度；累计不计算环比。增长率 =（本期 − 基期）÷ |基期|；基期为零或缺失时留空。利润率变化 pp 是百分点。缺失不填零；金融与非金融企业指标可比性不同。</p><p><b>行业与日期</b><br>申万一、二、三级统一采用本次最新有效分类，历史期没有按当年归属回溯。公告日期是数据源标签，可能与实际首次上网时间不同；历史数据可能有追溯调整或上市前记录。请回查原始报告，不能用本快照做无偏历史回测。</p><p><b>数据来源</b><br>${meta.sources.map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${s.name} ↗</a>`).join('<br>')}<br><a href="history-audit.json" download>覆盖审计 ↓</a><br><a href="data.json" download>最新三季报数据 ↓</a><br>静态快照不自动更新，后续可按要求重新采集和校验。</p></div>`;
}
function exportRows(){
 const fields=[['revenue','营业收入_亿元'],['revenueYoY','营收同比_%'],['revenueQoQ','营收环比_%'],['profit','归母净利润_亿元'],['profitYoY','归母同比_%'],['profitQoQ','归母环比_%'],['priorProfit','上年同期归母_亿元'],['previousProfit','上季度归母_亿元'],['deduct','扣非归母_亿元'],['deductYoY','扣非同比_%'],['deductQoQ','扣非环比_%'],['margin','归母净利率_%'],['marginYoYpp','归母净利率同比_pp'],['marginQoQpp','归母净利率环比_pp'],['marginYoY','归母净利率相对同比_%'],['marginQoQ','归母净利率相对环比_%'],['grossMargin','毛利率_%'],['grossMarginYoYpp','毛利率同比_pp'],['grossMarginQoQpp','毛利率环比_pp'],['grossMarginYoY','毛利率相对同比_%'],['grossMarginQoQ','毛利率相对环比_%'],['cash','经营现金流净额_亿元'],['state','同比利润状态']];
 const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
 const rows=[['代码','公司','市场','申万一级行业','申万二级行业','申万三级行业','申万分类代码','公告日期','数据更新日期','期间','核查提示','采集时点',...fields.map(f=>f[1])]];
 filtered.forEach(r=>[1,2,3,4,0].filter(q=>q===0||q<=Number(reportDate.slice(5,7))/3).forEach(q=>rows.push([r.symbol,r.name,r.market,r.industry,r.industry2,r.industry3,r.industryCode,r.date,r.updated,periodNames[q],r.flags.join('；'),meta.asOf,...fields.map(([key,name])=>{const x=r.periods[q][key];return x==null?'':name.endsWith('亿元')?x/1e8:x})])));
 const blob=new Blob(['\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`A股${reportDate}财报_${filtered.length}家公司_期间明细.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`已导出 ${filtered.length} 家公司、${filtered.length*(Number(reportDate.slice(5,7))/3+1)} 条期间明细`);
}
function toast(message){$('toast').textContent=message;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',3000)}
function historyDetail(code){
 const rec=HISTORY_DATA.companies[code]; if(!rec)return ''; const dates=Object.keys(rec.reports).filter(d=>d>='2024-03-31').sort().reverse();
 return `<div class="sourcebox"><b>各报告期主要财务数据 · 累计值（亿元）</b><br>按当次采集的数据展示，可能含追溯调整或上市前数据；缺失不填零。公告日期为数据源标签，请回查原始公告。<div class="detailtable"><table><thead><tr><th>报告期</th><th>公告日期</th><th>营收</th><th>归母</th><th>扣非</th><th>经营现金流</th></tr></thead><tbody>${dates.map(d=>{const a=rec.reports[d];return `<tr><td>${d}</td><td>${esc(a[9])}</td><td>${amount(a[0])}</td><td>${amount(a[1])}</td><td>${amount(a[2])}</td><td>${amount(a[4])}</td></tr>`}).join('')}</tbody></table></div></div>`;
}
const fs=['revenue','profit','deduct','gross','cash'];
const diff=(a,b)=>a==null||b==null?null:a-b;
const ratio=(a,b)=>a==null||b==null||b===0?null:a/b*100;
const growth=(a,b)=>a==null||b==null||b===0?null:(a-b)/Math.abs(b)*100;
function switchReport(date){
 reportDate=date; const year=Number(date.slice(0,4)),q=Number(date.slice(5,7))/3;periodNames[0]=['','一季度累计','上半年累计','前三季度累计','全年累计'][q];
 if(date==='2026-09-30') companies=window.FIN_DATA.companies;
 else companies=Object.values(HISTORY_DATA.companies).filter(x=>x.reports[date]).map(x=>{
  const get=(y,n)=>{const day=`${y}-${['03-31','06-30','09-30','12-31'][n-1]}`;const a=x.reports[day]||[]; const o={};fs.forEach((k,i)=>o[k]=a[i]??null);Object.assign(o,{roe:a[5]??null,debt:a[6]??null,eps:a[7]??null,sourceNetMargin:a[8]??null});return o};
  const quarter=(y,n)=>{let a=get(y,n);if(n>1){const b=get(y,n-1);fs.forEach(k=>a[k]=diff(a[k],b[k]));}return a};
  const margins=a=>{a.margin=ratio(a.profit,a.revenue);a.grossMargin=ratio(a.gross,a.revenue);return a};
  const periods={}; for(let n=0;n<=4;n++){
   const a=margins(n?quarter(year,n):get(year,q)),b=margins(n?quarter(year-1,n):get(year-1,q)),prev=n?margins(n===1?quarter(year-1,4):quarter(year,n-1)):{};
   fs.forEach(k=>{a[k+'YoY']=growth(a[k],b[k]);a[k+'QoQ']=n?growth(a[k],prev[k]):null});
   for(const k of ['margin','grossMargin']){a[k+'YoYpp']=diff(a[k],b[k]);a[k+'QoQpp']=n?diff(a[k],prev[k]):null;a[k+'YoY']=growth(a[k],b[k]);a[k+'QoQ']=n?growth(a[k],prev[k]):null;}
   a.priorProfit=b.profit;a.previousProfit=prev.profit??null;let p=a.profit,t=b.profit;
   a.state=p==null||t==null?'数据缺失':p>0&&t<0?'扭亏为盈':p<0&&t>0?'由盈转亏':p<0&&p>t?'亏损收窄':p<0&&p<t?'亏损扩大':p<0?'持续亏损':p>t?'盈利增长':p<t?'盈利下降':'持平';periods[n]=a;
  }
  const raw=x.reports[date], flags=[];if(x.info.industry==='待核实')flags.push('申万分类待核实');if(raw[10]!==raw[9])flags.push('源站更新日不同于公告日期，可能含更正或追溯调整');if(periods[0].priorProfit!=null&&Math.abs(periods[0].priorProfit)<1e6)flags.push('同比利润基数低于100万元');if(periods[0].profit>0&&periods[0].cash!=null&&periods[0].cash<0)flags.push('累计盈利但经营现金流为负，需结合季节性核查');
  return {...x.info,date:raw[9],updated:raw[10],providerIngested:'历史采集未提供',periods,flags,pdf:null};
 });
 const oldIndustry=$('industry').value, allIndustries=[...new Set(companies.map(r=>r.industry))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh')); $('industry').innerHTML='<option value="">全部行业</option>'+allIndustries.map(i=>`<option value="${esc(i)}">${esc(i)}</option>`).join('');$('industry').value=allIndustries.includes(oldIndustry)?oldIndustry:'';
 state.period=String(q);state.page=1; $('dateFrom').value='';$('dateTo').value='';$('scope').innerHTML=`报告期 ${date}：源站已收录 ${companies.length.toLocaleString()} 家，当前行情池 ${HISTORY_DATA.roster.toLocaleString()} 家。数据缺失可能是未披露、未收录或历史可比数据缺失，不能直接判定原因。历史行业统一采用本次分类；可能包含上市前财务数据。<b>未与交易所逐家核验，静态快照不自动刷新。</b>`;
 renderIndustry3();renderRules();render();
}
init();switchReport(reportDate);
