import React, { useState } from 'react';
import { 
  Globe, Film, Copy, Check, ExternalLink, 
  Download, Trash2, FileText, Sparkles, RefreshCw, AlertCircle, ShieldCheck, Terminal, Code, CheckCircle2, ListTree
} from 'lucide-react';

interface ReelItem {
  id: string;
  url: string;
}

export default function App() {
  const [profileUrl, setProfileUrl] = useState('https://www.facebook.com/people/Professor-Glitch/61580646125999/?sk=reels_tab');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [reelsTabUrl, setReelsTabUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [reportMetadata, setReportMetadata] = useState<any>(null);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const [progressMsg, setProgressMsg] = useState('Đang khởi tạo trình duyệt giả lập...');
  const handleStartScraping = async () => {
    if (!profileUrl.trim() || loading) return;
    setLoading(true);
    setError(null);
    setReels([]);
    setReelsTabUrl('');
    setReportMetadata(null);
    setDebugLogs([]);
    setShowLogs(false);
    setCopiedLogs(false);
    setProgressMsg('Đang gửi yêu cầu đến GitHub Actions...');

    const messages = [
      'Đang chờ GitHub Actions khởi động trình duyệt...',
      'Đang mở Facebook và tải danh sách Reels...',
      'Đang cuộn trang và thu thập liên kết...',
      'Đang hoàn tất danh sách và gửi kết quả về website...',
    ];
    let messageIndex = 0;
    const progressTimer = window.setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      setProgressMsg(messages[messageIndex]);
    }, 5000);

    try {
      const startResponse = await fetch('/api/scrape-reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl }),
      });
      const startData = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || !startData.jobId) {
        throw new Error(startData?.error || 'Không thể khởi chạy lượt cào.');
      }

      const deadline = Date.now() + 6 * 60 * 1000;
      let result: any = null;
      while (Date.now() < deadline) {
        await new Promise(resolve => window.setTimeout(resolve, 2500));
        const statusResponse = await fetch('/api/scrape-status?jobId=' + encodeURIComponent(startData.jobId), {
          cache: 'no-store',
        });
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusData?.error || 'Không đọc được trạng thái lượt cào.');
        if (statusData.status === 'failed') throw new Error(statusData.error || 'GitHub Actions không hoàn tất lượt cào.');
        if (statusData.status === 'completed') {
          result = statusData.result;
          break;
        }
      }
      if (!result) throw new Error('Đã chờ quá lâu mà chưa nhận được kết quả. Bạn có thể thử lại.');

      const links: string[] = Array.isArray(result.links) ? result.links : [];
      const unique = new Map<string, ReelItem>();
      for (const link of links) {
        const match = String(link).match(/\/reel\/(\d+)/i);
        if (match && !unique.has(match[1])) {
          unique.set(match[1], { id: match[1], url: 'https://www.facebook.com/reel/' + match[1] + '/' });
        }
      }
      const finalReels = Array.from(unique.values());
      setReels(finalReels);
      setDebugLogs(Array.isArray(result.debugLogs) ? result.debugLogs : []);
      if (Array.isArray(result.debugLogs) && result.debugLogs.length > 0 && /stopped_(detached_frame|scrape_error|target_closed|time_budget)/.test(result.status || '')) {
        setShowLogs(true);
      }
      setReelsTabUrl(result.reelsTabUrl || '');
      setReportMetadata({
        source: result.reelsTabUrl || profileUrl,
        collected_at: new Date().toISOString(),
        count: finalReels.length,
        status: result.status || 'completed',
        note: 'Đã nhận kết quả hoàn chỉnh từ GitHub Actions.',
      });
      setProgressMsg('Đã nhận được kết quả.');
    } catch (err: any) {
      setError(err?.message || 'Lỗi khi cào dữ liệu.');
      setReportMetadata({
        source: profileUrl,
        collected_at: new Date().toISOString(),
        count: 0,
        status: 'failed',
        note: 'Lượt cào không hoàn tất.',
      });
    } finally {
      window.clearInterval(progressTimer);
      setLoading(false);
    }
  };

  const handleDownloadTxt = () => {
    if (reels.length === 0) return;
    const content = reels.map(r => r.url).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facebook_reels_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    if (reels.length === 0) return;
    const csv = ['reel_id,url', ...reels.map(r => `${r.id},"${r.url}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facebook_reels_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (reels.length === 0) return;
    const jsonMeta = {
      source: reelsTabUrl || profileUrl,
      collected_at: new Date().toISOString(),
      count: reels.length,
      status: reportMetadata?.status || 'completed_fully',
      debugLogs: debugLogs,
      links: reels.map(r => r.url),
    };
    const blob = new Blob([JSON.stringify(jsonMeta, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facebook_reels_metadata_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyDebugLogs = async () => {
    if (debugLogs.length === 0) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugLogs, null, 2));
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch {
      setError('Không thể sao chép Debug Logs. Hãy kiểm tra quyền clipboard của trình duyệt.');
    }
  };

  const handleCopyAll = () => {
    if (reels.length === 0) return;
    const content = reels.map(r => r.url).join('\n');
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Synchronized Audited Bookmarklet Script matching server.ts mechanism exactly
  const synchronizedBookmarkletCode = `javascript:(async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"};
  const popup=()=>[...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')].find(d=>visible(d)&&/see more on facebook|log in to facebook|email address or phone number/i.test(d.innerText||""));
  const close=()=>{const d=popup();if(!d)return false;const b=[...d.querySelectorAll('[aria-label],button,[role="button"]')].find(x=>visible(x)&&/^(close|đóng|dismiss)$/i.test(x.getAttribute('aria-label')||""));if(b){b.click();return true}return false};
  const out=new Map();
  const scan=()=>{for(const a of document.querySelectorAll('a[href]')){try{const u=new URL(a.href,location.href),m=u.pathname.match(/^\/reel\/(\d+)/i);if(m&&/(^|\.)facebook\.com$/i.test(u.hostname))out.set(m[1],\`https://www.facebook.com/reel/\${m[1]}/\`)}catch{}}};
  const find=()=>[...document.querySelectorAll('#scrollview,main,[role="main"],div,section')].filter(e=>{const s=getComputedStyle(e);return/(auto|scroll)/i.test(s.overflowY)&&e.scrollHeight>e.clientHeight+150&&e.querySelector('a[href*="/reel/"]')}).sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]||null;
  let scroller=find(),idle=0,prev=0,height=0;scan();
  for(let step=0;step<180&&idle<8;step++){
    close();await pause(150);
    const p=scroller||document.documentElement,before=scroller?scroller.scrollTop:scrollY,client=scroller?scroller.clientHeight:innerHeight,total=scroller?scroller.scrollHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),amount=Math.max(300,Math.floor(client*.72));
    if(scroller){scroller.scrollTop=Math.min(before+amount,total);scroller.dispatchEvent(new WheelEvent('wheel',{deltaY:amount,bubbles:true}));scroller.dispatchEvent(new Event('scroll',{bubbles:true}))}else{scrollBy({top:amount,behavior:'smooth'});dispatchEvent(new WheelEvent('wheel',{deltaY:amount,bubbles:true}))}
    await pause(1800);scan();const now=out.size,nextHeight=scroller?scroller.scrollHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);idle=now>prev||nextHeight!==height?0:idle+1;prev=now;height=nextHeight;
    const blocked=popup();if(blocked&&!close())break;
    if((scroller?scroller.scrollTop:scrollY)+client>=total-80&&idle>=3)break;
  }
  const urls=[...out.values()];if(urls.length)copy(urls.join('\n'));else console.warn('Không tìm thấy link reel');
})();`;


  const handleCopyScript = () => {
    navigator.clipboard.writeText(synchronizedBookmarkletCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Film className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
                FB Reels Synchronized Scraper
              </span>
              <span className="text-xs text-slate-400 ml-2 hidden sm:inline-block">
                Logic browser liên tục với popup-aware scrolling
              </span>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Continuous Browser Protocol
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Input Box */}
        <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue-400" />
              Tự Động Trích Xuất Reels Ổn Định (POST API)
            </h2>
            <p className="text-slate-400 text-sm">
              Mỗi lần bấm sẽ tạo một lượt cào mới trên GitHub Actions. Website chờ kết quả hoàn chỉnh rồi hiển thị danh sách.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.facebook.com/people/Professor-Glitch/61580646125999/?sk=reels_tab"
              className="flex-1 px-4 py-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleStartScraping}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 py-3.5 rounded-xl font-medium text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Đang cào ổn định...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Bắt đầu Cào Ổn Định</span>
                </>
              )}
            </button>
          </div>

          {reelsTabUrl && !loading && (
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2 pt-1">
              <span>URL Đã xử lý:</span>
              <a href={reelsTabUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                {reelsTabUrl} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Loading Card when loading */}
        {loading && (
          <div className="bg-slate-900 border border-blue-500/30 p-6 sm:p-8 rounded-2xl shadow-2xl space-y-4 text-center">
            <RefreshCw className="w-10 h-10 animate-spin text-blue-400 mx-auto" />
            <h3 className="font-bold text-white text-base">Đang cào Reels trên GitHub Actions...</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">{progressMsg}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-xl text-red-300 text-sm flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Section */}
        <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Film className="w-5 h-5 text-blue-400" />
                Kết Quả Thực Tế ({reels.length} Reels)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Kết quả sẽ hiển thị khi GitHub Actions gửi danh sách hoàn chỉnh về website.</p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopyAll}
                disabled={reels.length === 0 || loading}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1 border border-slate-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Đã copy' : 'Copy TXT'}</span>
              </button>
              <button
                onClick={handleDownloadTxt}
                disabled={reels.length === 0 || loading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1 shadow-md"
              >
                <Download className="w-3.5 h-3.5" />
                <span>TXT</span>
              </button>
              <button
                onClick={handleDownloadCsv}
                disabled={reels.length === 0 || loading}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1 shadow-md"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                onClick={handleDownloadJson}
                disabled={reels.length === 0 || loading}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1 shadow-md"
              >
                <Code className="w-3.5 h-3.5" />
                <span>JSON (Metadata)</span>
              </button>
            </div>
          </div>

          {reportMetadata && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
              <div className="flex items-center justify-between">
                <span><strong className="text-blue-400">Nguồn:</strong> {reportMetadata.source}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    disabled={debugLogs.length === 0}
                    className="text-amber-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <ListTree className="w-3.5 h-3.5" /> {showLogs ? 'Ẩn Debug Logs' : `Xem Debug Logs (${debugLogs.length})`}
                  </button>
                  <button
                    onClick={handleCopyDebugLogs}
                    disabled={debugLogs.length === 0}
                    className="text-blue-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> {copiedLogs ? 'Đã copy log' : 'Copy Debug Logs'}
                  </button>
                </div>
              </div>
              <div><strong className="text-blue-400">Thời điểm:</strong> {reportMetadata.collected_at}</div>
              <div><strong className="text-blue-400">Trạng thái:</strong> <span className="text-emerald-400">{reportMetadata.status}</span></div>
              <div><strong className="text-blue-400">Ghi chú:</strong> {reportMetadata.note}</div>
            </div>
          )}

          {/* Debug Logs Accordion */}
          {showLogs && debugLogs.length > 0 && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Chi tiết Debug Logs từng bước cuộn:</div>
              <div className="max-h-60 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-400">
                {debugLogs.map((log, idx) => (
                  <div key={idx} className="border-b border-slate-900 pb-1">
                    <span className="text-slate-600">[{log.time}]</span> <span className="text-white">{log.msg}</span> {JSON.stringify(log.meta)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {reels.length === 0 && !loading ? (
            <div className="h-72 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
              <Film className="w-10 h-10 mb-3 text-slate-600 opacity-50" />
              <span className="text-sm font-medium text-slate-400">Chưa có dữ liệu reels nào được kiểm định.</span>
              <span className="mt-1">Nhập link profile Facebook ở trên và nhấn <strong>Bắt đầu Cào Ổn Định</strong>.</span>
            </div>
          ) : reels.length > 0 ? (
            <div className="h-96 bg-slate-950 rounded-xl border border-slate-800 overflow-y-auto p-3 space-y-2 font-mono text-xs">
              {reels.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 w-8">#{i + 1}</span>
                  <span className="text-emerald-400 font-bold w-40 truncate">{r.id}</span>
                  <span className="text-blue-400 truncate flex-1 mx-2">{r.url}</span>
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white p-1">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Bottom Section: Synchronized Bookmarklet Script */}
        <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-bold text-white flex items-center gap-2">
              <Code className="w-5 h-5 text-amber-400" />
              Đoạn Script Chuẩn Đồng Bộ (Synchronized Bookmarklet)
            </h3>
            <button
              onClick={handleCopyScript}
              className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border border-slate-700"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedScript ? 'Đã sao chép script' : 'Sao chép Script Đồng Bộ'}</span>
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Đoạn script dưới đây dùng cùng nguyên tắc với trình duyệt: đóng popup khi còn nút Close, cuộn liên tục, quét DOM sau mỗi lần chờ lazy-load và dừng khi Facebook chặn hoặc không còn link mới.
          </p>
          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48">
            {synchronizedBookmarkletCode}
          </pre>
        </div>

      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>© 2026 FB Reels Synchronized Scraper. Continuous Browser Protocol.</p>
      </footer>
    </div>
  );
}
