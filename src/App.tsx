import React, { useState } from 'react';
import { 
  Globe, Film, Copy, Check, ExternalLink, 
  Download, Trash2, FileText, Sparkles, RefreshCw, AlertCircle, ShieldCheck
} from 'lucide-react';

interface ReelItem {
  id: string;
  url: string;
}

export default function App() {
  const [profileUrl, setProfileUrl] = useState('https://www.facebook.com/profile.php?id=61580646125999');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [reelsTabUrl, setReelsTabUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const handleStartScraping = async () => {
    if (!profileUrl.trim()) return;
    setLoading(true);
    setError(null);
    setReels([]);

    try {
      const res = await fetch('/api/scrape-reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to scrape reels');

      setReelsTabUrl(data.reelsTabUrl || '');
      const formattedReels: ReelItem[] = (data.links || []).map((link: string) => {
        const m = link.match(/\/reel\/(\d+)/i);
        return {
          id: m ? m[1] : Math.random().toString(),
          url: link,
        };
      });
      setReels(formattedReels);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi cào dữ liệu từ trình duyệt giả lập.');
    } finally {
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

  const handleCopyAll = () => {
    if (reels.length === 0) return;
    const content = reels.map(r => r.url).join('\n');
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                FB Profile Reels Browser Scraper
              </span>
              <span className="text-xs text-slate-400 ml-2 hidden sm:inline-block">
                Giả lập trình duyệt • Đóng popup • Cuộn lazy-load • Xuất TXT
              </span>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Headless Puppeteer Bot
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Input Box */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-400" />
            Dán Link Profile Facebook để Cào Toàn Bộ Reels
          </h2>
          <p className="text-slate-400 text-sm">
            Hệ thống sẽ dùng trình duyệt giả lập để truy cập tab Reels của profile, tự động xử lý popup đăng nhập và cuộn trang liên tục để gom toàn bộ link.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.facebook.com/profile.php?id=61580646125999"
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleStartScraping}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang giả lập trình duyệt & Cuộn...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Bắt đầu Cào Reels</span>
                </>
              )}
            </button>
          </div>

          {reelsTabUrl && (
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2 pt-1">
              <span>Đang quét URL Tab Reels:</span>
              <a href={reelsTabUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
                {reelsTabUrl} <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 p-4 rounded-xl text-red-300 text-sm flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Section */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <Film className="w-5 h-5 text-blue-400" />
                Kết Quả Trích Xuất ({reels.length} Reels)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Danh sách link reel thu thập tự động qua trình duyệt giả lập</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyAll}
                disabled={reels.length === 0 || loading}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1.5 border border-slate-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Đã sao chép!' : 'Sao chép tất cả'}</span>
              </button>
              <button
                onClick={handleDownloadTxt}
                disabled={reels.length === 0 || loading}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-medium transition flex items-center gap-1.5 shadow-md shadow-blue-600/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải xuống file .TXT</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="h-64 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-slate-400 text-sm p-6 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p>Trình duyệt đang mở trang, đóng popup, và cuộn trang để lấy toàn bộ reels...</p>
              <p className="text-xs text-slate-500">Quá trình này có thể mất từ 10 đến 30 giây tùy thuộc vào số lượng video.</p>
            </div>
          ) : reels.length === 0 ? (
            <div className="h-64 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
              <Film className="w-8 h-8 mb-2 text-slate-600 opacity-50" />
              Chưa có dữ liệu reels nào.<br/>Nhập link profile ở trên và nhấn <strong>Bắt đầu Cào Reels</strong>.
            </div>
          ) : (
            <div className="h-96 bg-slate-950 rounded-xl border border-slate-800 overflow-y-auto p-3 space-y-2 font-mono text-xs">
              {reels.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 w-8">#{i + 1}</span>
                  <span className="text-emerald-400 font-bold w-36 truncate">{r.id}</span>
                  <span className="text-blue-400 truncate flex-1 mx-2">{r.url}</span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>© 2026 FB Profile Reels Browser Scraper. Headless Puppeteer Automation.</p>
      </footer>
    </div>
  );
}
