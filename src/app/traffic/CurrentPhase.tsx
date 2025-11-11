
"use client";

import React from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Typography from "@mui/joy/Typography";

interface DisplayImg {
	dataUrl: string;
	typeCode?: string | null;
	originalIndex: number;
	isCurrent: boolean;
}

interface CurrentPhaseProps {
	urlLabel?: string | null;
	phase: any | null;
	displayedImages: DisplayImg[];
	imageRowRef?: React.RefObject<HTMLDivElement>;
	imagesCount: number;
	typesCount: number;
	onBack: () => void;
}

export default function CurrentPhase({ urlLabel, phase, displayedImages, imageRowRef, imagesCount, typesCount, onBack }: CurrentPhaseProps) {
	return (
		<>
			<Box sx={{ mb: 3 }}>
				<Typography level="body-md" sx={{ mb: 1 }}>Phase Type: {phase?.phaseType ?? "(unknown)"}</Typography>

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

			<Typography level="body-xs" sx={{ mt: 2, color: 'text.tertiary' }}>Images total: {imagesCount} · Types: {typesCount}</Typography>

			<Box sx={{ mt: 3 }}>
				<Button variant="solid" color="primary" onClick={onBack}>Back</Button>
			</Box>
		</>
	);
}
