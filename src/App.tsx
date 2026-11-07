import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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

type SensorSample = { time: string; value: number; timestamp: number };
type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
};
type SerialApi = { requestPort(options: { filters: { usbVendorId: number; usbProductId: number }[] }): Promise<SerialPortLike> };

function parseReading(record: Record<string, unknown>): SensorSample | null {
  const value = typeof record.value === 'number'
    ? record.value
    : typeof record.value === 'string' && record.value.trim()
      ? Number(record.value)
      : Number.NaN;
  const timestamp = typeof record.created_at === 'string' ? Date.parse(record.created_at) : Number.NaN;
  if (!Number.isFinite(value) || !Number.isFinite(timestamp)) return null;

  return {
    time: new Date(timestamp).toLocaleTimeString('ko-KR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }),
    value,
    timestamp,
  };
}

function mergeSamples(current: SensorSample[], incoming: SensorSample[]) {
  const unique = new Map<string, SensorSample>();
  [...current, ...incoming].forEach((sample) => {
    unique.set(`${sample.timestamp}:${sample.value}`, sample);
  });
  return [...unique.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-100);
}

function SensorChart({ samples, emptyMessage }: { samples: SensorSample[]; emptyMessage: string }) {
  const width = 900, height = 310, left = 48, right = 24, top = 20, bottom = 42;
  const values = samples.map((sample) => sample.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 100;
  const padding = max === min ? Math.max(Math.abs(max) * .08, 1) : (max - min) * .08;
  const low = min - padding, high = max + padding;
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, samples.length - 1);
  const y = (value: number) => top + (high - value) * (height - top - bottom) / (high - low);
  const line = samples.map((sample, index) => `${x(index)},${y(sample.value)}`).join(' ');
  const area = samples.length ? `${x(0)},${height - bottom} ${line} ${x(samples.length - 1)},${height - bottom}` : '';

  return <div className="sensor-chart-wrap">
    <svg className="sensor-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="최근 센서값 변화">
      <defs>
        <linearGradient id="sensorArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1859e8" stopOpacity=".2" />
          <stop offset="1" stopColor="#1859e8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, .25, .5, .75, 1].map((tick) => {
        const value = high - tick * (high - low);
        return <g key={tick}>
          <line className="sensor-grid" x1={left} x2={width-right} y1={y(value)} y2={y(value)} />
          <text x={left-12} y={y(value)+4} textAnchor="end">{Number(value.toPrecision(4))}</text>
        </g>;
      })}
      {samples.length > 1 && <>
        <polygon points={area} fill="url(#sensorArea)" />
        <polyline points={line} fill="none" stroke="#1859e8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {samples.map((sample, index) => <g key={`${sample.time}-${index}`}>
        {(index % Math.max(1, Math.ceil(samples.length / 6)) === 0 || index === samples.length - 1) && <text x={x(index)} y={height-14} textAnchor="middle">{sample.time}</text>}
        <circle cx={x(index)} cy={y(sample.value)} r={index === samples.length-1 ? 6 : 3} fill="white" stroke="#1859e8" strokeWidth={index === samples.length-1 ? 4 : 2} />
      </g>)}
    </svg>
    {!samples.length && <div className="sensor-chart-empty">{emptyMessage}</div>}
  </div>;
}

function SensorDashboard() {
  const [samples, setSamples] = useState<SensorSample[]>([]);
  const [databaseStatus, setDatabaseStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [databaseError, setDatabaseError] = useState('');
  const [realtimeError, setRealtimeError] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [serialLatest, setSerialLatest] = useState<number | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [serialError, setSerialError] = useState('');
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const portRef = useRef<SerialPortLike | null>(null);
  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  const current = samples.at(-1)?.value;
  const highest = samples.length ? Math.max(...samples.map((sample) => sample.value)) : null;
  const average = samples.length ? samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length : null;
  const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 });

  useEffect(() => {
    let active = true;
    let initialLoadComplete = false;
    let pendingReadings: SensorSample[] = [];
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      setDatabaseStatus('error');
      setDatabaseError('프로젝트 최상위 .env에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정하세요.');
      return () => { active = false; };
    }

    let client: ReturnType<typeof createClient>;
    try {
      client = createClient(url, anonKey);
    } catch {
      setDatabaseStatus('error');
      setDatabaseError('Supabase 클라이언트를 초기화하지 못했습니다. .env의 URL과 키 설정을 확인하세요.');
      return () => { active = false; };
    }

    const channel = client
      .channel('readings-inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'readings' }, (payload) => {
        const sample = parseReading(payload.new);
        if (!sample) {
          if (active) setRealtimeError('새 readings 행에 유효한 value 또는 created_at 값이 없습니다.');
          return;
        }
        if (!initialLoadComplete) {
          pendingReadings = mergeSamples(pendingReadings, [sample]);
        } else if (active) {
          setSamples((previous) => mergeSamples(previous, [sample]));
        }
      })
      .subscribe((subscriptionStatus) => {
        if (!active) return;
        if (subscriptionStatus === 'SUBSCRIBED') {
          setRealtimeConnected(true);
          setRealtimeError('');
        } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
          setRealtimeConnected(false);
          setRealtimeError('Supabase Realtime 연결에 실패했습니다. readings 테이블의 Realtime 활성화와 SELECT 권한을 확인하세요.');
        } else if (subscriptionStatus === 'CLOSED') {
          setRealtimeConnected(false);
        }
      });

    const loadReadings = async () => {
      try {
        const { data, error: queryError } = await client
          .from('readings')
          .select('value, created_at')
          .order('created_at', { ascending: false })
          .limit(100);
        if (queryError) throw queryError;
        const loaded = (data ?? [])
          .map((record) => parseReading(record))
          .filter((sample): sample is SensorSample => sample !== null)
          .reverse();
        initialLoadComplete = true;
        if (!active) return;
        setSamples(mergeSamples(loaded, pendingReadings));
        setDatabaseStatus('ready');
      } catch {
        initialLoadComplete = true;
        if (!active) return;
        setDatabaseStatus('error');
        setDatabaseError('Supabase readings 데이터를 불러오지 못했습니다. 테이블, value/created_at 열, SELECT 권한을 확인하세요.');
      }
    };

    void loadReadings();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRef.current = true;
      const reader = readerRef.current;
      if (reader) void reader.cancel().catch((cancelError: unknown) => console.error('시리얼 리더 정리 실패', cancelError));
    };
  }, []);

  const connectSerial = async () => {
    const serial = (navigator as Navigator & { serial?: SerialApi }).serial;
    if (!serial) {
      if (mountedRef.current) setSerialError('이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome 또는 Edge에서 localhost나 HTTPS로 접속해 주세요.');
      return;
    }

    setSerialError('');
    setStatus('connecting');
    let port: SerialPortLike | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let opened = false;
    let handedOff = false;
    try {
      port = await serial.requestPort({ filters: [{ usbVendorId: 0x2341, usbProductId: 0x0043 }] });
      if (!mountedRef.current) return;
      await port.open({ baudRate: 9600 });
      opened = true;
      if (!mountedRef.current) return;
      if (!port.readable) throw new Error('시리얼 포트에서 데이터를 읽을 수 없습니다.');
      reader = port.readable.getReader();
      readerRef.current = reader;
      portRef.current = port;
      stopRef.current = false;
      setSerialLatest(null);
      setStatus('connected');
      handedOff = true;
      void readSerialData(reader, port);
    } catch (connectionError) {
      if (!stopRef.current && mountedRef.current) {
        setSerialError(connectionError instanceof Error ? connectionError.message : String(connectionError));
      }
    } finally {
      if (!handedOff) {
        readerRef.current = null;
        portRef.current = null;
        if (reader) reader.releaseLock();
      }
      if (!handedOff && port && opened) {
        try {
          await port.close();
        } catch (closeError) {
          if (mountedRef.current) setSerialError(closeError instanceof Error ? closeError.message : String(closeError));
        }
      }
      if (!handedOff && mountedRef.current) setStatus('disconnected');
    }
  };

  const readSerialData = async (reader: ReadableStreamDefaultReader<Uint8Array>, port: SerialPortLike) => {
    const decoder = new TextDecoder();
    let buffer = '';
    const addLine = (line: string) => {
      const text = line.trim();
      if (!text) return;
      const value = Number(text);
      if (!Number.isFinite(value)) return;
      const time = new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      });
      setSerialLatest(value);
    };

    try {
      while (!stopRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          lines.forEach(addLine);
        }
      }
      addLine(buffer + decoder.decode());
    } catch (readError) {
      if (!stopRef.current && mountedRef.current) {
      setSerialError(readError instanceof Error ? readError.message : String(readError));
      }
    } finally {
      readerRef.current = null;
      portRef.current = null;
      try {
        reader.releaseLock();
      } catch (releaseError) {
        if (mountedRef.current) setSerialError(releaseError instanceof Error ? releaseError.message : String(releaseError));
      }
      try {
        await port.close();
      } catch (closeError) {
        if (mountedRef.current) setSerialError(closeError instanceof Error ? closeError.message : String(closeError));
      }
      if (mountedRef.current) setStatus('disconnected');
    }
  };

  const disconnectSerial = async () => {
    stopRef.current = true;
    try {
      await readerRef.current?.cancel();
    } catch (cancelError) {
      if (mountedRef.current) setSerialError(cancelError instanceof Error ? cancelError.message : String(cancelError));
      const port = portRef.current;
      if (port && mountedRef.current) {
        try {
          await port.close();
        } catch (closeError) {
          setSerialError(closeError instanceof Error ? closeError.message : String(closeError));
        }
      }
      readerRef.current = null;
      portRef.current = null;
      if (mountedRef.current) setStatus('disconnected');
    }
  };

  const lastSample = samples.at(-1);
  const databaseStatusText = databaseStatus === 'loading'
    ? 'Supabase 연결 중'
    : databaseStatus === 'error'
      ? 'Supabase 오류'
      : realtimeConnected
        ? 'Supabase 실시간 연결됨'
        : 'Supabase 연결됨';
  const serialStatusText = status === 'connected' ? '연결됨' : status === 'connecting' ? '연결 중' : '연결 안 됨';
  const emptyMessage = databaseStatus === 'loading'
    ? 'Supabase 데이터를 불러오는 중입니다.'
    : databaseStatus === 'error'
      ? 'Supabase 데이터에 연결할 수 없습니다.'
      : 'Supabase에 저장된 센서 데이터가 없습니다.';
  const errorMessages = [databaseError, realtimeError, serialError].filter(Boolean);
  return <section className="sensor-page">
    <div className="sensor-title">
      <div><div className="eyebrow">LIVE SENSOR MONITOR</div><h1>터치센서 <em>모니터링</em></h1><p>센서의 현재 상태와 시간에 따른 변화를 확인하세요.</p></div>
      <div className="sensor-controls">
        <div className={`live-pill ${realtimeConnected ? '' : 'inactive'}`}><i /> {databaseStatusText}</div>
        <button className="serial-button" onClick={status === 'connected' ? () => void disconnectSerial() : () => void connectSerial()} disabled={status === 'connecting'}>
          {status === 'connecting' ? '연결 중…' : status === 'connected' ? '연결 끊기' : '시리얼 연결'}
        </button>
      </div>
    </div>
    <div className="sensor-overview">
      <article className="current-card">
        <div className="current-head"><span>현재 센서값</span><span className="device-tag">TOUCH—01</span></div>
        <div className="current-value">{current === undefined ? '—' : numberFormat.format(current)}</div>
        <div className="current-foot"><span><i className={`status-dot ${realtimeConnected ? 'online' : ''}`} /> {databaseStatus === 'loading' ? '불러오는 중' : realtimeConnected ? '실시간 수신 중' : databaseStatus === 'error' ? '연결 오류' : '실시간 대기'}</span><span>{lastSample?.time ?? '데이터 없음'}</span></div>
      </article>
      <div className="sensor-mini-grid">
        <article><span>최근 최고값</span><strong>{highest === null ? '—' : numberFormat.format(highest)}</strong><p>{samples.length}개 데이터 기준</p></article>
        <article><span>최근 평균</span><strong>{average === null ? '—' : numberFormat.format(average)}</strong><p>{samples.length}개 데이터 기준</p></article>
        <article><span>아두이노 시리얼</span><strong className={status === 'connected' ? 'connected' : ''}>{serialStatusText}</strong><p>{serialLatest === null ? (status === 'connected' ? '데이터 수신 대기' : '포트를 선택해 연결하세요') : `마지막 값 ${numberFormat.format(serialLatest)} · 9600 baud`}</p></article>
        <article><span>마지막 데이터</span><strong>{lastSample?.time ?? '—'}</strong><p>Supabase readings 기준</p></article>
      </div>
    </div>
    <article className="card sensor-graph-card">
      <div className="card-head">
        <div><span className="icon blue"><Icon name="trend"/></span><div><h2>시간별 센서 변화</h2><p>Supabase readings 테이블의 최근 100개 값</p></div></div>
        <div className="graph-count">{samples.length} / 100개</div>
      </div>
      <SensorChart samples={samples} emptyMessage={emptyMessage} />
    </article>
    {errorMessages.length
      ? <div className="serial-error" role="alert">{errorMessages.map((message) => <div key={message}>{message}</div>)}</div>
      : <div className="mock-note"><strong>Supabase readings 데이터</strong><span>{realtimeConnected ? '새 행이 추가되면 실시간으로 대시보드가 갱신됩니다.' : '최근 100개 행을 시간순으로 표시합니다. 아두이노 시리얼 연결 기능도 사용할 수 있습니다.'}</span></div>}
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
