'use client';
import { useState, useEffect, useRef } from 'react';
import { IMAGE_MODELS, IMAGE_RESOLUTIONS, MODEL_PRICING, IMAGE_PRESETS } from '@/lib/config';
import { isInPhotoshopPlugin, capturePSLayer, sendToPhotoshop, registerPSRequestHandler, initPSPluginBridge } from '@/lib/psPlugin';

const uploadToScdn = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('cdn_domain', 'cloudflareimg.cdn.sn');
  formData.append('outputFormat', 'auto');
  const response = await fetch('https://img.scdn.io/api/v1.php', { method: 'POST', body: formData });
  if (!response.ok) {
    let errorMsg = '上传失败';
    try { const ed = await response.json(); if (ed.message) errorMsg = ed.message; } catch (e) {}
    throw new Error(`上传图床失败: ${errorMsg}`);
  }
  const data = await response.json();
  if (!data.success) throw new Error(`上传图床失败: ${data.message || '未知错误'}`);
  return data.url;
};

type Task = {
  id: number; status: 'pending' | 'complete'; result: string[] | null; prompt: string;
  params?: { userId: string; provider: string; model: string; resolution: string; aspectRatio: string; count: number; referenceImages: {url: string, width: number, height: number}[] };
};

export default function ImagePage() {
const loadPersistedTasks = () => {
  try {
    const t = localStorage.getItem('imageTasks'); const n = localStorage.getItem('imageNextTaskId'); const a = localStorage.getItem('imageActiveTaskId');
    return { tasks: t ? JSON.parse(t) : [], nextTaskId: n ? parseInt(n) : 1, activeTaskId: a ? parseInt(a) : null };
  } catch { return { tasks: [], nextTaskId: 1, activeTaskId: null }; }
};
const initialTaskState = loadPersistedTasks();

const [userId, setUserId] = useState('');
const [prompt, setPrompt] = useState('');
const [provider, setProvider] = useState<string>('gpt-image-2');
const [model, setModel] = useState<string>('');
const [resolution, setResolution] = useState<string>('1024x1024');
const [aspectRatio, setAspectRatio] = useState<string>('auto');
const [count, setCount] = useState(1);
const [referenceImages, setReferenceImages] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
const [uploading, setUploading] = useState(false);
const [history, setHistory] = useState<Array<{time: number, images: string[], prompt: string}>>([]);
const [tasks, setTasks] = useState<Task[]>(initialTaskState.tasks);
const [activeTaskId, setActiveTaskId] = useState<number | null>(initialTaskState.activeTaskId);
const [nextTaskId, setNextTaskId] = useState<number>(initialTaskState.nextTaskId);
const mountedRef = useRef(true);
const referenceImagesRef = useRef(referenceImages);
const activeTaskRef = useRef<Task | null>(null);

useEffect(() => { referenceImagesRef.current = referenceImages; }, [referenceImages]);
useEffect(() => { activeTaskRef.current = tasks.find(t => t.id === activeTaskId) || null; }, [tasks, activeTaskId]);

useEffect(() => { initPSPluginBridge(); setIsPSPlugin(isInPhotoshopPlugin()); }, []);

// 从URL读取PS插件传来的参考图（支持query参数和hash）
useEffect(() => {
  const url = new URL(window.location.href);
  let psRef = url.searchParams.get('ps_ref');
  let psW = url.searchParams.get('ps_w');
  let psH = url.searchParams.get('ps_h');
  let psName = url.searchParams.get('ps_name');
  if (!psRef && window.location.hash.length > 1) {
    const hp = new URLSearchParams(window.location.hash.substring(1));
    psRef = hp.get('ps_ref'); psW = hp.get('ps_w'); psH = hp.get('ps_h'); psName = hp.get('ps_name');
  }
  if (psRef) {
    const w = parseInt(psW || '0'); const h = parseInt(psH || '0');
    setReferenceImages(prev => {
      if (prev.length >= 5) return prev;
      return [...prev, { file: new File([], psName || 'PS.png', { type: 'image/png' }), preview: psRef!, url: psRef!, width: w, height: h }];
    });
    window.history.replaceState(null, '', '/image');
  }
}, []);

useEffect(() => {
  const unregisterRef = registerPSRequestHandler('receiveReferenceImage', async (args: any[]) => {
    const [b64, w, h] = args;
    if (!b64) throw new Error('no data');
    const r = await fetch(b64); const b = await r.blob();
    const f = new File([b], `ps-${Date.now()}.png`, { type: 'image/png' });
    const url = await uploadToScdn(f);
    setReferenceImages(prev => [...prev, { file: f, preview: b64, url, width: w||0, height: h||0 }]);
    return { success: true };
  });
  const unregisterUrl = registerPSRequestHandler('receiveReferenceImageUrl', async (args: any[]) => {
    const [u, w, h] = args;
    if (!u) throw new Error('no url');
    setReferenceImages(prev => [...prev, { file: new File([], 'ps.png', {type:'image/png'}), preview: u, url: u, width: w||0, height: h||0 }]);
    return { success: true };
  });
  const unregisterGet = registerPSRequestHandler('getCurrentGeneratedImage', async () => {
    const at = activeTaskRef.current;
    if (at && at.result && at.result.length > 0) return { url: at.result[0] };
    return { url: null };
  });
  return () => { unregisterRef(); unregisterUrl(); unregisterGet(); };
}, []);

useEffect(() => { localStorage.setItem('imageTasks', JSON.stringify(tasks)); }, [tasks]);
useEffect(() => { localStorage.setItem('imageNextTaskId', nextTaskId.toString()); }, [nextTaskId]);
useEffect(() => { if (activeTaskId !== null) localStorage.setItem('imageActiveTaskId', activeTaskId.toString()); else localStorage.removeItem('imageActiveTaskId'); }, [activeTaskId]);
useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

const calcSize = (width: number, height: number, maxSide = 3840) => {
  let tw = width, th = height; const mx = Math.max(width, height);
  if (mx > maxSide) { const s = maxSide/mx; tw = Math.floor(width*s); th = Math.floor(height*s); }
  const a16 = (v:number) => Math.ceil(v/16)*16; tw = a16(tw); th = a16(th);
  const fm = Math.max(tw, th); if (fm > maxSide) { const s = maxSide/fm; tw = a16(Math.floor(tw*s)); th = a16(Math.floor(th*s)); }
  return { width: tw, height: th };
};
const getRes = (cm: string, ratio: string, refs: {width:number;height:number}[], cp?: string) => {
  if (ratio === 'auto') {
    if ((cp==='gpt-image-2'||cp==='gpt-image-2-stable') && refs.length>0) return `${refs[0].width}x${refs[0].height}`;
    if (refs.length>0) { const {width,height} = calcSize(refs[0].width, refs[0].height); return `${width}x${height}`; }
    const r = IMAGE_RESOLUTIONS[cm]||[]; return r[0]||'1024x1024';
  }
  const r = IMAGE_RESOLUTIONS[cm]||[];
  const M: Record<string,number> = {'1:1':0,'16:9':1,'9:16':2,'4:3':3,'3:4':4,'3:2':5,'2:3':6,'5:4':7,'4:5':8,'21:9':9,'9:21':10};
  const i = M[ratio]; return (i!==undefined && r[i]) ? r[i] : (r[0]||'1024x1024');
};

const dl = async (url: string, idx: number) => {
  try { const r = await fetch(url); const b = await r.blob(); const o = URL.createObjectURL(b); const l = document.createElement('a'); l.href=o; l.download=`img-${Date.now()}-${idx}.png`; document.body.appendChild(l); l.click(); document.body.removeChild(l); URL.revokeObjectURL(o); }
  catch { window.open(url,'_blank'); }
};

const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files; if (!files) return;
  const nf = Array.from(files).slice(0, 5 - referenceImages.length);
  setUploading(true);
  try {
    for (const f of nf) {
      const preview = URL.createObjectURL(f); const img = new Image(); img.src = preview;
      await new Promise(r => img.onload = r);
      const url = await uploadToScdn(f);
      setReferenceImages(prev => [...prev, { file: f, preview, url, width: img.naturalWidth, height: img.naturalHeight }]);
    }
  } catch (e: any) { alert(e.message); } finally { setUploading(false); }
  e.target.value = '';
};

const [isPSPlugin, setIsPSPlugin] = useState(false);
const [capturingLayer, setCapturingLayer] = useState(false);
const [sendingToPS, setSendingToPS] = useState<string|null>(null);

const handleSendToPS = async (imageUrl: string) => {
  setSendingToPS(imageUrl);
  try { const r = await sendToPhotoshop(imageUrl, { asSmartObject: true }); if (r.success) alert('已发送到Photoshop'); }
  catch (e: any) { alert('发送失败: '+(e.message||e)); } finally { setSendingToPS(null); }
};

useEffect(() => {
  const su = localStorage.getItem('userId'); if (su) setUserId(su);
  const sh = localStorage.getItem('imageHistory');
  if (sh) { try { const p = JSON.parse(sh); const td = new Date(); td.setHours(0,0,0,0); const f = p.filter((i:any)=>i.time>=td.getTime()); setHistory(f); if (f.length!==p.length) localStorage.setItem('imageHistory',JSON.stringify(f)); } catch(e){} }
  const mc = IMAGE_MODELS['gpt-image-2']; if (mc.models?.length) setModel(mc.models[0]);
}, []);

useEffect(() => { const mc = IMAGE_MODELS[provider]; if (mc.models?.length) setModel(mc.models[0]); }, [provider]);
useEffect(() => { if (model) setResolution(getRes(model, aspectRatio, referenceImages, provider)); }, [model, aspectRatio, referenceImages, provider]);

const activeTask = tasks.find(t => t.id === activeTaskId) || null;

const handleSubmit = async (e: any) => {
  if (e) e.preventDefault();
  if (!prompt.trim() || uploading) return;
  const taskId = nextTaskId;
  setTasks(prev => [...prev, { id: taskId, status: 'pending', result: null, prompt, params: { userId, provider, model, resolution, aspectRatio, count, referenceImages: referenceImages.map(i=>({url:i.url,width:i.width,height:i.height})) } }]);
  setNextTaskId(prev => prev + 1); setActiveTaskId(taskId);
  (async () => {
    try {
      const fm = `${provider}-${model}`; let far = aspectRatio;
      if (aspectRatio === 'auto' && referenceImages.length > 0) {
        const ir = referenceImages[0].width/referenceImages[0].height; let bm='1:1'; let md=Infinity;
        const rs=[{r:1/1,v:'1:1'},{r:16/9,v:'16:9'},{r:9/16,v:'9:16'},{r:4/3,v:'4:3'},{r:3/4,v:'3:4'},{r:3/2,v:'3:2'},{r:2/3,v:'2:3'},{r:5/4,v:'5:4'},{r:4/5,v:'4:5'},{r:21/9,v:'21:9'},{r:9/21,v:'9:21'}];
        for(const x of rs){const d=Math.abs(ir-x.r);if(d<md){md=d;bm=x.v;}} far=bm;
      }
      const fs = getRes(model, aspectRatio, referenceImages, provider);
      const body: any = { userId, model: fm, prompt, size: fs, aspectRatio: far, n: count };
      if (referenceImages.length>0) body.image = referenceImages.map(i=>i.url);
      if ((provider==='gpt-image-2'||provider==='gpt-image-2-stable') && aspectRatio==='auto' && referenceImages.length>0) body.useReferenceSize = true;
      const resp = await fetch('/api/image', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await resp.json();
      if (data.error) { alert(data.error); if (mountedRef.current) setTasks(prev=>prev.filter(t=>t.id!==taskId)); return; }
      if (mountedRef.current) setTasks(prev=>prev.map(t=>t.id===taskId?{...t,status:'complete',result:data.imageUrls}:t));
      const nr = { time: Date.now(), images: data.imageUrls, prompt };
      setHistory(prev=>{const nh=[nr,...prev];localStorage.setItem('imageHistory',JSON.stringify(nh));return nh;});
    } catch(e:any) { alert(e.message); if(mountedRef.current) setTasks(prev=>prev.filter(t=>t.id!==taskId)); }
  })();
};

const handlePresetClick = async (preset: typeof IMAGE_PRESETS[0]) => {
  if (referenceImages.length === 0) { alert('请先上传您的照片'); return; }
  setPrompt(preset.prompt); await handleSubmit(null);
};

const currentPricing = MODEL_PRICING[`${provider}-${model}`];
const availableModels = IMAGE_MODELS[provider]?.models || [];

return (
<div className="min-h-screen bg-white" style={{ backgroundImage:'radial-gradient(#e5e7eb 1px,transparent 1px)', backgroundSize:'20px 20px' }}>
<div className="max-w-6xl mx-auto px-4 py-8">
<div className="text-center mb-8"><h1 className="text-3xl font-bold text-gray-900 mb-2">AI 绘图</h1><p className="text-gray-500">输入提示词，生成精美的图片</p></div>
<div className="flex flex-col md:flex-row gap-6">
<div className="w-full md:w-64 flex-shrink-0">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
<h3 className="text-sm font-semibold text-gray-700 mb-4">绘图设置</h3>
<div className="space-y-4">
<div><label className="block text-xs font-medium text-gray-500 mb-2">模型厂商</label>
<select value={provider} onChange={e=>setProvider(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
{Object.keys(IMAGE_MODELS).map(p=>(<option key={p} value={p}>{p==='gpt-image-2-stable'?'gpt-image-2（稳定）':p==='nano-banana-2-stable'?'nano-banana-2（稳定）':p}</option>))}
</select></div>
<div><label className="block text-xs font-medium text-gray-500 mb-2">模型</label>
<select value={model} onChange={e=>setModel(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
{availableModels.map(m=>(<option key={m} value={m}>{m}</option>))}
</select></div>
{IMAGE_MODELS[provider]?.note && (<div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2"><p className="text-xs text-blue-700">{IMAGE_MODELS[provider].note}</p></div>)}
<div><label className="block text-xs font-medium text-gray-500 mb-2">绘图比例</label>
<select value={aspectRatio} onChange={e=>setAspectRatio(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
<option value="auto">默认自动</option><option value="1:1">1:1</option><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="4:3">4:3</option><option value="3:4">3:4</option><option value="3:2">3:2</option><option value="2:3">2:3</option><option value="5:4">5:4</option><option value="4:5">4:5</option><option value="21:9">21:9</option><option value="9:21">9:21</option>
</select></div>
<div><label className="block text-xs font-medium text-gray-500 mb-2">单次出图数量</label>
<select value={count} onChange={e=>setCount(Number(e.target.value))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
<option value={1}>1张</option><option value={2}>2张</option><option value={3}>3张</option><option value={4}>4张</option>
</select></div>
<div className="pt-3 border-t border-gray-100"><div className="text-xs text-gray-500"><div className="flex justify-between"><span>单次价格</span><span className="font-medium text-gray-700">{((currentPricing?.input||0)*count).toFixed(2)} 积分</span></div></div></div>
{tasks.length>0&&(<div className="pt-3 border-t border-gray-100"><h3 className="text-xs font-medium text-gray-500 mb-2">生成任务</h3><div className="flex gap-2 flex-wrap">
{tasks.map(task=>(<div key={task.id} className="relative group">
<button onClick={()=>setActiveTaskId(task.id)} className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${activeTaskId===task.id?'bg-yellow-500 text-white':task.status==='pending'?'bg-gray-100 text-gray-500':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
{task.status==='pending'?<div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>:task.id}
</button>
<button onClick={e=>{e.stopPropagation();setTasks(prev=>{const r=prev.filter(t=>t.id!==task.id);if(activeTaskId===task.id){if(r.length>0)setActiveTaskId(r[0].id);else setActiveTaskId(null);}return r;});}} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">×</button>
</div>))}
</div></div>)}
</div></div></div>
<div className="flex-1">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
{activeTask?(<>
{activeTask.result?(<>
<div className={`grid ${activeTask.result.length===1?'grid-cols-1':'grid-cols-2'} gap-4 w-full h-full overflow-auto p-4`}>
{activeTask.result.map((url,index)=>(<div key={index} className="relative group">
<img src={url} alt={`Generated ${index+1}`} className="w-full h-auto object-contain rounded-lg" />
<div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
<button onClick={()=>dl(url,index)} className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 text-sm">下载</button>
{isPSPlugin&&(<button onClick={()=>handleSendToPS(url)} disabled={sendingToPS===url} className="bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 text-sm disabled:opacity-50">{sendingToPS===url?'发送中...':'发送到PS'}</button>)}
</div></div>))}
</div>
<div className="absolute bottom-4 right-4 flex gap-2">
<button onClick={()=>{activeTask.result!.forEach((u,i)=>dl(u,i));}} className="bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 flex items-center gap-2 shadow-sm">批量下载</button>
{isPSPlugin&&(<button onClick={()=>{if(activeTask.result)activeTask.result.forEach((u,i)=>setTimeout(()=>handleSendToPS(u),i*500));}} disabled={!!sendingToPS} className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 flex items-center gap-2 shadow-sm disabled:opacity-50">全部发送到PS</button>)}
</div></>
):(<div className="text-gray-500"><div className="flex flex-col items-center"><div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p>生成中...</p></div></div>)}
</>):(
<div className="flex flex-col items-center text-gray-400">
<div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4"><svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z"/></svg></div>
<p>生成的图片将显示在这里</p></div>)}
</div>
{referenceImages.length>0&&(
<div className="mb-4"><label className="block text-xs font-medium text-gray-500 mb-2">参考图 ({referenceImages.length}/5)</label><div className="flex gap-3 flex-wrap">
{referenceImages.map((img,index)=>(<div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
<img src={img.preview} alt={`参考图${index+1}`} className="w-full h-full object-cover" />
<button type="button" onClick={()=>setReferenceImages(prev=>prev.filter((_,i)=>i!==index))} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">×</button>
<span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5">图{index+1}</span>
</div>))}
</div></div>)}
{referenceImages.length<5&&(
<div className="mb-4"><label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400 transition-colors">
<div className="flex items-center gap-2 text-gray-500 text-sm">
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z"/></svg>
{uploading?<><div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>正在上传...</>:'上传参考图（最多5张，可多选）'}
</div>
<input type="file" accept="image/*" multiple className="hidden" onChange={handleReferenceUpload} disabled={uploading} />
</label></div>)}
<form onSubmit={handleSubmit} className="relative">
<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="尽量详细的描述您想要的图片" rows={3} className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none" />
<button type="submit" disabled={!prompt.trim()||uploading} className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50">生成图片</button>
</form>
</div>
<div className="w-full md:w-56 flex-shrink-0">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
<h3 className="text-sm font-semibold text-gray-700 mb-4">一键预设</h3>
<div className="space-y-3">
{IMAGE_PRESETS.map(preset=>(<button key={preset.name} type="button" onClick={()=>handlePresetClick(preset)} disabled={uploading} className="w-full text-left px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm hover:bg-yellow-100 disabled:opacity-50">{preset.name}</button>))}
</div><p className="text-xs text-gray-500 mt-4">提示：使用一键功能前，请先上传您的照片</p>
</div></div>
</div>
{history.length>0&&(
<div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
<h3 className="text-lg font-semibold text-gray-900 mb-4">今日生成记录</h3>
<div className="space-y-4">
{history.map((record,ri)=>(<div key={record.time} className="border border-gray-100 rounded-xl p-4">
<div className="flex justify-between items-center mb-3"><div><p className="text-sm text-gray-500">{new Date(record.time).toLocaleTimeString()}</p><p className="text-sm text-gray-700 truncate max-w-md">提示词：{record.prompt}</p></div>
<button onClick={()=>{record.images.forEach((u,i)=>dl(u,i));}} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 text-sm">下载该组全部</button></div>
<div className="flex gap-3 flex-wrap">
{record.images.map((u,ii)=>(<div key={ii} className="relative group w-24 h-24"><img src={u} alt="" className="w-full h-full object-cover rounded-lg"/>
<button onClick={()=>dl(u,ii)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-lg">下载</button></div>))}
</div></div>))}
</div></div>)}
</div></div>
);
}