export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDocumentProxy, extractImages, extractText } from "unpdf";
import { PNG } from "pngjs";
import { parseTrafficLightPDF } from "@/lib/trafficParser";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  // Allow shorthand 'id' parameter (e.g. id=SIZTZ10) which maps to a standard PDF path
  const id = new URL(req.url).searchParams.get("id");
  const PDF_BASE = "https://www.ttcx.dot.gov.taipei/cpt/api/TimingPlan/pdf/";
  let pdfUrl = url;
  if (!pdfUrl && id) pdfUrl = `${PDF_BASE}${id}`;
  if (!pdfUrl) return NextResponse.json({ error: "Missing ?url= or ?id=" }, { status: 400 });

  try {
  const res = await fetch(pdfUrl as string);
    if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();

    // Always pass Uint8Array
    const bytes = new Uint8Array(arrayBuffer);

    // Try extracting text first (extractText may return totalPages + page text)
    let text: string[] | string | undefined;
    let totalPages = 0;
    try {
      // Pass a copy of the bytes to avoid having the original ArrayBuffer detached
      // by extractText if it uses transferable objects internally.
      const extracted = await extractText(bytes.slice());
      text = (extracted && (extracted as any).text) || undefined;
      totalPages = (extracted && (extracted as any).totalPages) || 0;
    } catch {
      text = undefined;
      totalPages = 0;
    }

  // Pass a copy of the underlying buffer to parsing to avoid detaching the
  // original bytes when extractText is called internally.
  const { timingMap, scheduleMap } = await parseTrafficLightPDF(bytes.slice().buffer);
  const images: Array<{ page: number; key: string; dataUrl: string }> = [];
  const imagesByPage: Record<number, Array<{ page: number; key: string; dataUrl: string }>> = {};

    // unpdf's extractImages can accept the raw bytes as first argument to avoid passing
    // a PDFDocumentProxy object (which may be non-cloneable in some runtimes).
    // If extractText didn't report totalPages, try to fall back to a pdf proxy for page count.
    if (!totalPages) {
      try {
        const pdf = await getDocumentProxy(bytes);
        totalPages = (pdf as any)?.numPages || 0;
      } catch {
        totalPages = 0;
      }
    }

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Pass a fresh ArrayBuffer for each call to avoid transferring or detaching the
      // original buffer into worker internals.
      const pageImages = await extractImages(bytes.slice().buffer, pageNum);
      imagesByPage[pageNum] = [];
      for (let i = 0; i < (pageImages || []).length; i++) {
        const img = pageImages[i];
        const png = new PNG({ width: img.width, height: img.height });
        const src = new Uint8Array(img.data.buffer ?? img.data);
        if (src.length === png.data.length) png.data.set(src);
        else if (src.length === img.width * img.height * 3) {
          for (let p = 0, q = 0; p < src.length; p += 3, q += 4) {
            png.data[q] = src[p];
            png.data[q + 1] = src[p + 1];
            png.data[q + 2] = src[p + 2];
            png.data[q + 3] = 255;
          }
        }
        const out = PNG.sync.write(png);
        const imgObj = {
          page: pageNum,
          key: `${pageNum}-${i}`,
          dataUrl: `data:image/png;base64,${Buffer.from(out).toString("base64")}`,
        };
        images.push(imgObj);
        imagesByPage[pageNum].push(imgObj);
      }
    }

  // Heuristically assign typeCode and phaseIndex to images using page text.
  // We'll keep internal metadata, but the API response will only expose the fields
  // the client needs (dataUrl, typeCode, phaseIndex).
  const imagesWithMeta: Array<any> = images.map((img) => ({ ...img, text: undefined, typeCode: undefined, phaseIndex: undefined }));

  if (text && Array.isArray(text)) {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageText = text[pageNum - 1] || "";

        // Build a linear sequence of (typeCode, phaseIndex) by scanning tokens in order.
        // Rule: when we encounter a '分相' token, the type code is the token immediately
        // before the first '分相' occurrence (as your PDF shows: "36 分相：01 ...").
        const tokens = pageText.split(/\s+/).map((t) => t.trim()).filter(Boolean);
        const typeCodeRegex = /^[A-Z0-9]{2}$/i;
        const seq: Array<{ typeCode?: string; phaseIndex?: number }> = [];
        let currentType: string | undefined = undefined;
        const typeSeenThisBlock: Record<string, number> = {};

        for (let ti = 0; ti < tokens.length; ti++) {
          const tok = tokens[ti];
          // Normalize tok for matching '分相' variants like '分相：01' or '分相:01'
          const match = tok.match(/^分相\s*[:：]?\s*(\d{1,2})?$/);
          if (match) {
            // If this is the first 分相 after a potential type token, look back one token
            if (ti > 0) {
              const prev = tokens[ti - 1];
              if (typeCodeRegex.test(prev)) {
                currentType = prev.toUpperCase();
                typeSeenThisBlock[currentType] = 0;
              }
            }
            // increment counter for this currentType
            if (!currentType) {
              // if still no type, leave undefined
              seq.push({ typeCode: undefined, phaseIndex: undefined });
            } else {
              typeSeenThisBlock[currentType] = (typeSeenThisBlock[currentType] || 0) + 1;
              seq.push({ typeCode: currentType, phaseIndex: typeSeenThisBlock[currentType] });
            }
            continue;
          }
          // Also accept tokens like '分相：01' that include the number — handled above by match
        }

        const pageImagesArr = imagesByPage[pageNum] || [];
        for (let i = 0; i < pageImagesArr.length; i++) {
          const assigned = seq[i];
          const pimg = pageImagesArr[i];
          const globalImg = imagesWithMeta.find((g) => g.key === pimg.key && g.page === pimg.page);
          if (globalImg) {
            // keep internal page-level text for debugging if desired, but don't expose in API
            globalImg._pageText = pageText;
            if (assigned) {
              globalImg.typeCode = assigned.typeCode;
              globalImg.phaseIndex = assigned.phaseIndex;
            }
          }
        }
      }
    } else {
      for (const g of imagesWithMeta) g._pageText = undefined;
    }

    // Build a simplified images output grouped by typeCode.
    // Each entry will be an array of full data URLs (e.g. data:image/png;base64,...).
    const imagesByType: Record<string, string[]> = {};
    for (const g of imagesWithMeta) {
      const key = (g.typeCode || "unknown") as string;
      const dataUrl = String(g.dataUrl || "");
      (imagesByType[key] = imagesByType[key] || []).push(dataUrl);
    }

    return NextResponse.json({  timingMap, scheduleMap, images: imagesByType });
  } catch (err: any) {
    console.error("extract error:", err?.stack || err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
