import React, { useState } from 'react';
import { 
  Globe, Film, Copy, Check, ExternalLink, 
  Download, Trash2, FileText, Sparkles, Upload, ShieldCheck, Code, Play
} from 'lucide-react';

interface ReelItem {
  id: string;
  url: string;
}

export default function App() {
  const [profileUrl, setProfileUrl] = useState('https://www.facebook.com/profile.php?id=61580646125999&sk=reels_tab');
  const [rawHtmlInput, setRawHtmlInput] = useState('');
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [activeTab, setActiveTab] = useState<'parser' | 'bookmarklet' | 'guide'>('parser');

  // Extract unique reel links from HTML source code or text
  const handleParseHtml = (text: string) => {
    setRawHtmlInput(text);
    if (!text.trim()) {
      setReels([]);
      return;
    }

    const uniqueMap = new Map<string, string>();
    // Regex matching /reel/<ID> or facebook.com/reel/<ID>
    const regex = /(?:facebook\.com\/reel\/|\/reel\/|watch\/\?v=)(\d+)/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const id = match[1];
      if (id && id.length > 5) {
        uniqueMap.set(id, `https://www.facebook.com/reel/${id}/`);
      }
    }

    const results: ReelItem[] = [];
    uniqueMap.forEach((url, id) => {
      results.push({ id, url });
    });

    setReels(results);
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

  // Bookmarklet code that users can drag to bookmarks bar or run in DevTools console
  const bookmarkletCode = `javascript:(async function(){
  const scroller = document.querySelector('#scrollview') || [...document.querySelectorAll('*')].find(el => el.scrollHeight > el.clientHeight + 100) || window;
  const seen = new Map();
  const scan = () => {
    document.querySelectorAll('a[href]').forEach(a => {
      const m = a.href.match(/\\/reel\\/(\\d+)/i);
      if(m) seen.set(m[1], 'https://www.facebook.com/reel/' + m[1] + '/');
    });
  };
  
  // Close login popup if any
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')];
  dialogs.forEach(d => {
    const btn = d.querySelector('[aria-label="Close"], [aria-label="close"]');
    if(btn) btn.click();
  });

  alert('Bắt đầu cào Reels! Trang sẽ tự động cuộn xuống...');
  for(let i=0; i<30; i++) {
    if(scroller === window) window.scrollBy(0, window.innerHeight);
    else { scroller.scrollTop += scroller.clientHeight; scroller.dispatchEvent(new Event('scroll', {bubbles:true})); }
    scan();
    await new Promise(r => setTimeout(r, 1500));
  }

  const urls = [...seen.values()];
  if(urls.length === 0) { alert('Không tìm thấy link reel!'); return; }
  const blob = new Blob([urls.join('\\n')], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'facebook_reels_' + Date.now() + '.txt';
  a.click();
  alert('Đã trích xuất và tải xuống ' + urls.length + ' reels thành công!');
})();`;

  const copyBookmarklet = () => {
    navigator.clipboard.writeText(bookmarkletCode);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 2000);
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
                FB Profile Reels Extractor & TXT Exporter
              </span>
              <span className="text-xs text-slate-400 ml-2 hidden sm:inline-block">
                Giải pháp chính xác 100% qua Browser Session & HTML Source Parser
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('parser')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'parser' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Parser & Xuất TXT
            </button>
            <button
              onClick={() => setActiveTab('bookmarklet')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'bookmarklet' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Bookmarklet Tự Động
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'bookmarklet' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Hướng Dẫn Quy Trình
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {activeTab === 'parser' ? (
          <>
            {/* Step 1: Open Reels Tab Link */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" />
                Bước 1: Mở URL Tab Reels trên Trình Duyệt Của Bạn
              </h2>
              <p className="text-slate-400 text-sm">
                Vì Facebook yêu cầu phiên đăng nhập (login session), hãy mở link tab Reels chuẩn dưới đây trên trình duyệt mà bạn đã đăng nhập Facebook:
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={profileUrl}
                  onChange={(e) => setProfileUrl(e.target.value)}
                  className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                />
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-medium text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20 whitespace-nowrap"
                >
                  <span>Mở Tab Reels trên FB</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Step 2: Paste HTML Source & Extract */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Upload className="w-4 h-4 text-emerald-400" />
                      Bước 2: Dán Mã Nguồn HTML (Page Source)
                    </h3>
                    <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">Ctrl+U</span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Sau khi cuộn trang để tải các Reels trên Facebook, nhấn <strong>Ctrl+U</strong> (View Page Source) hoặc nhấn <strong>F12</strong> chọn thẻ <code>&lt;html&gt;</code>, copy toàn bộ và dán vào ô dưới đây:
                  </p>
                  <textarea
                    rows={10}
                    value={rawHtmlInput}
                    onChange={(e) => handleParseHtml(e.target.value)}
                    placeholder="Dán toàn bộ mã nguồn HTML của trang Facebook Reels vào đây..."
                    className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { setRawHtmlInput(''); setReels([]); }}
                    className="text-xs text-slate-400 hover:text-red-400 transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa sạch
                  </button>
                  <span className="text-xs text-emerald-400 font-medium">
                    Đã trích xuất: <strong>{reels.length}</strong> Reels chính xác
                  </span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      Bước 3: Xem Danh Sách & Tải File .TXT
                    </h3>
                    <span className="text-xs bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full font-medium">
                      {reels.length} Link sẵn sàng
                    </span>
                  </div>

                  {reels.length === 0 ? (
                    <div className="h-60 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
                      <Film className="w-8 h-8 mb-2 text-slate-600 opacity-50" />
                      Chưa có link nào.<br/>Hãy dán mã nguồn HTML ở ô bên trái để bóc tách toàn bộ link reels.
                    </div>
                  ) : (
                    <div className="h-60 bg-slate-950 rounded-xl border border-slate-800 overflow-y-auto p-3 space-y-2 font-mono text-xs">
                      {reels.map((r, i) => (
                        <div key={r.id} className="flex items-center justify-between bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                          <span className="text-slate-500 w-6">#{i + 1}</span>
                          <span className="text-blue-400 truncate flex-1 mx-2">{r.url}</span>
                          <a href={r.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white p-1">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleCopyAll}
                    disabled={reels.length === 0}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white py-3 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-2 border border-slate-700"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Đã sao chép!' : 'Sao chép tất cả'}</span>
                  </button>
                  <button
                    onClick={handleDownloadTxt}
                    disabled={reels.length === 0}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-3 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải xuống file .TXT</span>
                  </button>
                </div>
              </div>

            </div>
          </>
        ) : activeTab === 'bookmarklet' ? (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="bg-amber-500/20 p-3 rounded-xl text-amber-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Bookmarklet Tự Động Cào Reels</h2>
                <p className="text-slate-400 text-sm mt-0.5">Chạy trực tiếp trên trình duyệt của bạn khi đang xem tab Reels.</p>
              </div>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="font-semibold text-white">Hướng dẫn sử dụng:</div>
                <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-300">
                  <li>Mở trang Reels profile Facebook trên trình duyệt của bạn.</li>
                  <li>Mở <strong>F12 (DevTools Console)</strong>, dán đoạn mã JavaScript bên dưới vào và nhấn Enter.</li>
                  <li>Trang sẽ tự động đóng popup, cuộn trang lấy toàn bộ reels và tự động tải xuống file <code className="text-blue-300">facebook_reels.txt</code>!</li>
                </ol>
              </div>

              <div className="relative">
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-60">
                  {bookmarkletCode}
                </pre>
                <button
                  onClick={copyBookmarklet}
                  className="absolute top-3 right-3 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                >
                  {copiedBookmarklet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedBookmarklet ? 'Đã copy code' : 'Copy Console Script'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl space-y-6 max-w-3xl mx-auto">
            <h2 className="text-xl font-bold text-white">Quy Trình Chuẩn Theo Hướng Dẫn</h2>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-white">1. Mở URL & Xử lý Popup</div>
                <p className="text-slate-400">Mở URL tab Reels (ví dụ: <code className="text-blue-300">profile.php?id=...&sk=reels_tab</code>). Đóng popup đăng nhập bằng nút <strong>X</strong> (`aria-label="Close"`) nếu xuất hiện.</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-white">2. Cuộn trang (Scroll / Lazy-load)</div>
                <p className="text-slate-400">Thực hiện cuộn thật qua container cuộn, chờ các placeholder tải xong để Facebook render thêm các video Reels.</p>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-white">3. Trích xuất & Xuất TXT</div>
                <p className="text-slate-400">Quét mọi thẻ <code className="text-blue-300">href="/reel/ID"</code>, loại bỏ trùng lặp và tải xuống file TXT hoàn chỉnh.</p>
              </div>
            </div>
          </div>
        )}

      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>© 2026 FB Profile Reels Extractor & TXT Exporter. 100% Precise Session-based Extraction.</p>
      </footer>
    </div>
  );
}
