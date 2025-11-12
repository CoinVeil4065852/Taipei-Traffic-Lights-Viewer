"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Box from "@mui/joy/Box";
import Sheet from "@mui/joy/Sheet";
import Button from "@mui/joy/Button";
import Stack from "@mui/joy/Stack";
import Typography from "@mui/joy/Typography";
import { TrafficLightTimings, TrafficLightSchedule } from "@/lib/trafficParser";

interface TrafficImage {
  dataUrl: string;
  typeCode?: string | null;
  phaseIndex?: number | null;
}

interface PhaseInfo {
  phaseType: string;
  phaseIndex: number;//zero-based
  remainingSeconds: number;
}

export default function TrafficPage() {

  const router = useRouter();

  const [fileURL, setFileURL] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<TrafficImage[]>([]);
  const [imagesByType, setImagesByType] = useState<Record<string, string[]>>({});
  const [timingMap, setTimingMap] = useState<Record<string, TrafficLightTimings>>({});
  const [scheduleMap, setScheduleMap] = useState<TrafficLightSchedule>({});
  const [phase, setPhase] = useState<PhaseInfo | null>(null);

  const imageRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const url = useSearchParams().get("url");
    const id = useSearchParams().get("id");
    if (url) setFileURL(url);
    else if (id) setFileURL(id);
  }, []);


  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      if (!fileURL) {
        setError("Missing ?url= or ?id= parameter");
        setLoading(false);
        return;
      }
      const apiUrl = `/api/extract/node?url=${encodeURIComponent(fileURL)}`
      try {
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`Extractor returned ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error || "Unknown extractor error");
        setTimingMap(json.timingMap ?? {});
        setScheduleMap(json.scheduleMap ?? {});

        // Support two image formats from the API.
        // Legacy: images is an array of { dataUrl, typeCode, phaseIndex }
        // New: images is an object { typeCode: [dataUrl1, dataUrl2, ...], ... }
        const imgsOut: TrafficImage[] = [];
        const grouped: Record<string, string[]> = {};
        if (json.images) {
          if (Array.isArray(json.images)) {
            for (const it of json.images) {
              imgsOut.push({ dataUrl: it.dataUrl, typeCode: it.typeCode, phaseIndex: it.phaseIndex });
              const k = String(it.typeCode ?? "unknown").toUpperCase().trim();
              (grouped[k] = grouped[k] || []).push(String(it.dataUrl));
            }
          } else if (typeof json.images === "object") {
            // api returns grouped data URLs: { typeCode: [dataUrl1, dataUrl2, ...] }
            for (const [type, arr] of Object.entries(json.images)) {
              if (!Array.isArray(arr)) continue;
              const k = String(type ?? "unknown").toUpperCase().trim();
              grouped[k] = arr.map((d) => String(d));
              for (const dataUrl of arr) {
                imgsOut.push({ dataUrl: String(dataUrl), typeCode: type, phaseIndex: null });
              }
            }
          }
        }

        setImages(imgsOut);
        setImagesByType(grouped);
      } catch (err: any) {
        setError(String(err.message || err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [fileURL]);

  // phase updater
  useEffect(() => {
    if (!scheduleMap || Object.keys(scheduleMap).length === 0) return;

    const tick = () => {
      const now = new Date();
      const hh = now.getHours().toString().padStart(2, "0");
      const mm = now.getMinutes().toString().padStart(2, "0");
      const ss = now.getSeconds().toString().padStart(2, "0");
      const timeStr = `${hh}:${mm}:${ss}`;
      const day = now.getDay() === 0 ? 7 : now.getDay();
      const info = computeCurrentPhase(timeStr, day, timingMap, scheduleMap);
      setPhase(info);
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [timingMap, scheduleMap]);

  // compute displayed images: if API provided grouped images, use imagesByType
  // otherwise fall back to the previous orderedImages logic
  /**
   * Select images to display for a given computed phase.
   * - Prefer grouped images by the schedule-selected typeCode (phase.typeCode).
   * - Use phase.phaseIndex (1-based) to choose the current image within the group.
   * - If grouped images are missing, fall back to the flattened `images` array
   *   and try to find candidates by matching typeCode, then phaseIndex, then any.
   */
  function selectImagesForPhase(
    phase: PhaseInfo,
    imagesByType: Record<string, string[]>,
    flatImages: TrafficImage[]
  ): Array<{ dataUrl: string; typeCode?: string | null; originalIndex: number; isCurrent: boolean }> {
    if (!phase) return [];

    const typeKey = String(phase.phaseType ?? "").toUpperCase().trim();

    // If grouped images exist for this type, use them directly.
    const grouped = imagesByType[typeKey];
    if (grouped && grouped.length > 0) {
      const n = grouped.length;
      let idx = 0;
      if (phase.phaseIndex != null && Number.isFinite(Number(phase.phaseIndex))) {
        idx = Math.max(0, Math.min(n - 1, Number(phase.phaseIndex) - 1));
      }

      // Rotate so the chosen index is centered in the returned array.
      const startPos = (idx - Math.floor(n / 2) + n) % n;
      const rotated = grouped.slice(startPos).concat(grouped.slice(0, startPos));

      return rotated.map((dataUrl, i) => {
        const originalIndex = (startPos + i) % n;
        return { dataUrl, typeCode: typeKey, originalIndex, isCurrent: originalIndex === idx };
      });
    }

    // Fallback: use flattened images. Prefer same typeCode, then matching phaseIndex.
    const mapped = flatImages.map((img) => ({ img, tc: String(img.typeCode ?? "").toUpperCase().trim(), pi: img.phaseIndex != null ? Number(img.phaseIndex) : null }));

    let candidates = mapped.filter((m) => m.tc && typeKey && m.tc === typeKey).map((m) => m.img);
    if (candidates.length === 0) {
      const byPhase = mapped.filter((m) => m.pi != null && m.pi === phase.phaseIndex).map((m) => m.img);
      if (byPhase.length > 0) candidates = byPhase;
    }
    if (candidates.length === 0) {
      const withPi = mapped.filter((m) => m.pi != null).map((m) => m.img);
      if (withPi.length > 0) candidates = withPi;
    }
    if (candidates.length === 0) candidates = flatImages.slice();

    // Sort by phaseIndex when available for stable ordering.
    const sorted = candidates.slice().sort((a, b) => {
      const ai = a.phaseIndex != null ? Number(a.phaseIndex) : Number.MAX_SAFE_INTEGER;
      const bi = b.phaseIndex != null ? Number(b.phaseIndex) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    const n = sorted.length;
    if (n === 0) return [];

    // Find a current position in the sorted list (match phaseIndex when possible).
    const curPos = sorted.findIndex((im) => Number(im.phaseIndex ?? -999) === Number(phase.phaseIndex ?? -999));
    const pos = curPos >= 0 ? curPos : 0;
    const startPos = (pos - Math.floor(n / 2) + n) % n;
    const rotated = sorted.slice(startPos).concat(sorted.slice(0, startPos));

    const baseIndexes = sorted.map((im, idx) => (im.phaseIndex != null ? Number(im.phaseIndex) : idx + 1));
    const rotatedIndexes = baseIndexes.slice(startPos).concat(baseIndexes.slice(0, startPos));

    return rotated.map((img, i) => ({ dataUrl: img.dataUrl, typeCode: img.typeCode, originalIndex: rotatedIndexes[i] - 1, isCurrent: Number(img.phaseIndex ?? -999) === Number(phase.phaseIndex ?? -999) }));
  }

  const displayedImages = React.useMemo(() => {
    if (!phase) return [];
    return selectImagesForPhase(phase, imagesByType, images);
  }, [phase, imagesByType, images]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!phase) return <div className="p-6">Waiting for schedule data...</div>;

  return (
    <Box component="main" sx={{ minHeight: '100vh', py: 6, bgcolor: 'background.body', display: 'flex', justifyContent: 'center' }}>
      <Sheet variant="outlined" sx={{ width: '100%', maxWidth: 1200, p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
          <Box>
            <Typography level="title-lg">Traffic Live Viewer</Typography>
            <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>{fileURL ?? "No URL"}</Typography>
          </Box>

          <Box sx={{ textAlign: 'right' }}>
            <Typography level="title-md" sx={{ color: 'success.plainColor' }}>{phase.phaseType}</Typography>
            <Typography level="body-md">分相 {phase.phaseIndex}</Typography>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>剩餘 {phase.remainingSeconds}s</Typography>
          </Box>
        </Stack>

        <Box sx={{ mb: 3 }}>
          <Typography level="body-md" sx={{ mb: 1 }}>Phase Type: {phase.phaseType ?? "(unknown)"}</Typography>

          {displayedImages.length > 0 ? (
            <Box ref={imageRowRef} sx={{ display: 'flex', gap: 2, alignItems: 'center', overflowX: 'auto', py: 1 }}>
              {displayedImages.map(({ dataUrl, typeCode, originalIndex, isCurrent }, i) => {
                return (
                  <Box
                    key={`${typeCode ?? 't'}-${originalIndex}-${i}`}
                    sx={{
                      flex: '0 0 auto',
                      position: 'relative',
                      transform: isCurrent ? 'scale(1.05)' : 'scale(0.97)',
                      opacity: isCurrent ? 1 : 0.5,
                      filter: isCurrent ? 'none' : 'grayscale(20%) brightness(0.85)',
                      transition: 'transform .2s, opacity .2s, filter .2s',
                    }}
                  >
                    {/* index badge top-left */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        zIndex: 10,
                        bgcolor: isCurrent ? 'success.softBg' : 'background.surface',
                        color: isCurrent ? 'success.plainColor' : 'text.primary',
                        px: 0.6,
                        py: 0.3,
                        borderRadius: '6px',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                      }}
                    >
                      {originalIndex + 1}
                    </Box>

                    <img
                      src={dataUrl}
                      alt={String(typeCode ?? '')}
                      style={{
                        width: isCurrent ? 208 : 112,
                        height: isCurrent ? 208 : 112,
                        objectFit: 'contain',
                        borderRadius: 8,
                        boxShadow: isCurrent ? '0 8px 20px rgba(0,0,0,0.12)' : 'none',
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Typography level="body-sm" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>No images found for current type</Typography>
          )}
        </Box>

        <Box sx={{ mt: 3 }}>
          <Button variant="solid" color="primary" onClick={() => router.push('/')}>Back</Button>
        </Box>
      </Sheet>
    </Box>
  );
}

/* Phase calculator copied from parser logic */
function computeCurrentPhase(
  time: string,
  dayOfWeek: number,
  typeMap: Record<string, TrafficLightTimings>,
  scheduleMap: TrafficLightSchedule
): PhaseInfo {
  // scheduleMap maps dayOfWeek -> array of schedule entries { time, type }
  // where `type` is a typeCode (e.g. '01', 'X3') that references a definition in typeMap.
  const schedule = scheduleMap[dayOfWeek];
  if (!schedule || schedule.length === 0)
    return { phaseType: "", phaseIndex: -1, remainingSeconds: 0 };

  let currentTimingType = schedule[0].timingType;
  for (const s of schedule) {
    if (time >= s.time) currentTimingType = s.timingType;
    else break;
  }

  const type = typeMap[currentTimingType];
  if (!type) return { phaseType: "", phaseIndex: -1, remainingSeconds: 0 };

  const [h, m, s] = time.split(":").map(Number);
  const totalSeconds = h * 3600 + m * 60 + (s || 0);

  // find when this type started (last schedule entry with same type)
  const lastEntry = [...schedule].reverse().find((e: any) => e.type === currentTimingType);
  const [startH, startM] = (lastEntry?.time ?? "00:00").split(":").map(Number);
  const startSec = startH * 3600 + startM * 60;

  const elapsed = ((totalSeconds - startSec - (type.offset ?? 0)) % (type.period || 1) + (type.period || 1)) % (type.period || 1);

  let sum = 0;
  for (let i = 0; i < (type.phaseDurations || []).length; i++) {
    sum += type.phaseDurations[i];
    if (elapsed < sum)
      return {
        phaseType: type.phaseType ?? "",
        phaseIndex: i,
        remainingSeconds: Math.max(0, Math.floor(sum - elapsed)),
      };
  }

  return {
    phaseType: type.phaseType ?? "",
    phaseIndex: (type.phaseDurations || []).length - 1,
    remainingSeconds: 0,
  };
}
