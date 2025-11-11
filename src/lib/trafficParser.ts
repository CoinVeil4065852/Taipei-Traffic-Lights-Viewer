import { extractText } from "unpdf";

export interface TrafficLightType {
    period: number;
    offset: number;
    direction: number;
    phase: string;
    phaseDurations: number[];
}

export interface ScheduleEntry {
    time: string;
    type: string;
}

export type TrafficLightTypeMap = Record<string, TrafficLightType>;
export type TrafficLightSchedule = Record<number, ScheduleEntry[]>;

const safe = (arr: string[], i: number) => (arr[i] ? arr[i].trim() : "");

/**
 * Step 1: Convert a PDF into an array of tokenized rows
 */
export async function pdfToArray(arrayBuffer: ArrayBuffer): Promise<string[][]> {
    const { text } = await extractText(arrayBuffer);
    const pages = Array.isArray(text) ? text : [text];

    const allRows: string[][] = pages.flatMap((page) =>
        page
            .split(/\r?\n/)
            .map((line) =>
                line
                    .trim()
                    .replace(/\s+/g, " ")
                    .split(" ")
                    .filter(Boolean)
            )
            .filter((row) => row.length > 0)
    );

    return allRows;
}

/**
 * Step 2: Parse schedule and type definitions
 * Logic: in a paired 時間/時制 block, find the first column that is NOT a time
 * → everything after that belongs to the type definition section.
 */
export async function parseTrafficLightPDF(
    arrayBuffer: ArrayBuffer
): Promise<{ typeMap: TrafficLightTypeMap; scheduleMap: TrafficLightSchedule }> {
    const rawData = await pdfToArray(arrayBuffer);

    const typeMap: TrafficLightTypeMap = {};
    const scheduleMap: TrafficLightSchedule = {
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
        7: [],
    };

    for (let i = 0; i < rawData.length - 1; i++) {
        const upper = rawData[i];
        const lower = rawData[i + 1];
        

        if (!upper || !lower) continue;

        if (safe(upper, 0) !== "時間" || safe(lower, 0) !== "時制") continue;

        // --- find where the times stop
        let boundary = 1;
        while (boundary < upper.length && /^\d{2}:\d{2}$/.test(safe(upper, boundary))) {
            boundary++;
        }
        

        // --- schedule part (left)
        for (let day = 1; day < boundary; day++) {
            const time = safe(upper, day);
            const type = safe(lower, day);
            if (/^\d{2}:\d{2}$/.test(time) && /^\d{2}$/.test(type)) {
                scheduleMap[day].push({ time, type });
            }
        }

        // --- type definition part (right)
        const rawTypeCode = safe(upper, boundary); // e.g. "01" or "A3"
        const typeCode = rawTypeCode.toUpperCase();
        
        // Accept two-character alphanumeric type codes (e.g. '01','36','A3','D8','F0')
        if (/^[A-Z0-9]{2}$/.test(typeCode)) {
            const period = parseInt(safe(upper, boundary+1), 10) || 0;
            const offset = parseInt(safe(upper, boundary + 2), 10) || 0;
            const direction = parseInt(safe(upper, boundary + 3), 10) || 0;
            const phase = safe(upper, boundary + 4);
            const phaseDurations: number[] = [];

            for (let j = boundary + 5; j < upper.length; j++) {
                const val = parseInt(safe(upper, j), 10);
                if (!isNaN(val)) phaseDurations.push(val);
            }

            typeMap[typeCode] = {
                period,
                offset,
                direction,
                phase,
                phaseDurations,
            };
        }

        i++; // skip paired 時制 row
    }

    // No secondary pass — rely on the main paired 時間/時制 parsing above.

    return { typeMap, scheduleMap };
}
