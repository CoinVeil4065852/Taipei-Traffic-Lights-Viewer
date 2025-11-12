import { extractText } from "unpdf";

export interface TrafficLightTimings {
    period: number;
    offset: number;
    direction: number;
    phaseType: string;
    phaseDurations: number[];
}

export interface ScheduleEntry {
    time: string;
    timingType: string;
}

export type TrafficLightTimingMap = Record<string, TrafficLightTimings>;
export type TrafficLightSchedule = Record<number, ScheduleEntry[]>;

const safe = (arr: string[], i: number) => (arr[i] ? arr[i].trim() : "");

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

export async function parseTrafficLightPDF(
    arrayBuffer: ArrayBuffer
): Promise<{ timingMap: TrafficLightTimingMap; scheduleMap: TrafficLightSchedule }> {
    const rawData = await pdfToArray(arrayBuffer);

    const timingMap: TrafficLightTimingMap = {};
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
            const timingType = safe(lower, day);
            if (/^\d{2}:\d{2}$/.test(time) && /^\d{2}$/.test(timingType)) {
                scheduleMap[day].push({ time, timingType });
            }
        }

        // --- type definition part (right)
        const rawTypeCode = safe(upper, boundary); // e.g. "01" or "A3"
        const typeCode = rawTypeCode.toUpperCase();

        // Accept two-character alphanumeric type codes (e.g. '01','36','A3','D8','F0')
        if (/^[A-Z0-9]{2}$/.test(typeCode)) {
            const period = parseInt(safe(upper, boundary + 1), 10) || 0;
            const offset = parseInt(safe(upper, boundary + 2), 10) || 0;
            const direction = parseInt(safe(upper, boundary + 3), 10) || 0;
            const phaseType = safe(upper, boundary + 4);
            const phaseDurations: number[] = [];

            for (let j = boundary + 5; j < upper.length; j++) {
                const val = parseInt(safe(upper, j), 10);
                if (!isNaN(val)) phaseDurations.push(val);
            }

            timingMap[typeCode] = {
                period,
                offset,
                direction,
                phaseType,
                phaseDurations,
            };
        }

        i++; // skip paired 時制 row
    }
    return { timingMap, scheduleMap };
}
