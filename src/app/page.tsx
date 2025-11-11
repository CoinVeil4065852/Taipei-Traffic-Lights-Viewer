"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // auto-load if ?url= is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get("url");
    if (pdfUrl) {
      setUrl(pdfUrl);
      handleParseFromUrl(pdfUrl);
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return alert("Please select a PDF file.");
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/parse", { method: "POST", body: formData });
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  const handleParseFromUrl = async (pdfUrl: string) => {
    if (!pdfUrl) return alert("Please enter a PDF URL.");
    setLoading(true);
    try {
      const res = await fetch(`/api/parse?url=${encodeURIComponent(pdfUrl)}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      alert("Failed to fetch or parse PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">🚦 Traffic Light PDF Parser</h1>

      <div className="bg-white shadow p-4 rounded w-full max-w-lg">
        <label className="block font-medium mb-1">PDF URL</label>
        <input
          type="text"
          placeholder="https://example.com/file.pdf"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border rounded w-full p-2 mb-3"
        />
        <button
          onClick={() => handleParseFromUrl(url)}
          disabled={loading || !url}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 w-full"
        >
          {loading ? "Fetching & Parsing..." : "Parse from URL"}
        </button>

        <div className="my-4 text-center text-gray-500">or</div>

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mb-2 w-full"
        />
        <button
          onClick={handleUpload}
          disabled={loading || !file}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 w-full"
        >
          {loading ? "Parsing..." : "Upload & Parse"}
        </button>
      </div>

      {data && (
        <div className="mt-6 w-full max-w-3xl bg-white p-4 rounded shadow overflow-x-auto">
          <h2 className="text-lg font-semibold mb-2">Parsed Result</h2>
          <pre className="text-xs bg-gray-50 p-2 rounded">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
