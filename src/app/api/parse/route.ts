import { NextResponse } from "next/server";
import { parseTrafficLightPDF } from "@/lib/trafficParser";

// POST → handle file uploads
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const data = await parseTrafficLightPDF(buffer);
  return NextResponse.json(data);
}

// GET → handle remote PDF via URL parameter
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pdfUrl = searchParams.get("url");

  if (!pdfUrl) {
    return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch PDF: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const data = await parseTrafficLightPDF(arrayBuffer);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
