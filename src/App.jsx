import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, Image as ImageIcon, ShieldCheck, AlertTriangle, 
  XCircle, RefreshCw, Star, ArrowRight, ChevronLeft, 
  Zap, History, Info, Search
} from 'lucide-react';

// Mengambil API Key dari Environment Variables dengan aman untuk menghindari error target kompilasi ES2015
const getApiKey = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env.VITE_GEMINI_API_KEY || "";
    }
  } catch (e) {
    // Fallback jika lingkungan kompilator tidak mendukung metadata impor statis
  }
  return "";
};

const apiKey = getApiKey();

const App = () => {
  const [step, setStep] = useState('home'); // Berpindah halaman: home, camera, preview, analyzing, result
  const [imageSource, setImageSource] = useState(null); // Menyimpan base64 data foto
  const [analysisResult, setAnalysisResult] = useState(null); // Menyimpan hasil JSON dari Gemini
  const [isFlashOn, setIsFlashOn] = useState(false); // Status flash/lampu kamera (jika didukung)
  const [cameraError, setCameraError] = useState(null); // Status error hardware kamera
  const [appError, setAppError] = useState(null); // Notifikasi banner error dynamic di atas layar
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Menghentikan aliran kamera dengan aman untuk menghemat baterai HP
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Menginisialisasi kamera belakang (environment) perangkat
  const openCamera = async () => {
    setCameraError(null);
    setAppError(null);
    setStep('camera');
    setTimeout(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment', width: 1280, height: 720 } 
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setCameraError("Izin kamera ditolak atau kamera tidak ditemukan pada perangkat Anda.");
        setTimeout(() => setStep('home'), 3000);
      }
    }, 100);
  };

  // Mengambil gambar dari frame video kamera
  const handleCapture = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!video || !canvas) return;
    const context = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.8);
    setImageSource(data);
    stopCamera();
    setStep('preview');
  };

  // Membaca file gambar dari galeri HP
  const handleGallery = (e) => {
    setAppError(null);
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSource(reader.result);
        setStep('preview');
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async () => {
    if (!apiKey) {
      setAppError("API Key belum dikonfigurasi. Harap masukkan VITE_GEMINI_API_KEY di Environment Variables Vercel Anda.");
      setStep('home');
      return;
    }

    setStep('analyzing');
    setAppError(null);
    const base64Content = imageSource.split(',')[1];

    // Prompt spesifik dalam format JSON terstruktur untuk diproses oleh Gemini 3.5 Flash
    const prompt = `Analisis gambar ini dengan instruksi spesifik:
    1. Identifikasi apakah objek ini: Makanan, Minuman, Kosmetik, Restoran, atau Produk Umum/Lainnya.
    2. Jika objek adalah Makanan, Minuman, Kosmetik, atau Restoran: 
       - Tentukan status: Halal, Muslim Friendly, atau Haram.
       - Berikan alasan berdasarkan bahan/reputasi.
       - Berikan 2 rekomendasi alternatif yang halal dan populer di Jepang.
       - Set "isHalalContext": true.
    3. Jika objek BUKAN kategori di atas (misal: elektronik, otomotif, pemandangan, benda mati lainnya):
       - Berikan penjelasan/deskripsi produk secara umum saja.
       - Set "isHalalContext": false.
    
    Gunakan format JSON murni tanpa markdown pembungkus: { 
      "category": "makanan|minuman|kosmetik|restoran|umum", 
      "productName": "Nama Produk Terdeteksi", 
      "isHalalContext": true|false,
      "status": "Halal|Muslim Friendly|Haram", 
      "level": "1-3", 
      "color": "green|yellow|red|blue", 
      "description": "Deskripsi umum produk jika isHalalContext false",
      "analysis": ["poin analisis bahan 1", "poin analisis bahan 2"], 
      "recommendations": ["alternatif halal 1", "alternatif halal 2"] 
    }`;

    try {
      // Menggunakan model Gemini terbaru tahun 2026: gemini-3.5-flash
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Content } }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        let parsedErr;
        try {
          parsedErr = JSON.parse(errBody);
        } catch (e) {
          parsedErr = null;
        }
        
        const detailMessage = parsedErr?.error?.message || response.statusText || "Error tidak diketahui";
        throw new Error(`Google API: ${detailMessage} (Code: ${response.status})`);
      }

      const result = await response.json();
      const rawText = result.candidates[0].content.parts[0].text;
      const data = JSON.parse(rawText);
      setAnalysisResult(data);
      setStep('result');
    } catch (error) {
      console.error("Analysis error: ", error);
      setStep('home');
      setAppError(`Gagal menganalisis gambar. Detail Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100 overflow-x-hidden">
      {step !== 'camera' && (
        <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 sticky top-0 z-40 flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 p-1.5 rounded-lg shadow-sm">
              <ShieldCheck className="text-white" size={20} />
            </div>
            <span className="font-bold text-slate-800">HalalPartner</span>
          </div>
          <button className="p-2 text-slate-400" onClick={() => setStep('home')} aria-label="Riwayat">
            <History size={20} />
          </button>
        </nav>
      )}

      <main className="max-w-md mx-auto min-h-[calc(100vh-64px)] pb-12">
        {/* Banner Dynamic Notification Error */}
        {appError && (
          <div className="mx-6 mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-800 animate-in fade-in slide-in-from-top-2 duration-300">
            <XCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
            <div className="text-xs space-y-1 text-left">
              <p className="font-bold">Sistem Menolak Permintaan</p>
              <p className="opacity-95 leading-relaxed">{appError}</p>
            </div>
          </div>
        )}

        {}
        {step === 'home' && (
          <div className="p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="pt-4 text-left">
              <h2 className="text-3xl font-black text-slate-900 leading-tight">Halo! Apa yang ingin <span className="text-emerald-600">Anda Cek?</span></h2>
              <p className="text-slate-500 mt-2 text-sm">Pilih cara untuk memasukkan gambar produk atau restoran.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={openCamera}
                className="group bg-white p-6 rounded-[2rem] border-2 border-transparent hover:border-emerald-500 shadow-sm transition-all flex items-center gap-6"
              >
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Camera size={32} />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-lg">Ambil Foto</h3>
                  <p className="text-xs text-slate-400">Gunakan kamera langsung</p>
                </div>
              </button>

              <button 
                onClick={() => fileInputRef.current.click()}
                className="group bg-white p-6 rounded-[2rem] border-2 border-transparent hover:border-blue-500 shadow-sm transition-all flex items-center gap-6"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <ImageIcon size={32} />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-lg">Dari Galeri</h3>
                  <p className="text-xs text-slate-400">Pilih foto dari perangkat</p>
                </div>
              </button>
              <input type="file" ref={fileInputRef} onChange={handleGallery} accept="image/*" className="hidden" />
            </div>
          </div>
        )}

        {}
        {step === 'camera' && (
          <div className="fixed inset-0 bg-black z-50 flex flex-col">
            <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center z-10">
              <button onClick={() => {stopCamera(); setStep('home');}} className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center text-white"><ChevronLeft /></button>
              <button onClick={() => setIsFlashOn(!isFlashOn)} className={`w-10 h-10 rounded-full flex items-center justify-center ${isFlashOn ? 'bg-amber-400 text-black' : 'bg-white/10 text-white'}`}><Zap size={20} /></button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              {cameraError ? (
                <div className="h-full flex items-center justify-center p-10 text-white text-center">{cameraError}</div>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-white/30 rounded-3xl relative">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400 animate-[scan_2s_infinite]"></div>
                </div>
              </div>
            </div>
            <div className="bg-black p-10 flex justify-center items-center">
              <button onClick={handleCapture} className="w-20 h-20 rounded-full border-4 border-white p-1"><div className="w-full h-full bg-white rounded-full"></div></button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        {}
        {step === 'preview' && (
          <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <button onClick={() => setStep('home')} className="text-slate-500 flex items-center gap-2 font-bold text-sm"><ChevronLeft size={18}/> Ganti Foto</button>
            <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-200">
              <img src={imageSource} alt="Preview" className="w-full h-64 object-cover rounded-[2rem]" />
              <div className="p-4 text-center space-y-4">
                <h3 className="font-bold text-xl">Foto Siap Menganalisis</h3>
                <p className="text-sm text-slate-400">Pastikan gambar terlihat jelas untuk hasil yang maksimal.</p>
                <button 
                  onClick={startAnalysis}
                  className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-emerald-200 active:scale-95 transition-transform"
                >
                  Mulai Analisis
                </button>
              </div>
            </div>
          </div>
        )}

        {}
        {step === 'analyzing' && (
          <div className="h-[80vh] flex flex-col items-center justify-center p-10 animate-pulse">
            <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mb-6">
              <RefreshCw className="text-emerald-600 animate-spin" size={40} />
            </div>
            <h3 className="text-xl font-black">AI Gemini 3.5 Sedang Bekerja...</h3>
            <p className="text-slate-400 text-sm mt-2 text-center">Menghubungkan ke server Google Gemini 3.5 Flash untuk mendeteksi bahan produk secara instan.</p>
          </div>
        )}

        {}
        {step === 'result' && analysisResult && (
          <div className="p-5 space-y-6 animate-in slide-in-from-bottom-8 duration-500">
            <button onClick={() => setStep('home')} className="flex items-center gap-2 text-slate-500 font-bold text-sm"><ChevronLeft size={18} /> Beranda</button>

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200 overflow-hidden border border-slate-100">
              {analysisResult.isHalalContext ? (
                <div className={`p-8 flex flex-col items-center text-center gap-4 ${
                  analysisResult.color === 'green' ? 'bg-emerald-600 text-white' : 
                  analysisResult.color === 'yellow' ? 'bg-amber-500 text-white' : 'bg-rose-600 text-white'
                }`}>
                  <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md">
                    {analysisResult.color === 'green' ? <ShieldCheck size={40} /> : <AlertTriangle size={40} />}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black">{analysisResult.status}</h2>
                    <span className="text-[10px] font-bold uppercase tracking-widest bg-black/10 px-3 py-1 rounded-full">Kategori {analysisResult.category}</span>
                  </div>
                </div>
              ) : (
                <div className="p-8 bg-slate-800 text-white flex flex-col items-center text-center gap-4">
                  <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                    <Info size={40} />
                  </div>
                  <h2 className="text-2xl font-black italic">Informasi Produk</h2>
                </div>
              )}

              <div className="p-8 space-y-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">Nama Objek</p>
                  <h3 className="text-2xl font-bold text-slate-800 text-left">{analysisResult.productName}</h3>
                </div>

                {analysisResult.isHalalContext ? (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b pb-1 text-left">Analisis Detail</p>
                      {analysisResult.analysis.map((point, idx) => (
                        <div key={idx} className="flex gap-3 text-sm text-slate-600 text-left">
                          <span className="font-bold text-emerald-600">{idx + 1}.</span>
                          <p>{point}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3 pt-2">
                      <h4 className="text-sm font-bold flex items-center gap-2 text-left">
                        <Star className="text-amber-400" size={16} fill="currentColor" /> Rekomendasi Alternatif Halal
                      </h4>
                      {analysisResult.recommendations.map((rec, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-700">{rec}</span>
                          <ArrowRight size={14} className="text-slate-300" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b pb-1 text-left">Deskripsi Umum</p>
                    <p className="text-slate-600 leading-relaxed text-sm text-left">{analysisResult.description || (analysisResult.analysis && analysisResult.analysis[0])}</p>
                    <div className="bg-blue-50 p-4 rounded-2xl flex gap-3 items-start border border-blue-100 text-left">
                      <Search className="text-blue-500 mt-1 shrink-0" size={18} />
                      <p className="text-xs text-blue-700 italic">Produk ini terdeteksi sebagai kategori non-konsumsi umum. Tidak memerlukan analisis status kehalalan.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => setStep('home')} className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black shadow-xl shadow-slate-200 active:scale-95 transition-transform">
              Selesai
            </button>
          </div>
        )}
      </main>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default App;