"use client";

import { useEffect, useState, useRef } from "react";

interface TrafficImage {
  dataUrl: string;
  typeCode?: string | null;
  phaseIndex?: number | null;
}
interface PhaseInfo {
  phase: string;
  phaseIndex: number;
  typeCode?: string;
  remainingSeconds: number;
}

export default function TrafficLivePage() {
  const [pdfUrl, setPdfUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<TrafficImage[]>([]);
  const [typeMap, setTypeMap] = useState<any>({});
  const [scheduleMap, setScheduleMap] = useState<any>({});
  const [phase, setPhase] = useState<PhaseInfo | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const imageRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    const id = params.get("id");
    const PDF_BASE = "https://www.ttcx.dot.gov.taipei/cpt/api/TimingPlan/pdf/";
    const finalUrl = url ?? (id ? `${PDF_BASE}${id}` : null);
    if (!finalUrl) {
      setLoading(false);
      return;
    }
    setPdfUrl(finalUrl);
    setLoading(true);

    (async () => {
      try {
  const res = await fetch(`/api/extract/node?url=${encodeURIComponent(finalUrl as string)}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setTypeMap(json.typeMap ?? {});
        setScheduleMap(json.scheduleMap ?? {});
        setImages((json.images ?? []) as TrafficImage[]);
      } catch (err) {
        console.error("extract failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!Object.keys(scheduleMap).length) return;
    const t = setInterval(() => {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const ss = now.getSeconds().toString().padStart(2, "0");
      const timeStr = `${hh}:${mm}:${ss}`;
      const day = now.getDay() === 0 ? 7 : now.getDay();
      const info = getPhaseAndRemainingSeconds(timeStr, day, typeMap, scheduleMap);
      setPhase(info);
    }, 1000);
    return () => clearInterval(t);
  }, [typeMap, scheduleMap]);

  // Scroll the current phase image into view on desktop
  useEffect(() => {
    if (!phase) return;
    if (!phase.typeCode) return;
    if (isMobile) return;
            const imgsOfType = images.filter((img) => img.typeCode === phase.typeCode).sort((a, b) => (a.phaseIndex ?? 0) - (b.phaseIndex ?? 0));
            const currentIdx = imgsOfType.findIndex((im) => im.phaseIndex === phase.phaseIndex);
            const n = imgsOfType.length;
            const targetIdx = Math.floor(n / 2);
            const rotateBy = ((currentIdx - targetIdx) % n + n) % n; // left rotation amount
            const rotated = imgsOfType.slice(rotateBy).concat(imgsOfType.slice(0, rotateBy));
            const key = `${phase.typeCode}-${phase.phaseIndex}`;
    const el = imageRefs.current[key];
    if (el && typeof (el as any).scrollIntoView === "function") {
      try {
        (el as any).scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      } catch {}
    }
  }, [phase, isMobile]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!pdfUrl) return <div className="p-6 text-red-600">Missing ?url= parameter</div>;
  if (!phase) return <div className="p-6">No phase info yet</div>;

  // Try to find best matching image:
  // 1) Prefer image that has been assigned the same typeCode and phaseIndex (most reliable)
  // 2) Else fall back to searching page OCR text for the phase label
  // 3) Else use a simple phaseIndex-based selection across images
  let match = null as TrafficImage | null;
  if (phase.typeCode) {
    match = images.find((i) => (i as any).typeCode === phase.typeCode && (i as any).phaseIndex === phase.phaseIndex) ?? null;
  }

  if (!match) {
    // fallback: try to find an image whose typeCode or phaseIndex or dataUrl includes the phase label
    // (previously we used OCR text; now that text is not exposed, we use a conservative fallback)
    match = images.find((i) => (i.typeCode && i.typeCode.includes(phase.phase)) || (i.phaseIndex === phase.phaseIndex)) ?? null;
  }

  if (!match && images.length > 0) {
    const idx = Math.max(0, (phase.phaseIndex - 1) % images.length);
    match = images[idx];
  }

  return (
    <main className="min-h-screen flex items-start justify-center bg-gray-50 p-6">
      <div className="bg-white shadow rounded-lg p-6 w-full max-w-7xl text-center">
        <h2 className="text-xl font-semibold mb-2">Traffic Live Viewer</h2>
        <p className="text-sm text-gray-500 mb-4">{pdfUrl}</p>

        <div className="mb-4">
          <div className="text-2xl font-bold text-green-600">{phase.phase}</div>
          <div className="text-sm text-gray-700">分相 {phase.phaseIndex}</div>
          <div className="text-sm text-gray-500">剩餘 {phase.remainingSeconds}s</div>
        </div>

        <div className="mt-4">
          {match ? (
            <img src={match.dataUrl} alt={match.typeCode ?? "phase-image"} className="mx-auto rounded shadow max-w-full" />
          ) : (
            <div className="text-gray-400 italic">No image found</div>
          )}
        </div>

        <div className="mt-6 text-xs text-gray-400">
          Images: {images.length} · Types: {Object.keys(typeMap ?? {}).length}
        </div>
        {/* Phase images grouped by type */}
        <div className="mt-6 text-left">
          <h3 className="text-sm font-medium mb-2">Phase images</h3>

          <div className="flex flex-col gap-3">
            {Object.entries(images.reduce((acc: Record<string, TrafficImage[]>, img) => {
              const k = img.typeCode ?? "—";
              (acc[k] = acc[k] || []).push(img);
              return acc;
            }, {})).map(([type, imgs]) => (
              <div key={type} className="flex flex-col sm:flex-row sm:items-center gap-3 p-2 rounded border border-gray-200">
                <div className="w-full sm:w-24 text-sm font-medium">{type}</div>
                <div className="flex flex-row flex-wrap gap-2">
                  {imgs.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img.dataUrl} alt={`type-${type}-idx-${i}`} className="w-14 h-14 object-contain rounded" />
                      <div className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] px-1 rounded">{img.phaseIndex ?? (i+1)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Current-type display: show all phase images of the current type, center current + fade others */}
        <div className="mt-6 text-left">
          <h3 className="text-sm font-medium mb-2">Current type phases</h3>
          {phase.typeCode ? (
            (() => {
                const imgsOfType = images.filter((img) => img.typeCode === phase.typeCode).sort((a, b) => (a.phaseIndex ?? 0) - (b.phaseIndex ?? 0));
                const currentIdx = imgsOfType.findIndex((im) => im.phaseIndex === phase.phaseIndex);
                const n = imgsOfType.length;
                const targetIdx = Math.floor(n / 2);
                const rotateBy = ((currentIdx - targetIdx) % n + n) % n; // left rotation amount
                const rotated = imgsOfType.slice(rotateBy).concat(imgsOfType.slice(0, rotateBy));
              if (isMobile) {
                const currentIdx = imgsOfType.findIndex((im) => im.phaseIndex === phase.phaseIndex);
                const current = imgsOfType[currentIdx] ?? null;
                const next = imgsOfType[currentIdx + 1] ?? null;
                return (
                  <div className="flex flex-col items-center gap-3">
                    {current ? <img src={current.dataUrl} className="w-36 h-36 object-contain rounded shadow" alt="current" /> : <div className="text-gray-500">No current</div>}
                    {next ? <img src={next.dataUrl} className="w-28 h-28 object-contain rounded opacity-70" alt="next" /> : null}
                  </div>
                );
              }

              return (
                <div className="w-full overflow-x-auto">
                  <div className="flex items-center gap-4 px-4 w-max mx-auto snap-x snap-mandatory" style={{ minWidth: 240 }}>
                      {rotated.map((im) => {
                      const isCurrent = im.phaseIndex === phase.phaseIndex;
                      const key = `${im.typeCode}-${im.phaseIndex}`;
                      return (
                        <div key={key} className="flex-shrink-0 snap-center" ref={(el) => { imageRefs.current[key] = el; }}>
                          <img src={im.dataUrl} className={`rounded shadow transform transition-all duration-300 ${isCurrent ? "w-56 h-56 scale-105 opacity-100" : "w-28 h-28 opacity-50"}`} alt={`phase-${key}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="text-gray-500">No type info for current phase</div>
          )}
        </div>
      </div>
    </main>
  );
}

/* Phase calculator (same logic you used) */
function getPhaseAndRemainingSeconds(
  time: string,
  dayOfWeek: number,
  typeMap: any,
  scheduleMap: any
): PhaseInfo {
  const schedule = scheduleMap[dayOfWeek];
  if (!schedule || schedule.length === 0)
    return { phase: "", phaseIndex: -1, remainingSeconds: 0 };

  let currentType = schedule[0].type;
  for (const s of schedule) {
    if (time >= s.time) currentType = s.type;
    else break;
  }

  const type = typeMap[currentType];
  if (!type) return { phase: "", phaseIndex: -1, remainingSeconds: 0 };

  const [h, m, s] = time.split(":").map(Number);
  const totalSeconds = h * 3600 + m * 60 + (s || 0);

  // find when this type started (last schedule entry with same type)
  const lastEntry = [...schedule].reverse().find((e: any) => e.type === currentType);
  const [startH, startM] = (lastEntry?.time ?? "00:00").split(":").map(Number);
  const startSec = startH * 3600 + startM * 60;

  const elapsed = ((totalSeconds - startSec - (type.offset ?? 0)) % (type.period || 1) + (type.period || 1)) % (type.period || 1);

  let sum = 0;
  for (let i = 0; i < (type.phaseDurations || []).length; i++) {
    sum += type.phaseDurations[i];
    if (elapsed < sum) return { phase: type.phase ?? "", phaseIndex: i + 1, typeCode: currentType, remainingSeconds: sum - elapsed };
  }

  return { phase: type.phase ?? "", phaseIndex: (type.phaseDurations || []).length, typeCode: currentType, remainingSeconds: 0 };
}
