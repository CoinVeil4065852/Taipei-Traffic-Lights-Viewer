"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/joy/Box";
import Typography from "@mui/joy/Typography";
import Input from "@mui/joy/Input";
import Button from "@mui/joy/Button";
import Link from "@mui/joy/Link";

export default function HomePage() {
  const router = useRouter();
  const [value, setValue] = useState("");

  // Determine if value looks like URL
  const isUrl = (v: string) => /^https?:\/\//i.test(v);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    if (isUrl(trimmed)) {
      router.push(`/traffic?url=${encodeURIComponent(trimmed)}`);
    } else {
      // treat as id
      router.push(`/traffic?id=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.body",
        p: 3,
      }}
    >
      <Box sx={{ maxWidth: 800, width: "100%" }}>
        <Typography level="h2" sx={{ mb: 1 }}>
          臺北市路口號誌時制計畫 — Traffic Light Viewer
        </Typography>

        <Typography level="body-md" sx={{ mb: 2, color: "text.secondary" }}>
          Enter an ID or a URL pointing to a PDF. If the input starts with
          "http" it will be treated as a PDF URL; otherwise it's treated as an
          ID. After submission you'll be taken to the traffic page which will
          try to calculate the current signal state using the
          臺北市路口號誌時制計畫 dataset.
        </Typography>

        <Typography level="body-md" sx={{ mb: 2 }}>
          Data source: <Link href="https://data.taipei/dataset/detail?id=0d639f73-cbcc-42c3-aa53-20efac199701" target="_blank">臺北市路口號誌時制計畫</Link>.
          You can also open the Google My Maps viewer and directly select
          traffic lights on the map: <Link href="https://www.google.com/maps/d/viewer?mid=1mN13mLL32D_MphXTMgucnNiT3h0aDE4&ll" target="_blank">Google My Maps</Link>.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 2 }}>
          <Input
            placeholder="Enter ID or PDF URL"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            sx={{ flex: 1 }}
            aria-label="id-or-url"
          />
          <Button type="submit" variant="solid">
            Go
          </Button>
        </Box>

        <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
          Tip: paste a URL like https://example.com/file.pdf or an ID from the
          dataset. After you submit I will open the traffic page where we can
          continue building the traffic-light calculation.
        </Typography>
      </Box>
    </Box>
  );
}
