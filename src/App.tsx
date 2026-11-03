import { useEffect, useMemo, useState } from 'react';

type Row = { gender: string; age: string; values: number[] };
const colors = ['#1859e8', '#10a579', '#f59e0b', '#8b5cf6', '#ef5b5b'];
const nf = new Intl.NumberFormat('ko-KR');

function parseCSV(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const cells = (line: string) =>
    [...line.matchAll(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g)].map((m) =>
      (m[1] ?? m[2] ?? '').replace(/""/g, '"').trim(),
    );
  const headerIndex = lines.findIndex((line) => cells(line).slice(2).some((v) => /^\d{4}/.test(v)));
  const header = cells(lines[headerIndex]);
  return {
    years: header.slice(2).map(String),
    rows: lines.slice(headerIndex + 1).map((line) => {
      const c = cells(line);
      return { gender: c[0], age: c[1], values: c.slice(2).map((v) => Number(v.replace(/,/g, '')) || 0) };
    }),
  };
}

function Icon({ name }: { name: 'search' | 'trend' | 'rank' | 'scale' }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
    trend: <><path d="M3 18 9 11l4 4 8-10" /><path d="M16 5h5v5" /></>,
    rank: <><path d="M5 20v-6h4v6M11 20V9h4v11M17 20V4h4v16" /></>,
    scale: <><path d="M4 18V6M4 18h16" /><path d="m7 14 4-4 3 2 5-6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">{paths[name]}</svg>;
}

function LineChart({ series, years, normalized = false }: { series: Row[]; years: string[]; normalized?: boolean }) {
  const W = 760, H = 270, pad = 44;
  const values = series.flatMap((s) => s.values);
  const min = normalized ? 0 : Math.min(...values) * .96;
  const max = normalized ? 1 : Math.max(...values) * 1.02;
  const points = (row: Row) => {
    const source = normalized
      ? row.values.map((v) => {
          const lo = Math.min(...row.values), hi = Math.max(...row.values);
          return hi === lo ? .5 : (v - lo) / (hi - lo);
        })
      : row.values;
    return source.map((v, i) => `${pad + (i * (W - pad * 2)) / Math.max(1, years.length - 1)},${H - pad - ((v - min) / Math.max(1, max - min)) * (H - pad * 1.5)}`).join(' ');
  };
  if (!series.length) return <div className="empty">검색 결과가 없습니다.</div>;
  return <div className="chart-scroll"><svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="연도별 추이 그래프">
    {[0, .25, .5, .75, 1].map((t) => <g key={t}><line x1={pad} x2={W-pad} y1={H-pad-t*(H-pad*1.5)} y2={H-pad-t*(H-pad*1.5)} className="grid"/><text x={pad-9} y={H-pad-t*(H-pad*1.5)+4} textAnchor="end">{normalized ? t.toFixed(2) : `${Math.round((min+t*(max-min))/10000)}만`}</text></g>)}
    {years.map((y,i) => <text key={y} x={pad+i*(W-pad*2)/Math.max(1,years.length-1)} y={H-12} textAnchor="middle">{y}</text>)}
    {series.map((s,i) => <g key={s.gender+s.age}><polyline points={points(s)} fill="none" stroke={colors[i%colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points(s).split(' ').map((p,j) => {const [x,y]=p.split(','); return <circle key={j} cx={x} cy={y} r="4" fill="white" stroke={colors[i%colors.length]} strokeWidth="3"/>})}</g>)}
  </svg></div>;
}

const sensorSamples = [
  { time: '14:20', value: 18 }, { time: '14:25', value: 24 },
  { time: '14:30', value: 21 }, { time: '14:35', value: 38 },
  { time: '14:40', value: 45 }, { time: '14:45', value: 41 },
  { time: '14:50', value: 63 }, { time: '14:55', value: 57 },
  { time: '15:00', value: 72 }, { time: '15:05', value: 68 },
  { time: '15:10', value: 84 }, { time: '15:15', value: 76 },
];

function SensorChart() {
  const width = 900, height = 310, left = 48, right = 24, top = 20, bottom = 42;
  const x = (index: number) => left + index * (width - left - right) / (sensorSamples.length - 1);
  const y = (value: number) => top + (100 - value) * (height - top - bottom) / 100;
  const line = sensorSamples.map((sample, index) => `${x(index)},${y(sample.value)}`).join(' ');
  const area = `${left},${height - bottom} ${line} ${x(sensorSamples.length - 1)},${height - bottom}`;

  return <div className="sensor-chart-wrap">
    <svg className="sensor-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 1시간 터치센서 값 변화">
      <defs>
        <linearGradient id="sensorArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1859e8" stopOpacity=".2" />
          <stop offset="1" stopColor="#1859e8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((value) => <g key={value}>
        <line className="sensor-grid" x1={left} x2={width-right} y1={y(value)} y2={y(value)} />
        <text x={left-12} y={y(value)+4} textAnchor="end">{value}</text>
      </g>)}
      <polygon points={area} fill="url(#sensorArea)" />
      <polyline points={line} fill="none" stroke="#1859e8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {sensorSamples.map((sample, index) => <g key={sample.time}>
        {index % 2 === 0 && <text x={x(index)} y={height-14} textAnchor="middle">{sample.time}</text>}
        <circle cx={x(index)} cy={y(sample.value)} r={index === sensorSamples.length-1 ? 6 : 3} fill="white" stroke="#1859e8" strokeWidth={index === sensorSamples.length-1 ? 4 : 2} />
      </g>)}
    </svg>
  </div>;
}

function SensorDashboard() {
  const current = sensorSamples.at(-1)?.value ?? 0;
  return <section className="sensor-page">
    <div className="sensor-title">
      <div><div className="eyebrow">LIVE SENSOR MONITOR</div><h1>터치센서 <em>모니터링</em></h1><p>센서의 현재 상태와 시간에 따른 변화를 확인하세요.</p></div>
      <div className="live-pill"><i /> 실시간 예시 데이터</div>
    </div>
    <div className="sensor-overview">
      <article className="current-card">
        <div className="current-head"><span>현재 센서값</span><span className="device-tag">TOUCH—01</span></div>
        <div className="current-value">{current}<small>%</small></div>
        <div className="meter"><i style={{ width: `${current}%` }} /></div>
        <div className="current-foot"><span><i className="status-dot" /> 정상 작동 중</span><span>방금 업데이트</span></div>
      </article>
      <div className="sensor-mini-grid">
        <article><span>오늘 최고값</span><strong>84<small>%</small></strong><p>15:10 기록</p></article>
        <article><span>최근 1시간 평균</span><strong>51<small>%</small></strong><p>12개 데이터 기준</p></article>
        <article><span>센서 상태</span><strong className="connected">연결됨</strong><p>신호 강도 양호</p></article>
        <article><span>마지막 터치</span><strong>15:15</strong><p>현재 세션</p></article>
      </div>
    </div>
    <article className="card sensor-graph-card">
      <div className="card-head">
        <div><span className="icon blue"><Icon name="trend"/></span><div><h2>시간별 센서 변화</h2><p>최근 1시간 · 5분 간격 예시 데이터</p></div></div>
        <div className="range-tabs"><button className="active">1시간</button><button>6시간</button><button>24시간</button></div>
      </div>
      <SensorChart />
    </article>
    <div className="mock-note"><strong>예시 데이터로 표시 중</strong><span>실제 센서 API 연결 시 현재값과 그래프가 자동으로 갱신됩니다.</span></div>
  </section>;
}

export default function App() {
  const [page, setPage] = useState<'household' | 'sensor'>('sensor');
  const [rows, setRows] = useState<Row[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('2052');
  const [gender, setGender] = useState('계');
  const [selected, setSelected] = useState(['합계', '30~34세', '65세이상']);

  useEffect(() => { fetch('/households.csv').then((r) => r.text()).then((t) => { const d = parseCSV(t); setRows(d.rows); setYears(d.years); setYear(d.years.at(-1) || ''); }); }, []);
  const available = useMemo(() => rows.filter((r) => r.gender === gender && r.age.toLowerCase().includes(query.toLowerCase())), [rows, gender, query]);
  const series = selected.map((age) => available.find((r) => r.age === age)).filter(Boolean) as Row[];
  const yearIndex = Math.max(0, years.indexOf(year));
  const ranked = available.filter((r) => r.age !== '합계' && r.age !== '65세이상').sort((a,b) => b.values[yearIndex]-a.values[yearIndex]).slice(0,8);
  const total = rows.find((r) => r.gender === '계' && r.age === '합계')?.values[yearIndex] || 0;
  const delta = years.length > 1 ? ((total / (rows.find((r) => r.gender === '계' && r.age === '합계')?.values[0] || total) - 1) * 100) : 0;

  const toggle = (age: string) => setSelected((s) => s.includes(age) ? (s.length > 1 ? s.filter((x) => x !== age) : s) : [...s.slice(-3), age]);
  return <main>
    <header>
      <div><div className="brand-mark"><Icon name="trend"/></div><div><strong>가구 흐름</strong><span>통계청 추계가구 데이터</span></div></div>
      <nav className="main-nav"><button className={page === 'household' ? 'active' : ''} onClick={() => setPage('household')}>가구 데이터</button><button className={page === 'sensor' ? 'active' : ''} onClick={() => setPage('sensor')}>터치센서</button></nav>
      <div className="source">{page === 'sensor' ? 'SENSOR · LIVE' : 'KOSIS · 2050—2052'}</div>
    </header>

    {page === 'sensor' ? <SensorDashboard /> : <>
    <section className="hero">
      <div className="eyebrow">HOUSEHOLD DATA EXPLORER</div>
      <h1>대한민국 가구의<br/><em>내일을 읽다</em></h1>
      <p>성별과 연령에 따른 가구 변화의 흐름을 한눈에 살펴보세요.</p>
      <div className="filters">
        <label className="search"><Icon name="search"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="연령대 검색 (예: 65세)" /></label>
        <label><span>성별</span><select value={gender} onChange={(e)=>setGender(e.target.value)}><option>계</option><option>남자</option><option>여자</option></select></label>
        <label><span>기준 연도</span><select value={year} onChange={(e)=>setYear(e.target.value)}>{years.map((y)=><option key={y}>{y}</option>)}</select></label>
      </div>
    </section>

    <section className="stats">
      <div><span>{year}년 전체 가구</span><strong>{nf.format(total)}</strong><small>가구</small></div>
      <div><span>2050년 대비 변화</span><strong className={delta < 0 ? 'down':''}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</strong><small>전국 기준</small></div>
      <div><span>가장 많은 연령대</span><strong>{ranked[0]?.age || '—'}</strong><small>{nf.format(ranked[0]?.values[yearIndex] || 0)} 가구</small></div>
    </section>

    <section className="grid-layout">
      <article className="card line-card">
        <div className="card-head"><div><span className="icon blue"><Icon name="trend"/></span><div><h2>연도별 가구 추이</h2><p>관심 연령대를 선택해 변화를 비교하세요</p></div></div></div>
        <div className="chips">{available.map((r)=><button key={r.age} className={selected.includes(r.age)?'active':''} onClick={()=>toggle(r.age)}>{r.age}</button>)}</div>
        <div className="legend">{series.map((s,i)=><span key={s.age}><i style={{background:colors[i%colors.length]}}/>{s.age}</span>)}</div>
        <LineChart series={series} years={years}/>
      </article>

      <article className="card rank-card">
        <div className="card-head"><div><span className="icon green"><Icon name="rank"/></span><div><h2>{year} 연령대 순위</h2><p>가구 수 상위 8개 연령대</p></div></div></div>
        <div className="bars">{ranked.map((r,i)=><div className="bar-row" key={r.age}><b>{i+1}</b><span>{r.age}</span><div><i style={{width:`${(r.values[yearIndex]/(ranked[0]?.values[yearIndex]||1))*100}%`}}/></div><strong>{(r.values[yearIndex]/10000).toFixed(1)}만</strong></div>)}</div>
      </article>

      <article className="card normalize-card">
        <div className="card-head"><div><span className="icon amber"><Icon name="scale"/></span><div><h2>정규화 추이 비교</h2><p>각 연령대의 최솟값은 0, 최댓값은 1로 변환했습니다</p></div></div><span className="badge">0—1 SCALE</span></div>
        <div className="legend">{series.map((s,i)=><span key={s.age}><i style={{background:colors[i%colors.length]}}/>{s.age}</span>)}</div>
        <LineChart series={series} years={years} normalized/>
      </article>
    </section>
    <footer>자료: 통계청 장래가구추계 · 단위: 가구 <span>첨부 CSV 기준</span></footer>
    </>}
  </main>;
}
